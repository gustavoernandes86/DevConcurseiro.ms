const AppError = require('../utils/AppError');
const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const asyncRoute = require('../middleware/asyncRoute');
const { resolveInsideRoot, assertPdfPath } = require('../utils/safePath');
const path = require('path');
const fs = require('fs');

// Services
const { getTextForMaterialPages } = require('../services/pdfTextExtractor');
const { generateExercisesForContent } = require('../services/exerciseGenerator');

// Helper to check if program exists
function assertProgramExists(programId) {
    const program = db.prepare('SELECT id FROM learning_programs WHERE id = ?').get(programId);
    if (!program) {
        throw AppError.notFound('Programa de aprendizado não encontrado.');
    }
}

// GET /api/programs - List all active programs
router.get('/', asyncRoute(async (req, res) => {
    const programs = db.prepare('SELECT * FROM learning_programs WHERE active = 1 ORDER BY created_at DESC').all();
    res.json(programs);
}));

// GET /api/programs/:programId - Get details of a single program
router.get('/:programId', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    const program = db.prepare('SELECT * FROM learning_programs WHERE id = ?').get(programId);
    if (!program) {
        return res.status(404).json({ error: 'Programa de aprendizado não encontrado.' });
    }
    res.json(program);
}));

// GET /api/programs/:programId/progress - Get all topic progress logs for a program
router.get('/:programId/progress', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    assertProgramExists(programId);

    const progress = db.prepare('SELECT topic_id, status, completed_at, confidence FROM topic_progress WHERE program_id = ?').all(programId);
    
    // Map to a key-value format for easy UI lookup
    const result = {};
    progress.forEach(p => {
        result[p.topic_id] = {
            status: p.status,
            completedAt: p.completed_at,
            confidence: p.confidence
        };
    });
    res.json(result);
}));

// PUT /api/programs/:programId/topics/:topicId/progress - Set progress for a topic
router.put('/:programId/topics/:topicId/progress', asyncRoute(async (req, res) => {
    const { programId, topicId } = req.params;
    const { status, completedAt, confidence } = req.body;

    assertProgramExists(programId);

    if (!status || !['todo', 'studying', 'done', 'review'].includes(status)) {
        throw AppError.badRequest('O campo status é obrigatório e deve ser todo, studying, done ou review.');
    }

    const confVal = confidence !== undefined ? parseInt(confidence, 10) : null;
    const compAt = completedAt ? parseInt(completedAt, 10) : null;
    const now = Date.now();

    db.prepare(`
        INSERT INTO topic_progress (program_id, topic_id, status, completed_at, confidence, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(program_id, topic_id) DO UPDATE SET
            status = excluded.status,
            completed_at = excluded.completed_at,
            confidence = excluded.confidence,
            updated_at = excluded.updated_at
    `).run(programId, topicId, status, compAt, confVal, now);

    res.json({ ok: true });
}));

// DELETE /api/programs/:programId/topics/:topicId/progress - Reset progress for a topic
router.delete('/:programId/topics/:topicId/progress', asyncRoute(async (req, res) => {
    const { programId, topicId } = req.params;
    assertProgramExists(programId);

    db.prepare('DELETE FROM topic_progress WHERE program_id = ? AND topic_id = ?').run(programId, topicId);
    res.json({ ok: true });
}));

// GET /api/programs/:programId/notes - Get all notes for a program
router.get('/:programId/notes', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    assertProgramExists(programId);

    const notes = db.prepare('SELECT id, target_type, target_id, note, created_at, updated_at FROM notes WHERE program_id = ?').all(programId);
    res.json(notes);
}));

// PUT /api/programs/:programId/notes - Add or update a note
router.put('/:programId/notes', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    const { targetType, targetId, note, noteId } = req.body;

    assertProgramExists(programId);

    if (!targetType || !['topic', 'material', 'page', 'video', 'exercise', 'program'].includes(targetType)) {
        throw AppError.badRequest('O campo targetType é obrigatório e deve ser um tipo válido.');
    }
    if (!targetId || typeof targetId !== 'string') {
        throw AppError.badRequest('O campo targetId é obrigatório.');
    }
    if (note === undefined || typeof note !== 'string') {
        throw AppError.badRequest('O campo note é obrigatório.');
    }

    const now = Date.now();

    if (noteId) {
        // Update existing note
        db.prepare(`
            UPDATE notes 
            SET note = ?, updated_at = ? 
            WHERE id = ? AND program_id = ?
        `).run(note, now, noteId, programId);
    } else {
        // Check if there is already a note for this target (e.g. topic note mapping) to prevent duplicates
        const existing = db.prepare(`
            SELECT id FROM notes 
            WHERE program_id = ? AND target_type = ? AND target_id = ?
        `).get(programId, targetType, targetId);

        if (existing) {
            db.prepare(`
                UPDATE notes 
                SET note = ?, updated_at = ? 
                WHERE id = ?
            `).run(note, now, existing.id);
        } else {
            db.prepare(`
                INSERT INTO notes (program_id, target_type, target_id, note, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(programId, targetType, targetId, note, now, now);
        }
    }

    res.json({ ok: true });
}));

// DELETE /api/programs/:programId/notes/:noteId - Delete a note
router.delete('/:programId/notes/:noteId', asyncRoute(async (req, res) => {
    const { programId, noteId } = req.params;
    assertProgramExists(programId);

    db.prepare('DELETE FROM notes WHERE id = ? AND program_id = ?').run(noteId, programId);
    res.json({ ok: true });
}));

// GET /api/programs/:programId/sessions - Get all study sessions for a program
router.get('/:programId/sessions', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    assertProgramExists(programId);

    const sessions = db.prepare('SELECT * FROM study_sessions WHERE program_id = ? ORDER BY started_at ASC').all(programId);
    sessions.forEach(s => {
        try { s.metadata = JSON.parse(s.metadata_json); } catch (e) { s.metadata = {}; }
        delete s.metadata_json;
    });
    res.json(sessions);
}));

// POST /api/programs/:programId/sessions - Record a study session
router.post('/:programId/sessions', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    const { startedAt, endedAt, type, duration, topicId, source, metadata } = req.body;

    assertProgramExists(programId);

    if (!startedAt || typeof startedAt !== 'number') {
        throw AppError.badRequest('O campo startedAt é obrigatório e deve ser numérico.');
    }
    if (!type || !['focus', 'short_break', 'long_break', 'manual', 'video', 'pdf'].includes(type)) {
        throw AppError.badRequest('O campo type é obrigatório e deve ser válido.');
    }
    if (duration === undefined || typeof duration !== 'number') {
        throw AppError.badRequest('O campo duration é obrigatório e deve ser numérico.');
    }

    const endVal = endedAt ? parseInt(endedAt, 10) : null;
    const metaStr = metadata ? JSON.stringify(metadata) : '{}';

    const result = db.prepare(`
        INSERT INTO study_sessions (program_id, started_at, ended_at, type, duration, topic_id, source, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(programId, startedAt, endVal, type, duration, topicId || null, source || null, metaStr);

    res.json({ ok: true, id: result.lastInsertRowid });
}));

module.exports = router;
