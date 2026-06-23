const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const asyncRoute = require('../middleware/asyncRoute');

// GET /api/config - Get all configuration keys
router.get('/', asyncRoute(async (req, res) => {
    const rows = db.prepare('SELECT key, value FROM app_config').all();
    const result = {};
    rows.forEach(r => {
        try { result[r.key] = JSON.parse(r.value); }
        catch { result[r.key] = r.value; }
    });
    res.json(result);
}));

// PUT /api/config/:key - Save or update configuration key-value
router.put('/:key', asyncRoute(async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;

    if (!key || typeof key !== 'string' || !key.trim()) {
        const err = new Error('A chave de configuração é obrigatória.');
        err.statusCode = 400;
        throw err;
    }
    if (value === undefined) {
        const err = new Error('O valor de configuração é obrigatório.');
        err.statusCode = 400;
        throw err;
    }

    const valueStr = JSON.stringify(value);
    const now = Date.now();

    db.prepare(`
        INSERT INTO app_config (key, value, updated_at) 
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
    `).run(key, valueStr, now);

    res.json({ ok: true });
}));

module.exports = router;
