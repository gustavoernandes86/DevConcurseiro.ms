const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const asyncRoute = require('../middleware/asyncRoute');

// DELETE /api/sessions/:sessionId - Delete a study session
router.delete('/:sessionId', asyncRoute(async (req, res) => {
    const { sessionId } = req.params;
    if (!sessionId || isNaN(parseInt(sessionId, 10))) {
        const err = new Error('O ID da sessão é inválido.');
        err.statusCode = 400;
        throw err;
    }
    
    const result = db.prepare('DELETE FROM study_sessions WHERE id = ?').run(sessionId);
    
    // Fallback: Check if it was in the legacy study_log table too
    if (result.changes === 0) {
        db.prepare('DELETE FROM study_log WHERE id = ?').run(sessionId);
    }
    
    res.json({ ok: true });
}));

module.exports = router;
