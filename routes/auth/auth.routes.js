const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../../config/db.config'); // Import de ton sv de connexion pg

const JWT_SECRET = process.env.JWT_SECRET || 'ton_secret_jwt_ici';
const JWT_EXPIRES_IN = '8h'; // durée du token

// ─────────────────────────────────────────────────────────────────────────────
// Middleware — vérifier le token JWT
// ─────────────────────────────────────────────────────────────────────────────
const verifierToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Token manquant. Accès refusé.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.utilisateur = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token invalide ou expiré.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/login
// Body : { identifiant, mot_de_passe }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { identifiant, mot_de_passe } = req.body;

  if (!identifiant || !mot_de_passe) {
    return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
  }

  try {
    // 1. Récupérer l'utilisateur + les infos de l'employé associé
    const result = await db.query(`
      SELECT
        u.id,
        u.employe_id,
        u.identifiant,
        u.mot_de_passe,
        u.est_actif,
        e.poste_id,
        e.nom,
        e.prenom,
        e.email_pro,
        e.photo_url,
        e.matricule,
        e.statut AS statut_employe
      FROM utilisateurs u
      INNER JOIN employe e ON e.id = u.employe_id
      WHERE u.identifiant = $1
    `, [identifiant]);

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    }

    const utilisateur = result.rows[0];
    // 2. Vérifier si le compte est actif
    if (!utilisateur.est_actif) {
      return res.status(403).json({ error: 'Compte désactivé. Contactez votre administrateur.' });
    }

    // 3. Vérifier si l'employé est actif
    if (utilisateur.statut_employe !== 'actif') {
      return res.status(403).json({ error: 'Votre compte employé est inactif.' });
    }

    // 4. Vérifier le mot de passe (bcrypt)
    const motDePasseValide = await bcrypt.compare(mot_de_passe, utilisateur.mot_de_passe);
    if (!motDePasseValide) {
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    }

    // 5. Mettre à jour la dernière connexion
    await db.query(`
      UPDATE utilisateurs
      SET derniere_connexion = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [utilisateur.id]);

    // 6. Générer le token JWT
    const payload = {
      id:          utilisateur.id,
      employe_id:  utilisateur.employe_id,
      identifiant: utilisateur.identifiant,
      nom:         utilisateur.nom,
      prenom:      utilisateur.prenom,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // 7. Réponse
    return res.status(200).json({
      message: 'Connexion réussie.',
      token,
      utilisateur: {
        id:          utilisateur.id,
        employe_id:  utilisateur.employe_id,
        identifiant: utilisateur.identifiant,
        nom:         utilisateur.nom,
        prenom:      utilisateur.prenom,
        email_pro:   utilisateur.email_pro,
        photo_url:   utilisateur.photo_url,
        matricule:   utilisateur.matricule,
        poste_id:    utilisateur.poste_id,
      },
    });

  } catch (err) {
    console.error('Erreur login :', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/logout
// Header : Authorization: Bearer <token>
// ─────────────────────────────────────────────────────────────────────────────
router.post('/logout', verifierToken, async (req, res) => {
  // Avec JWT stateless, le logout est géré côté client (supprimer le token)
  // Ici on met juste à jour updated_at pour tracer la déconnexion
  try {
    await db.query(`
      UPDATE utilisateurs
      SET updated_at = NOW()
      WHERE id = $1
    `, [req.utilisateur.id]);

    return res.status(200).json({ message: 'Déconnexion réussie.' });
  } catch (err) {
    console.error('Erreur logout :', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/me  — récupérer le profil connecté
// Header : Authorization: Bearer <token>
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', verifierToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        u.id,
        u.employe_id,
        u.identifiant,
        u.est_actif,
        u.derniere_connexion,
        e.nom,
        e.prenom,
        e.email_pro,
        e.photo_url,
        e.matricule,
        e.departement_id,
        e.poste_id
      FROM utilisateurs u
      INNER JOIN employe e ON e.id = u.employe_id
      WHERE u.id = $1
    `, [req.utilisateur.id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur /me :', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/changer-mot-de-passe
// Header : Authorization: Bearer <token>
// Body   : { ancien_mot_de_passe, nouveau_mot_de_passe }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/changer-mot-de-passe', verifierToken, async (req, res) => {
  const { ancien_mot_de_passe, nouveau_mot_de_passe } = req.body;

  if (!ancien_mot_de_passe || !nouveau_mot_de_passe) {
    return res.status(400).json({ error: 'Les deux mots de passe sont requis.' });
  }

  if (nouveau_mot_de_passe.length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
  }

  try {
    const result = await db.query(
      'SELECT mot_de_passe FROM utilisateurs WHERE id = $1',
      [req.utilisateur.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const ancienValide = await bcrypt.compare(ancien_mot_de_passe, result.rows[0].mot_de_passe);
    if (!ancienValide) {
      return res.status(401).json({ error: 'Ancien mot de passe incorrect.' });
    }

    const hash = await bcrypt.hash(nouveau_mot_de_passe, 10);
    await db.query(`
      UPDATE utilisateurs
      SET mot_de_passe = $1, updated_at = NOW()
      WHERE id = $2
    `, [hash, req.utilisateur.id]);

    return res.status(200).json({ message: 'Mot de passe modifié avec succès.' });
  } catch (err) {
    console.error('Erreur changement mot de passe :', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
module.exports.verifierToken = verifierToken;