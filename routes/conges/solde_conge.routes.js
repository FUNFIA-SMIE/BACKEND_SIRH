const express = require('express');
const router = express.Router();
const db = require('../../config/db.config'); // Ton fichier modifié


router.post('/', async (req, res) => {
    const {
        employe_id,
        type_conge_id,
        annee,
        solde_initial,
        solde_acquis,
        solde_pris,
        solde_en_attente
    } = req.body;

    // 1. Validation de base des champs obligatoires
    if (!employe_id || !type_conge_id || !annee) {
        return res.status(400).json({
            error: "Les champs employe_id, type_conge_id et annee sont obligatoires."
        });
    }

    // 2. Calcul automatique du solde restant
    // Formule logique : (Initial + Acquis) - Pris
    const initial = parseFloat(solde_initial || 0);
    const acquis = parseFloat(solde_acquis || 0);
    const pris = parseFloat(solde_pris || 0);
    const en_attente = parseFloat(solde_en_attente || 0);

    const solde_restant = (initial + acquis) - pris;

    // 3. Requête SQL avec gestion du conflit (Unique Constraint)
    const query = `
        INSERT INTO public.solde_conge (
            employe_id, type_conge_id, annee, 
            solde_initial, solde_acquis, solde_pris, 
            solde_en_attente, solde_restant
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (employe_id, type_conge_id, annee) 
        DO UPDATE SET 
            solde_initial = EXCLUDED.solde_initial,
            solde_acquis = EXCLUDED.solde_acquis,
            solde_pris = EXCLUDED.solde_pris,
            solde_en_attente = EXCLUDED.solde_en_attente,
            solde_restant = EXCLUDED.solde_restant,
            updated_at = NOW()
        RETURNING *;
    `;

    const values = [
        employe_id,
        type_conge_id,
        annee,
        initial,
        acquis,
        pris,
        en_attente,
        solde_restant
    ];

    try {
        const result = await db.query(query, values);
        // Retourne la ligne insérée ou modifiée
        return res.status(201).json({
            message: "Solde de congé enregistré avec succès.",
            data: result.rows[0]
        });
    } catch (error) {
        console.error("Erreur lors de l'ajout du solde de congé:", error);

        // Gestion des erreurs de clés étrangères (ex: l'employé n'existe pas)
        if (error.code === '23503') {
            return res.status(400).json({
                error: "L'employé ou le type de congé spécifié n'existe pas."
            });
        }

        return res.status(500).json({ error: "Erreur interne du serveur." });
    }
});


router.get('/', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM public.solde_conge');
        return res.status(200).json(result.rows);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Erreur lors de la récupération." });
    }
});


router.get('/:id', async (req, res) => {
    const { id } = req.params;

    const query = `SELECT * FROM public.solde_conge WHERE id = $1`;

    try {
        const result = await db.query(query, [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Solde de congé introuvable." });
        }

        return res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error("Erreur lors de la récupération du solde unique :", error);
        return res.status(500).json({ error: "Erreur interne du serveur." });
    }
});


module.exports = router;