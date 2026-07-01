const express = require('express');
const router = express.Router();
const { loadAllContests } = require('../services/contestLoader');
const asyncRoute = require('../middleware/asyncRoute');

// POST /api/admin/reload-contests - Trigger reload of all contest data folders
router.post('/reload-contests', asyncRoute(async (req, res) => {
    await loadAllContests();
    res.json({ ok: true, message: 'Configurações de concursos recarregadas com sucesso no banco de dados.' });
}));

module.exports = router;
