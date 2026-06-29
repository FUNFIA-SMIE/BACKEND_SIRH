const express = require('express');
const router = express.Router();
const db = require('../../config/db.config'); // Import de ton sv de connexion pg
const multer = require('multer');

// Configuration de multer pour les fichiers
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Dossier où sauvegarder les fichiers
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// 1. LISTER TOUS LES EMPLOYÉS (avec jointures Poste et Département)
// GET /employes
router.get('/', async (req, res) => {
    try {
        const sql = `
            SELECT *,e.id AS employe_id,d.nom AS nom_departement,p.intitule AS intitule_poste, e.nom AS nom_employe, e.prenom AS prenom_employe
            FROM employe e
            LEFT JOIN departement d ON e.departement_id = d.id
            LEFT JOIN poste p ON e.poste_id = p.id
            ORDER BY e.created_at DESC;
        `;
        const result = await db.query(sql);
        res.json(result.rows);
    } catch (err) {
        console.log("ERREUR COMPLÈTE :", JSON.stringify(err, null, 2));
        console.log("MESSAGE :", err.message);
        console.log("CODE :", err.code);
        res.status(500).json({ error: err.message });
    }
});

// 2. RÉCUPÉRER UN EMPLOYÉ PAR SON ID (UUID)
// GET /employes/:id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query('SELECT * FROM employe WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Employé non trouvé" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ error: "ID invalide ou erreur serveur" });
    }
});

// 3. CRÉER UN NOUVEL EMPLOYÉ
// POST /employes
router.post('/', async (req, res) => {
    let {
        organisation_id, matricule, civilite, nom, prenom,
        nom_usage, genre, date_naissance, lieu_naissance,
        nationalite, cin, num_securite_sociale, email_pro, email_perso, telephone_pro, telephone_perso,
        adresse, ville, code_postal, pays, departement_id, poste_id, manager_id, site_travail, statut, date_entree, date_sortie, motif_sortie, photo_url, cv_url, notes_rh
    } = req.body;

    console.log("Données reçues pour création :", req.body);

    // Si organisation_id est invalide, le mettre à null
    if (organisation_id === '1' || !organisation_id) {
        organisation_id = null;
    }

    // Convertir les chaînes vides en null pour les dates
    date_naissance = date_naissance === '' ? null : date_naissance;
    date_entree = date_entree === '' ? null : date_entree;
    date_sortie = date_sortie === '' ? null : date_sortie;

    // Normaliser le genre (mapper les valeurs possibles)
    if (genre && genre !== '') {
        const genreMap = {
            'M': 'M', 'Masculin': 'M', 'Male': 'M', 'H': 'M',
            'F': 'F', 'Féminin': 'F', 'Female': 'F', 'Femme': 'F',
            'A': 'M', 'Autre': null
        };
        genre = genreMap[genre] || null;
    } else {
        genre = null;
    }

    // Convertir les chaînes vides en null pour les clés étrangères
    departement_id = departement_id === '' ? null : departement_id;
    poste_id = poste_id === '' ? null : poste_id;
    manager_id = manager_id === '' || manager_id === null ? null : manager_id;

    // Vérifier si le manager_id existe s'il est fourni
    if (manager_id) {
        try {
            const managerCheck = await db.query('SELECT id FROM employe WHERE id = $1', [manager_id]);
            if (managerCheck.rows.length === 0) {
                manager_id = null; // Si le manager n'existe pas, le mettre à null
            }
        } catch (err) {
            console.log('Erreur lors de la vérification du manager:', err);
            manager_id = null;
        }
    }

    const sql = `
        INSERT INTO employe (
            organisation_id, matricule, civilite, nom, prenom, 
            nom_usage, genre, date_naissance, lieu_naissance, 
            nationalite, cin, num_securite_sociale, email_pro, email_perso, telephone_pro, telephone_perso,
            adresse, ville, code_postal, pays, departement_id, poste_id, manager_id, site_travail, statut, date_entree, date_sortie, motif_sortie, photo_url, cv_url, notes_rh
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31
        ) RETURNING *;
    `;

    const values = [
        "0226b11d-fa98-499c-a856-37f919df0fa5", matricule, civilite, nom, prenom,
        nom_usage, genre, date_naissance, lieu_naissance,
        nationalite, cin, num_securite_sociale, email_pro, email_perso, telephone_pro, telephone_perso,
        adresse, ville, code_postal, pays, departement_id, poste_id, manager_id, site_travail, statut, date_entree, date_sortie, motif_sortie, photo_url, cv_url, notes_rh
    ];

    try {
        const result = await db.query(sql, values);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.log('Erreur lors de l\'insertion:', err);
        if (err.code === '23505') {
            return res.status(400).json({ error: "Conflit : Le matricule, l'email ou le CIN existe déjà." });
        }
        res.status(500).json({ error: err.message });
    }
});

// 4. METTRE À JOUR UN EMPLOYÉ
// PUT /employes/:id
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    let fields = { ...req.body }; // Objet contenant les colonnes à modifier

    console.log("Données reçues pour mise à jour :", req.body);

    // Champs système non modifiables depuis le client
    const allowedFields = [
        'organisation_id', 'matricule', 'civilite', 'nom', 'prenom',
        'nom_usage', 'genre', 'date_naissance', 'lieu_naissance',
        'nationalite', 'cin', 'num_securite_sociale', 'email_pro', 'email_perso', 'telephone_pro', 'telephone_perso',
        'adresse', 'ville', 'code_postal', 'pays', 'departement_id', 'poste_id', 'manager_id', 'site_travail', 'statut', 'date_entree', 'date_sortie', 'motif_sortie', 'photo_url', 'cv_url', 'notes_rh'
    ];

    // Conserver uniquement les champs autorisés
    fields = Object.fromEntries(
        Object.entries(fields).filter(([key]) => allowedFields.includes(key))
    );

    // Si organisation_id est invalide, le mettre à null
    if (fields.organisation_id === '1' || !fields.organisation_id) {
        fields.organisation_id = null;
    }

    // Convertir les chaînes vides en null pour les dates
    if (fields.date_naissance === '') fields.date_naissance = null;
    if (fields.date_entree === '') fields.date_entree = null;
    if (fields.date_sortie === '') fields.date_sortie = null;

    // Normaliser le genre (mapper les valeurs possibles)
    if (fields.genre && fields.genre !== '') {
        const genreMap = {
            'M': 'M', 'Masculin': 'M', 'Male': 'M', 'H': 'M',
            'F': 'F', 'Féminin': 'F', 'Female': 'F', 'Femme': 'F',
            'A': 'M', 'Autre': null
        };
        fields.genre = genreMap[fields.genre] || null;
    } else if (fields.hasOwnProperty('genre')) {
        fields.genre = null;
    }

    // Convertir les chaînes vides en null pour les clés étrangères
    if (fields.departement_id === '') fields.departement_id = null;
    if (fields.poste_id === '') fields.poste_id = null;
    if (fields.manager_id === '') fields.manager_id = null;

    // Vérifier si le manager_id existe s'il est fourni
    if (fields.manager_id) {
        try {
            const managerCheck = await db.query('SELECT id FROM employe WHERE id = $1', [fields.manager_id]);
            if (managerCheck.rows.length === 0) {
                fields.manager_id = null; // Si le manager n'existe pas, le mettre à null
            }
        } catch (err) {
            console.log('Erreur lors de la vérification du manager:', err);
            fields.manager_id = null;
        }
    }

    // Construction dynamique de la requête SQL
    const keys = Object.keys(fields);
    if (keys.length === 0) return res.status(400).json({ error: "Aucun champ à modifier ou champs invalides fournis" });

    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    const values = Object.values(fields);
    values.push(id); // L'ID pour la clause WHERE

    try {
        const sql = `UPDATE employe SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;
        const result = await db.query(sql, values);
        res.json(result.rows[0]);
    } catch (err) {
        console.log('Erreur lors de la mise à jour :', err);
        res.status(500).json({ error: err.message });
    }
});


// 5. SUPPRIMER UN EMPLOYÉ
// DELETE /employes/:id
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query('DELETE FROM employe WHERE id = $1 RETURNING *', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Employé introuvable" });
        }
        res.json({ message: "Employé supprimé avec succès" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const SibApiV3Sdk = require('sib-api-v3-sdk');
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const crypto = require('crypto'); // Indispensablde pour randDDDomBytes
const bcrypt = require('bcrypt');

const apiKey = defaultClient.authentications['api-key'];

apiKey.apiKey = process.env.SENDINBLUE_API_KEY;


// 2. Utilisation de l'API Transactionnelle (et non Campaign)
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

router.post('/creation_compte_SIRH', async (req, res) => {
    const { employe_id, email_pro, prenom } = req.body;

    // Validation simple
    if (!employe_id || !email_pro) {
        return res.status(400).json({ success: false, error: "Données manquantes" });
    }

    try {
        // 1. Génération du mot de passe provisoire
        const passwordProvisoire = crypto.randomBytes(3).toString('hex').toUpperCase();
        const hashedPw = await bcrypt.hash(passwordProvisoire, 10);

        // 2. Insertion ou mise à jour en base de données
        await db.query(`
            INSERT INTO public.utilisateurs (employe_id, identifiant, mot_de_passe, est_actif)
            VALUES ($1, $2, $3, true)
            ON CONFLICT (employe_id) 
            DO UPDATE SET 
                mot_de_passe = EXCLUDED.mot_de_passe, 
                updated_at = NOW()
        `, [employe_id, email_pro, hashedPw]);

        // 3. Préparation du mail Brevo
        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = "Accès à votre application SIRH";
        sendSmtpEmail.htmlContent = `
            <html>
                <body style="font-family: sans-serif;">
                    <h1 style="color: #333;">Bonjour ${prenom},</h1>
                    <p>Votre compte a été activé. Voici vos accès pour l'application mobile :</p>
                    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px;">
                        <p><b>Identifiant :</b> ${email_pro}</p>
                        <p><b>Mot de passe provisoire :</b> <span style="color:blue; font-size:18px;">${passwordProvisoire}</span></p>
                    </div>
                    <p><i>Veuillez le modifier lors de votre première connexion.</i></p>
                </body>
            </html>`;

        // IMPORTANT : L'email sender doit être vérifié dans Brevo
        sendSmtpEmail.sender = { "name": "Service RH", "email": "informaticienfunfiasmie@gmail.com" };
        sendSmtpEmail.to = [{ "email": email_pro, "name": prenom }];

        // 4. Envoi effectif
        await apiInstance.sendTransacEmail(sendSmtpEmail);

        // 5. Réponse envoyée au Frontend Angular
        res.status(201).json({
            success: true,
            message: "Utilisateur créé et e-mail envoyé.",
            data: {
                mot_de_passe_provisoire: passwordProvisoire // Renvoi pour affichage dashboard
            }
        });

    } catch (error) {
        console.error("Erreur détaillée:", error);
        res.status(500).json({ success: false, error: "Échec de l'opération technique." });
    }
});


// GET /employes/:id
router.get('/employes_utilisateurs/:id', async (req, res) => {
    const { id } = req.params;
    const result = await db.query(`
    SELECT e.*,
      EXISTS (
        SELECT 1 FROM utilisateurs u WHERE u.employe_id = e.id
      ) AS compte_utilisateur_exists
    FROM employe e
    WHERE e.id = $1
  `, [id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Employé introuvable' });
    res.json(result.rows[0]);
});

module.exports = router;