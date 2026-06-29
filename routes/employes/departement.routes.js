const express = require('express');
const router = express.Router();
const db = require('../../config/db.config'); // Import de ton pool de connexion pg

// LISTER LES DÉPARTEMENTS (avec nom du parent et du responsable)
router.get('/', async (req, res) => {
    try {
        const sql = `
            SELECT e.*,d1.id,d1.nom AS nom_departement, d2.nom AS nom_parent, e.nom AS nom_responsable, e.prenom AS prenom_responsable
            FROM departement d1
            LEFT JOIN departement d2 ON d1.parent_id = d2.id
            LEFT JOIN employe e ON d1.responsable_id = e.id
            ORDER BY d1.nom ASC;
        `;
        const result = await db.query(sql);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', async (req, res) => {
  try {
    const sql = `
      SELECT 
        d1.id,
        d1.code,
        d1.nom,
        d1.parent_id,
        d1.responsable_id,
        d1.budget_annuel,
        d1.effectif_max,

        d2.nom AS nom_parent,
        e.nom AS nom_responsable,
        e.prenom AS prenom_responsable

      FROM departement d1
      LEFT JOIN departement d2 ON d1.parent_id = d2.id
      LEFT JOIN employe e ON d1.responsable_id = e.id
      WHERE d1.id = $1
    `;

    const result = await db.query(sql, [req.params.id]);

    // ✅ retourner UN seul objet
    res.json(result.rows[0]);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// CRÉER UN DÉPARTEMENT
router.post('/', async (req, res) => {
    let { organisation_id, parent_id, code, nom, description, responsable_id, budget_annuel, effectif_max } = req.body;

    // Convertir les chaînes vides en null pour les UUIDs
    organisation_id = organisation_id === '' ? null : organisation_id;
    parent_id = parent_id === '' ? null : parent_id;
    responsable_id = responsable_id === '' ? null : responsable_id;

    try {
        const sql = `
            INSERT INTO departement (organisation_id, parent_id, code, nom, description, responsable_id, budget_annuel, effectif_max)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;
        `;
        const values = [organisation_id, parent_id, code, nom, description, responsable_id, budget_annuel, effectif_max];
        const result = await db.query(sql, values);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.log(err);
        res.status(400).json({ error: err.message });
    }
});

// MODIFIER (PATCH)
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    let fields = { ...req.body };

    // Champs autorisés pour la mise à jour
    const allowedFields = ['organisation_id', 'parent_id', 'code', 'nom', 'description', 'responsable_id', 'budget_annuel', 'effectif_max'];

    // Conserver uniquement les champs autorisés
    fields = Object.fromEntries(
        Object.entries(fields).filter(([key]) => allowedFields.includes(key))
    );

    // Convertir les chaînes vides en null pour les UUIDs
    if (fields.organisation_id === '') fields.organisation_id = null;
    if (fields.parent_id === '') fields.parent_id = null;
    if (fields.responsable_id === '') fields.responsable_id = null;

    const keys = Object.keys(fields);
    if (keys.length === 0) return res.status(400).json({ error: "Aucun champ à modifier ou champs invalides fournis" });

    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    const values = Object.values(fields);
    values.push(id);

    try {
        const sql = `UPDATE departement SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;
        const result = await db.query(sql, values);
        res.json(result.rows[0]);
    } catch (err) {
        console.log('Erreur lors de la mise à jour :', err);
        res.status(500).json({ error: err.message });
    }
});

// SUPPRIMER
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM departement WHERE id = $1', [req.params.id]);
        res.json({ message: "Département supprimé" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;