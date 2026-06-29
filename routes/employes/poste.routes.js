const express = require('express');
const router = express.Router();
const db = require('../../config/db.config'); // Import de ton pool de connexion pg

// LISTER LES POSTES
router.get('/', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM poste ORDER BY intitule ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM poste WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Poste non trouvé' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CRÉER UN POSTE (Gestion du JSONB pour les compétences)
router.post('/', async (req, res) => {
    
    const { 
        organisation_id, code, intitule, famille_metier, 
        classification, niveau, salaire_min, salaire_max, 
        description, competences_requises 
    } = req.body;

    console.log(req.body)

    
    try {
        const sql = `
            INSERT INTO poste (
                organisation_id, code, intitule, famille_metier, 
                classification, niveau, salaire_min, salaire_max, 
                description, competences_requises
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *;
        `;
        const values = [
            organisation_id, code, intitule, famille_metier, 
            classification, niveau, salaire_min, salaire_max, 
            description, JSON.stringify(competences_requises || [])
        ];
        
        const result = await db.query(sql, values);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.log(err)

        res.status(400).json({ error: err.message });
    }
});

// MODIFIER UN POSTE
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const fields = req.body;
    
    if (fields.competences_requises) {
        fields.competences_requises = JSON.stringify(fields.competences_requises);
    }

    const keys = Object.keys(fields);
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    const values = Object.values(fields);
    values.push(id);

    try {
        const sql = `UPDATE poste SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;
        const result = await db.query(sql, values);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SUPPRIMER UN POSTE
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM poste WHERE id = $1', [req.params.id]);
        res.json({ message: "Poste supprimé" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
/*

var SibApiV3Sdk = require('sib-api-v3-sdk');
var defaultClient = SibApiV3Sdk.ApiClient.instance;
var apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = 'YOUR_API_V3_KEY';
var apiInstance = new SibApiV3Sdk.EmailCampaignsApi();
var emailCampaigns = new SibApiV3Sdk.CreateEmailCampaign();

*/