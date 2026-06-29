const express = require('express');
const router = express.Router();
const pool = require('../../config/db.config'); // votre pool pg
const { verifierToken } = require('../conges/Auth.midleware');

// ─── UTILITAIRE : valider le QR payload ──────────────────────
const SECRET = process.env.QR_SECRET || 'FUNFIA_SMIE_2026'; // mettre dans .env

function validerQrPayload(payload) {
  const fenetreActuelle = Math.floor(Date.now() / (15 * 60 * 1000));

  // ── DEBUG ──
  console.log('=== VALIDATION QR ===');
  console.log('payload.fenetre    :', payload.fenetre);
  console.log('fenetreActuelle    :', fenetreActuelle);
  console.log('écart              :', Math.abs(payload.fenetre - fenetreActuelle));

  const signatureAttendue = Buffer.from(
    `${payload.employe_id}_${payload.fenetre}_${SECRET}`
  ).toString('base64');

  console.log('payload.signature  :', payload.signature);
  console.log('signatureAttendue  :', signatureAttendue);
  console.log('SECRET utilisé     :', SECRET?.substring(0, 6) + '...');
  console.log('=====================');
  // ── FIN DEBUG ──

  if (Math.abs(payload.fenetre - fenetreActuelle) > 1) {
    throw new Error('QR Code expiré');
  }
  const signatureAttendue2 = Buffer.from(
    `${payload.employe_id}_${payload.fenetre}_${SECRET}`
  ).toString('base64');
  if (payload.signature !== signatureAttendue2) {
    throw new Error('Signature QR invalide');
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/pointages
// Retourne les pointages d'un employé pour le mois en cours
// Query params : employe_id (obligatoire), depuis (optionnel, ISO date)
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { employe_id, depuis } = req.query;

  if (!employe_id) {
    return res.status(400).json({ message: 'employe_id requis' });
  }

  try {
    // Par défaut : début du mois courant
    const dateDebut = depuis
      ? new Date(depuis)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const result = await pool.query(
      `SELECT
         p.id,
         p.employe_id,
         p.type,
         p.heure         AS date_heure,
         p.scanne_par,
         p.conge_id,
         p.created_at,
         e.nom,
         e.prenom
       FROM pointages p
       JOIN employe e ON e.id = p.employe_id
       WHERE p.employe_id = $1
         AND p.heure >= $2
       ORDER BY p.heure DESC`,
      [employe_id, dateDebut]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('GET /pointages :', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/pointages
// Enregistre un pointage après scan du QR code
// Body : { employe_id, scanne_par, qr_payload }
// ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { employe_id, scanne_par, qr_payload } = req.body;

  console.log(req.body)

  if (!employe_id || !scanne_par || !qr_payload) {
    return res.status(400).json({ message: 'Champs manquants : employe_id, scanne_par, qr_payload' });
  }

  try {
    // 1. Valider le QR code
    validerQrPayload(qr_payload);

    // 2. Vérifier que l'employé existe et est actif
    const employeResult = await pool.query(
      `SELECT e.id, e.nom, e.prenom,
          p.intitule AS poste,
          u.est_actif
   FROM employe e
   JOIN utilisateurs u ON u.employe_id = e.id
   LEFT JOIN poste p ON p.id = e.poste_id
   WHERE e.id = $1`,
      [employe_id]
    );

    if (employeResult.rowCount === 0) {
      return res.status(404).json({ message: 'Employé introuvable' });
    }

    const employe = employeResult.rows[0];

    if (!employe.est_actif) {
      return res.status(403).json({ message: 'Compte employé inactif' });
    }

    // 3. Déterminer automatiquement le type : entree ou sortie
    //    Règle : si le dernier pointage est une entrée → on fait une sortie, sinon une entrée
    const dernierResult = await pool.query(
      `SELECT type FROM pointages
       WHERE employe_id = $1
       ORDER BY heure DESC
       LIMIT 1`,
      [employe_id]
    );

    const dernierType = dernierResult.rows[0]?.type || null;
    const type = (!dernierType || dernierType === 'entree') ? 'sortie' : 'entree';
    // 4. Anti-doublon : bloquer si un pointage du même type existe dans les 2 dernières minutes
    const doublonResult = await pool.query(
      `SELECT id FROM pointages
       WHERE employe_id = $1
         AND type = $2
         AND heure > NOW() - INTERVAL '2 minutes'`,
      [employe_id, type]
    );

    if (doublonResult.rowCount > 0) {
      return res.status(409).json({
        message: `Pointage en double détecté. Un(e) ${type} a déjà été enregistré(e) récemment.`
      });
    }

    // 5. Insérer le pointage
    const insertResult = await pool.query(
      `INSERT INTO pointages (employe_id, type, heure, scanne_par)
       VALUES ($1, $2, NOW(), $3)
       RETURNING id, employe_id, type, heure AS date_heure, scanne_par, created_at`,
      [employe_id, type, scanne_par]
    );

    const pointage = insertResult.rows[0];

    // 6. Retourner le pointage + infos employé
    res.status(201).json({
      pointage,
      employe: {
        id: employe.id,
        nom: employe.nom,
        prenom: employe.prenom,
        poste: employe.poste || null,
      }
    });

  } catch (err) {
    if (err.message === 'QR Code expiré' || err.message === 'Signature QR invalide') {
      return res.status(422).json({ message: err.message });
    }
    console.error('POST /pointages :', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/pointages/resume/:employe_id
// Résumé mensuel : nb entrées, nb sorties, total heures
// ─────────────────────────────────────────────────────────────
router.get('/resume/:employe_id', async (req, res) => {
  const { employe_id } = req.params;

  try {
    const debutMois = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const result = await pool.query(
      `SELECT type, heure
       FROM pointages
       WHERE employe_id = $1 AND heure >= $2
       ORDER BY heure ASC`,
      [employe_id, debutMois]
    );

    const pointages = result.rows;
    const entrees = pointages.filter(p => p.type === 'entree');
    const sorties = pointages.filter(p => p.type === 'sortie');

    // Calcul heures travaillées (paires entree/sortie)
    let totalMs = 0;
    for (let i = 0; i < Math.min(entrees.length, sorties.length); i++) {
      const diff = new Date(sorties[i].heure) - new Date(entrees[i].heure);
      if (diff > 0) totalMs += diff;
    }

    const totalHeures = totalMs / (1000 * 3600);

    res.json({
      nb_entrees: entrees.length,
      nb_sorties: sorties.length,
      total_heures: Math.round(totalHeures * 100) / 100,
      heures_max: 4,
      heures_restantes: Math.max(0, Math.round((4 - totalHeures) * 100) / 100),
    });

  } catch (err) {
    console.error('GET /pointages/resume :', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/pointages/:id
// Supprimer un pointage (admin seulement)
// ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM pointages WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Pointage introuvable' });
    }

    res.json({ message: 'Pointage supprimé', id });
  } catch (err) {
    console.error('DELETE /pointages :', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;