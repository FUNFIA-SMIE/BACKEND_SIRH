const express = require('express');
const router = express.Router();
const db = require('../../config/db.config'); // Ton fichier modifié

/*
router.post('/', async (req, res) => {
  console.log('Requête reçue pour créer un congé:', req.body);

  const {
    employe_id, type_conge_id, date_debut, date_fin,
    nb_jours, motif, demi_journee_debut, demi_journee_fin, justificatif
  } = req.body;

  try {
    const anneeActuelle = new Date(date_debut).getFullYear();
    await db.query('BEGIN');

    // 1. Vérification type
    const typeCheck = await db.query(
      'SELECT deductible_solde FROM type_conge WHERE id = $1',
      [type_conge_id]
    );
    if (typeCheck.rows.length === 0) throw new Error("Type de congé inexistant");
    const isDeductible = typeCheck.rows[0].deductible_solde;

    // 2. Insertion congé
    const congeResult = await db.query(`
      INSERT INTO conge (
        employe_id, type_conge_id, date_debut, date_fin,
        nb_jours, statut, motif, demi_journee_debut, demi_journee_fin, justificatif_url
      ) VALUES ($1, $2, $3, $4, $5, 'en_attente_manager', $6, $7, $8, $9)
      RETURNING id;
    `, [employe_id, type_conge_id, date_debut, date_fin,
      nb_jours, motif, demi_journee_debut, demi_journee_fin, justificatif]);

    const newCongeId = congeResult.rows[0].id;

    // 3. Mise à jour solde
    if (isDeductible) {
      const soldeRes = await db.query(`
        UPDATE solde_conge 
        SET solde_en_attente = solde_en_attente + $1, updated_at = NOW()
        WHERE employe_id = $2 AND type_conge_id = $3 AND annee = $4;
      `, [nb_jours, employe_id, type_conge_id, anneeActuelle]);

      if (soldeRes.rowCount === 0) {
        throw new Error(`Aucun solde trouvé pour l'année ${anneeActuelle}.`);
      }
    }

    await db.query('COMMIT');
    res.status(201).json({ success: true, congeId: newCongeId });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Erreur création congé:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});*/

router.post('/', async (req, res) => {
  console.log('Requête reçue pour créer un congé:', req.body);
  const io = req.app.get('io'); // ← récupérer io

  const {
    employe_id, type_conge_id, date_debut, date_fin,
    nb_jours, motif, demi_journee_debut, demi_journee_fin, justificatif
  } = req.body;

  try {
    const anneeActuelle = new Date(date_debut).getFullYear();
    await db.query('BEGIN');

    const typeCheck = await db.query(
      'SELECT deductible_solde FROM type_conge WHERE id = $1',
      [type_conge_id]
    );
    if (typeCheck.rows.length === 0) throw new Error("Type de congé inexistant");
    const isDeductible = typeCheck.rows[0].deductible_solde;

    const congeResult = await db.query(`
      INSERT INTO conge (
        employe_id, type_conge_id, date_debut, date_fin,
        nb_jours, statut, motif, demi_journee_debut, demi_journee_fin, justificatif_url
      ) VALUES ($1, $2, $3, $4, $5, 'en_attente_manager', $6, $7, $8, $9)
      RETURNING id;
    `, [employe_id, type_conge_id, date_debut, date_fin,
        nb_jours, motif, demi_journee_debut, demi_journee_fin, justificatif]);

    const newCongeId = congeResult.rows[0].id;

    if (isDeductible) {
      const soldeRes = await db.query(`
        UPDATE solde_conge 
        SET solde_en_attente = solde_en_attente + $1, updated_at = NOW()
        WHERE employe_id = $2 AND type_conge_id = $3 AND annee = $4;
      `, [nb_jours, employe_id, type_conge_id, anneeActuelle]);

      if (soldeRes.rowCount === 0) {
        throw new Error(`Aucun solde trouvé pour l'année ${anneeActuelle}.`);
      }
    }

    // ─── Récupérer infos employé pour la notif ───────────────
    const empInfo = await db.query(
      `SELECT nom, prenom, departement_id FROM employe WHERE id = $1`,
      [employe_id]
    );
    const emp = empInfo.rows[0];

    // ─── Récupérer les managers/RH du département ────────────
    const managersRes = await db.query(`
      SELECT DISTINCT e.id AS employe_id
      FROM employe e
      JOIN poste p ON e.poste_id = p.id
      WHERE e.departement_id = $1
        AND p.intitule IN ('MEDECIN CHEF', 'MAJOR', 'Directeur Exécutif')
        AND e.statut = 'actif'
    `, [emp.departement_id]);

    await db.query('COMMIT');

    // ─── Notifier chaque manager en temps réel ───────────────
    managersRes.rows.forEach(manager => {
      io.to(`employe_${manager.employe_id}`).emit('nouvelle_demande', {
        conge_id:   newCongeId,
        employe:    `${emp.prenom} ${emp.nom}`,
        date_debut,
        date_fin,
        nb_jours,
        message:    `📋 Nouvelle demande de congé de ${emp.prenom} ${emp.nom} (${nb_jours} jour${nb_jours > 1 ? 's' : ''})`,
      });
    });

    // ─── Notifier aussi la room globale "managers" ───────────
    io.to('room_managers').emit('nouvelle_demande', {
      conge_id:   newCongeId,
      employe:    `${emp.prenom} ${emp.nom}`,
      date_debut,
      date_fin,
      nb_jours,
      message:    `📋 Nouvelle demande de ${emp.prenom} ${emp.nom}`,
    });

    res.status(201).json({ success: true, congeId: newCongeId });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Erreur création congé:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/conges/soldes/:employe_id
router.get('/soldes/:employe_id/:typeId', async (req, res) => {
  try {
    const { employe_id, typeId } = req.params;
    const annee = new Date().getFullYear();

    const sql = `
      SELECT 
        tc.libelle, 
        tc.code,
        sc.solde_initial, 
        sc.solde_acquis, 
        sc.solde_pris, 
        sc.solde_en_attente,
        sc.solde_restant
      FROM solde_conge sc
      JOIN type_conge tc ON sc.type_conge_id = tc.id
      WHERE sc.employe_id = $1 AND sc.annee = $2 AND tc.id = $3;
    `;
    const result = await db.query(sql, [employe_id, annee, typeId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }


});

// GET /api/conges/historique/:employe_id
router.get('/historique/:employe_id', async (req, res) => {
  try {
    const { employe_id } = req.params;
    const sql = `
      SELECT 
        c.id,
        tc.libelle as type,
        c.date_debut,
        c.date_fin,
        c.nb_jours,
        c.statut,
        c.created_at,
        c.motif
      FROM conge c
      JOIN type_conge tc ON c.type_conge_id = tc.id
      WHERE c.employe_id = $1
      ORDER BY c.created_at DESC;
    `;
    const result = await db.query(sql, [employe_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/conges/soldes/:employe_id
router.get('/type_conge', async (req, res) => {
  try {
    const sql = `SELECT * FROM type_conge ORDER BY libelle`;
    const result = await db.query(sql);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur type_conge:', error); // ← log complet
    res.status(500).json({ error: error.message });
  }
});

router.get('/conges_en_attente', async (req, res) => {
  try {
    // Note : On retire les paramètres inutilisés dans le SQL pour éviter l'erreur 
    // "bind message has X parameters, but prepared statement requires 0"

    const sql = `
        SELECT 
            c.id,
            e.nom,
            e.departement_id, 
            e.prenom, 
            e.matricule,
            e.photo_url,
            c.date_debut, 
            c.date_fin, 
            c.nb_jours, 
            c.statut,
            c.motif,
            tc.libelle as type_conge,
            tc.code as code_type,
            c.created_at,
            sc.solde_restant, -- On récupère le solde depuis la table solde_conge
            sc.solde_initial -- Solde initial pour affichage dans le détail
        FROM 
            conge c
        JOIN 
            employe e ON c.employe_id = e.id
        LEFT JOIN 
            type_conge tc ON c.type_conge_id = tc.id
        LEFT JOIN 
            solde_conge sc ON (
                sc.employe_id = c.employe_id 
                AND sc.type_conge_id = c.type_conge_id 
                AND sc.annee = EXTRACT(YEAR FROM c.date_debut)
            )
        WHERE 
            c.statut NOT IN ('approuve', 'refuse', 'annule')
        ORDER BY 
            c.created_at DESC;`;

    const result = await db.query(sql); // Pas de tableau de paramètres ici
    res.json(result.rows);
  } catch (error) {
    console.error(error); // Toujours utile pour le debug côté serveur
    res.status(500).json({ error: error.message });
  }
});

router.patch('/valider/:id', async (req, res) => {
  const congeId = req.params.id;
  const { statut, commentaire } = req.body;
  const io = req.app.get('io'); // ← récupérer io

  if (statut === 'refuse' && !commentaire?.trim()) {
    return res.status(400).json({ success: false, error: "Un commentaire est requis pour un refus" });
  }

  try {
    await db.query('BEGIN');

    const congeInfo = await db.query(
      `SELECT employe_id, type_conge_id, nb_jours, date_debut, statut AS statut_actuel
       FROM conge WHERE id = $1 FOR UPDATE`,
      [congeId]
    );

    if (congeInfo.rows.length === 0) throw new Error("Congé introuvable");

    const { employe_id, type_conge_id, nb_jours, date_debut, statut_actuel } = congeInfo.rows[0];

    if (['approuve', 'refuse'].includes(statut_actuel)) {
      throw new Error(`Ce congé est déjà ${statut_actuel}`);
    }

    const annee = new Date(date_debut).getFullYear();

    await db.query(
      `UPDATE conge 
       SET statut = $2,
           commentaire_refus = $3,
           updated_at = NOW() 
       WHERE id = $1`,
      [congeId, statut, statut === 'refuse' ? commentaire.trim() : null]
    );

    if (statut === 'approuve') {
      const typeCheck = await db.query(
        'SELECT deductible_solde FROM type_conge WHERE id = $1',
        [type_conge_id]
      );
      if (typeCheck.rows[0].deductible_solde) {
        const updateSolde = await db.query(
          `UPDATE solde_conge 
           SET solde_initial = solde_restant,
               solde_restant = solde_restant - $1,
               updated_at = NOW()
           WHERE employe_id = $2 AND type_conge_id = $3 AND annee = $4`,
          [nb_jours, employe_id, type_conge_id, annee]
        );
        if (updateSolde.rowCount === 0) throw new Error("Erreur lors de la mise à jour du solde");
      }
    }

    await db.query('COMMIT');

    // ─── NOTIFICATION SOCKET.IO ──────────────────────────────
    const label = statut === 'approuve' ? 'approuvé' : 'refusé';
    const emoji = statut === 'approuve' ? '✅' : '❌';

    io.to(`employe_${employe_id}`).emit('statut_conge', {
      conge_id:  congeId,
      statut,
      message:   `${emoji} Votre congé a été ${label}.`,
      commentaire: statut === 'refuse' ? commentaire.trim() : null,
    });
    // ─────────────────────────────────────────────────────────

    res.json({ success: true, message: `Congé ${label} avec succès` });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Erreur validation congé:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});
/*
router.patch('/refuser/:id', async (req, res) => {
  const congeId = req.params.id;
  const { approbateur_id, commentaire_refus } = req.body;

  try {
    await db.query('BEGIN');

    const congeInfo = await db.query(
      `SELECT employe_id, type_conge_id, nb_jours, date_debut FROM conge WHERE id = $1`, [congeId]
    );
    const { employe_id, type_conge_id, nb_jours, date_debut } = congeInfo.rows[0];
    const annee = new Date(date_debut).getFullYear();

    // 1. Statut en 'refuse' et stockage du motif de refus
    await db.query(
      "UPDATE conge SET statut = 'refuse', commentaire_refus = $2, updated_at = NOW() WHERE id = $1",
      [congeId, commentaire_refus]
    );

    // 2. Libérer le solde bloqué en attente
    await db.query(`
      UPDATE solde_conge 
      SET solde_en_attente = solde_en_attente - $1, updated_at = NOW()
      WHERE employe_id = $2 AND type_conge_id = $3 AND annee = $4
    `, [nb_jours, employe_id, type_conge_id, annee]);

    // 3. Workflow
    await db.query(`
      INSERT INTO workflow_conge_etape (conge_id, approbateur_id, niveau, action, commentaire)
      VALUES ($1, $2, 1, 'refuse', $3)
    `, [congeId, approbateur_id, commentaire_refus]);

    await db.query('COMMIT');
    res.json({ success: true, message: "Congé refusé" });
  } catch (error) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});
*/

router.get('/employe_solde', async (req, res) => {
  try {
    const sql =
      `
      SELECT
      e.id              AS employe_id,
      e.matricule,
      e.nom,
      e.prenom,
      e.email_pro,
      e.statut          AS statut_employe,
      e.photo_url,
      json_agg(
        json_build_object(
          'type_conge_id',    tc.id,
          'libelle',          tc.libelle,
          'solde_initial',    sc.solde_initial,
          'solde_acquis',     sc.solde_acquis,
          'solde_pris',       sc.solde_pris,
          'solde_en_attente', sc.solde_en_attente,
          'solde_restant',    sc.solde_restant
        ) ORDER BY tc.libelle
      ) AS soldes
    FROM employe e
    LEFT JOIN solde_conge sc
           ON sc.employe_id = e.id
    LEFT JOIN type_conge tc
           ON tc.id = sc.type_conge_id
    GROUP BY e.id, e.matricule, e.nom, e.prenom, e.email_pro, e.statut
    ORDER BY e.nom, e.prenom
    `;
    const result = await db.query(sql);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur type_conge:', error); // ← log complet
    res.status(500).json({ error: error.message });
  }
});

router.post('/types-conge', async (req, res) => {
  const {
    organisation_id, code, libelle, type_enum, solde_initial_jours,
    validation_rh, seuil_rh_jours, delai_reponse_h, anticipation_min_j,
    justificatif_requis, deductible_solde
  } = req.body;

  const query = `
    INSERT INTO type_conge 
    (organisation_id, code, libelle, type_enum, solde_initial_jours, validation_rh, seuil_rh_jours, delai_reponse_h, anticipation_min_j, justificatif_requis, deductible_solde)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`;

  const values = [
    organisation_id, code, libelle, type_enum, solde_initial_jours || 0,
    validation_rh || false, seuil_rh_jours, delai_reponse_h || 48,
    anticipation_min_j || 0, justificatif_requis || false, deductible_solde || true
  ];

  try {
    const result = await db.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Modifier un type (PUT)
router.put('/types-conge/:id', async (req, res) => {
  const { id } = req.params;
  const fields = req.body;

  // Construction dynamique de la requête de mise à jour
  const keys = Object.keys(fields);
  const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
  const values = Object.values(fields);

  try {
    const query = `UPDATE type_conge SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`;
    const result = await db.query(query, [...values, id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Désactiver un type (Soft Delete)
router.delete('/types-conge/:id', async (req, res) => {
  try {
    await db.query('UPDATE type_conge SET actif = false WHERE id = $1', [req.params.id]);
    res.json({ message: "Type de congé désactivé" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ajustement', async (req, res) => {
  const { employe_id, type_conge_id, annee, delta_jours, motif, auteur_id } = req.body;

  // ── Validation des champs obligatoires ──────────────────────────────────────
  const missing = [];
  if (!employe_id) missing.push('employe_id');
  if (!type_conge_id) missing.push('type_conge_id');
  if (!annee) missing.push('annee');
  if (delta_jours === undefined || delta_jours === null) missing.push('delta_jours');
  if (!motif) missing.push('motif');

  if (missing.length) {
    return res.status(400).json({
      success: false,
      message: `Champs obligatoires manquants : ${missing.join(', ')}`,
    });
  }

  if (delta_jours === 0) {
    return res.status(400).json({
      success: false,
      message: 'delta_jours ne peut pas être 0.',
    });
  }

  try {
    // Remplacement de client.query par db.query
    await db.query('BEGIN');

    // ── 1. Vérifier que l'employé existe ────────────────────────────────────
    const { rowCount: empCount } = await db.query(
      'SELECT id FROM employe WHERE id = $1',
      [employe_id]
    );
    if (!empCount) {
      await db.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Employé introuvable.' });
    }

    // ── 2. Vérifier que le type_conge existe et est actif ──────────────────
    const typeRes = await db.query(
      'SELECT id, libelle, deductible_solde FROM type_conge WHERE id = $1 AND actif = true',
      [type_conge_id]
    );
    if (!typeRes.rowCount) {
      await db.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Type de congé introuvable ou inactif.' });
    }

    // ── 3. Récupérer (ou créer) le solde de l'année concernée ─────────────
    let soldeRes = await db.query(
      `SELECT * FROM solde_conge
       WHERE employe_id = $1 AND type_conge_id = $2 AND annee = $3
       FOR UPDATE`,
      [employe_id, type_conge_id, annee]
    );

    let solde;
    if (!soldeRes.rowCount) {
      // Création automatique si la ligne n'existe pas encore
      const insertSolde = await db.query(
        `INSERT INTO solde_conge
           (employe_id, type_conge_id, annee, solde_initial, solde_acquis, solde_pris, solde_en_attente, solde_restant)
         VALUES ($1, $2, $3, 0, 0, 0, 0, 0)
         RETURNING *`,
        [employe_id, type_conge_id, annee]
      );
      solde = insertSolde.rows[0];
    } else {
      solde = soldeRes.rows[0];
    }

    // ── 4. Calculer le nouveau solde restant ───────────────────────────────
    const nouveau_solde_restant = parseFloat(solde.solde_restant) + parseFloat(delta_jours);

    // Empêcher un solde restant négatif
    if (nouveau_solde_restant < 0) {
      await db.query('ROLLBACK');
      return res.status(422).json({
        success: false,
        message: `Solde insuffisant. Solde actuel : ${solde.solde_restant} j, débit demandé : ${Math.abs(delta_jours)} j.`,
        solde_actuel: solde.solde_restant,
      });
    }

    // ── 5. Mise à jour du solde ────────────────────────────────────────────
    const updateSoldeQuery = delta_jours > 0
      ? `UPDATE solde_conge
           SET solde_acquis  = solde_acquis + $1,
               solde_restant = solde_restant + $1,
               updated_at    = now()
         WHERE id = $2
         RETURNING *`
      : `UPDATE solde_conge
           SET solde_pris    = solde_pris + $1,
               solde_restant = solde_restant - $1,
               updated_at    = now()
         WHERE id = $2
         RETURNING *`;

    const absJours = Math.abs(delta_jours);
    const updatedSolde = await db.query(updateSoldeQuery, [absJours, solde.id]);

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const traceMotif = `[AJUSTEMENT MANUEL] ${delta_jours > 0 ? 'Crédit' : 'Débit'} de ${absJours} j – ${motif}`
      + (auteur_id ? ` (auteur: ${auteur_id})` : '');

    // Note : Si vos ID de table conge sont des entiers auto-incrémentés (SERIAL), 
    // retirez "id," et "$1," ainsi que la génération d'UUID ci-dessous.
    const traceRes = await db.query(
      `INSERT INTO conge
         (employe_id, type_conge_id, date_debut, date_fin, nb_jours,
          demi_journee_debut, demi_journee_fin, statut, motif)
       VALUES
         ($1, $2, $3, $3, $4, false, false, 'approuve', $5)
       RETURNING *`,
      [employe_id, type_conge_id, today, absJours, traceMotif]
    );

    await db.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Solde ajusté de ${delta_jours > 0 ? '+' : ''}${delta_jours} jour(s).`,
      solde: updatedSolde.rows[0],
      trace: traceRes.rows[0],
    });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('[ajustement-solde] Erreur :', err);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'ajustement du solde.',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
  // Le bloc finally avec client.release() a été supprimé car on utilise le pool 'db' global directement
});


router.get('/', async (req, res) => {
  try {
    // Note : On retire les paramètres inutilisés dans le SQL pour éviter l'erreur 
    // "bind message has X parameters, but prepared statement requires 0"

    const sql = `
        SELECT 
            c.id,
            e.id AS employe_id,
            e.nom,
            e.departement_id, 
            e.prenom, 
            e.matricule,
            e.photo_url,
            c.date_debut, 
            c.date_fin, 
            c.nb_jours, 
            c.statut,
            c.motif,
            c.commentaire_refus,
            c.created_at as date_demande,
            tc.libelle as type_conge,
            tc.code as code_type,
            c.created_at,
            sc.solde_restant, -- On récupère le solde depuis la table solde_conge
            sc.solde_initial -- Solde initial pour affichage dans le détail
        FROM 
            conge c
        JOIN 
            employe e ON c.employe_id = e.id
        LEFT JOIN 
            type_conge tc ON c.type_conge_id = tc.id
        LEFT JOIN 
            solde_conge sc ON (
                sc.employe_id = c.employe_id 
                AND sc.type_conge_id = c.type_conge_id 
                AND sc.annee = EXTRACT(YEAR FROM c.date_debut)
            )
        ORDER BY 
            c.created_at DESC;`;

    const result = await db.query(sql); // Pas de tableau de paramètres ici
    res.json(result.rows);
  } catch (error) {
    console.error(error); // Toujours utile pour le debug côté serveur
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;