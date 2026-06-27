const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db/connection');
const asyncRoute = require('../middleware/asyncRoute');
const AppError = require('../utils/AppError');

function assertProgramExists(programId) {
    const program = db.prepare('SELECT id FROM learning_programs WHERE id = ?').get(programId);
    if (!program) throw AppError.notFound('Programa de aprendizado não encontrado.');
}

// GET /api/programs/:programId/materials - List all materials for a program
router.get('/:programId/materials', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    assertProgramExists(programId);

    const list = db.prepare('SELECT * FROM materials WHERE program_id = ?').all(programId);
    list.forEach(m => {
        try { m.metadata = JSON.parse(m.metadata_json); } catch (e) { m.metadata = {}; }
        delete m.metadata_json;
    });
    res.json(list);
}));

// GET /api/programs/:programId/bookmarks - List all PDF bookmarks for a program
router.get('/:programId/bookmarks', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    assertProgramExists(programId);

    const bookmarks = db.prepare('SELECT * FROM material_bookmarks WHERE program_id = ?').all(programId);
    
    // Map to a key-value format for compatibility
    const result = {};
    bookmarks.forEach(b => {
        const key = b.topic_id ? `${b.material_id}#${b.topic_id}` : b.material_id;
        result[key] = {
            currentPage: b.current_page,
            totalPages: b.total_pages,
            lastReadAt: b.last_read_at
        };
    });
    res.json(result);
}));

// PUT /api/programs/:programId/bookmarks - Set a PDF bookmark
router.put('/:programId/bookmarks', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    const { materialId, topicId, currentPage, totalPages } = req.body;

    assertProgramExists(programId);

    if (!materialId || typeof materialId !== 'string') {
        throw AppError.badRequest('O campo materialId é obrigatório.');
    }
    if (currentPage === undefined || typeof currentPage !== 'number' || currentPage < 1) {
        throw AppError.badRequest('O campo currentPage deve ser um número maior ou igual a 1.');
    }
    if (totalPages === undefined || typeof totalPages !== 'number' || totalPages < 1) {
        throw AppError.badRequest('O campo totalPages deve ser um número maior ou igual a 1.');
    }

    const tId = topicId || null;
    const now = Date.now();

    db.prepare(`
        INSERT INTO material_bookmarks (program_id, material_id, topic_id, current_page, total_pages, last_read_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(program_id, material_id, topic_id) DO UPDATE SET
            current_page = excluded.current_page,
            total_pages = excluded.total_pages,
            last_read_at = excluded.last_read_at
    `).run(programId, materialId, tId, currentPage, totalPages, now);

    res.json({ ok: true });
}));

// POST /api/programs/:programId/reading-log - Log a PDF reading page
router.post('/:programId/reading-log', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    const { materialId, topicId, pageNumber, dateStr } = req.body;

    assertProgramExists(programId);

    if (!materialId || typeof materialId !== 'string') {
        throw AppError.badRequest('O campo materialId é obrigatório.');
    }
    if (pageNumber === undefined || typeof pageNumber !== 'number' || pageNumber < 1) {
        throw AppError.badRequest('O campo pageNumber é obrigatório.');
    }
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw AppError.badRequest('O campo dateStr é obrigatório no formato YYYY-MM-DD.');
    }

    const tId = topicId || null;
    const now = Date.now();

    db.prepare(`
        INSERT OR IGNORE INTO material_reading_log (program_id, material_id, topic_id, page_number, date_str, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(programId, materialId, tId, pageNumber, dateStr, now);

    res.json({ ok: true });
}));

// GET /api/programs/:programId/reading-log/:dateStr - List pages read on a date
router.get('/:programId/reading-log/:dateStr', asyncRoute(async (req, res) => {
    const { programId, dateStr } = req.params;
    assertProgramExists(programId);

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw AppError.badRequest('O campo dateStr deve seguir o formato YYYY-MM-DD.');
    }

    const rows = db.prepare(`
        SELECT material_id, topic_id, page_number, timestamp 
        FROM material_reading_log 
        WHERE program_id = ? AND date_str = ?
        ORDER BY timestamp ASC
    `).all(programId, dateStr);

    res.json(rows);
}));

// ════════════════════════════════════════
//  EXERCISES SEGMENT (scopados por programId)
// ════════════════════════════════════════

module.exports = router;
