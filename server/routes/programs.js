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
        const err = new Error('Programa de aprendizado não encontrado.');
        err.statusCode = 404;
        throw err;
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
        const err = new Error('O campo status é obrigatório e deve ser todo, studying, done ou review.');
        err.statusCode = 400;
        throw err;
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
        const err = new Error('O campo targetType é obrigatório e deve ser um tipo válido.');
        err.statusCode = 400;
        throw err;
    }
    if (!targetId || typeof targetId !== 'string') {
        const err = new Error('O campo targetId é obrigatório.');
        err.statusCode = 400;
        throw err;
    }
    if (note === undefined || typeof note !== 'string') {
        const err = new Error('O campo note é obrigatório.');
        err.statusCode = 400;
        throw err;
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
        const err = new Error('O campo startedAt é obrigatório e deve ser numérico.');
        err.statusCode = 400;
        throw err;
    }
    if (!type || !['focus', 'short_break', 'long_break', 'manual', 'video', 'pdf'].includes(type)) {
        const err = new Error('O campo type é obrigatório e deve ser válido.');
        err.statusCode = 400;
        throw err;
    }
    if (duration === undefined || typeof duration !== 'number') {
        const err = new Error('O campo duration é obrigatório e deve ser numérico.');
        err.statusCode = 400;
        throw err;
    }

    const endVal = endedAt ? parseInt(endedAt, 10) : null;
    const metaStr = metadata ? JSON.stringify(metadata) : '{}';

    const result = db.prepare(`
        INSERT INTO study_sessions (program_id, started_at, ended_at, type, duration, topic_id, source, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(programId, startedAt, endVal, type, duration, topicId || null, source || null, metaStr);

    res.json({ ok: true, id: result.lastInsertRowid });
}));

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
        const err = new Error('O campo materialId é obrigatório.');
        err.statusCode = 400;
        throw err;
    }
    if (currentPage === undefined || typeof currentPage !== 'number' || currentPage < 1) {
        const err = new Error('O campo currentPage deve ser um número maior ou igual a 1.');
        err.statusCode = 400;
        throw err;
    }
    if (totalPages === undefined || typeof totalPages !== 'number' || totalPages < 1) {
        const err = new Error('O campo totalPages deve ser um número maior ou igual a 1.');
        err.statusCode = 400;
        throw err;
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
        const err = new Error('O campo materialId é obrigatório.');
        err.statusCode = 400;
        throw err;
    }
    if (pageNumber === undefined || typeof pageNumber !== 'number' || pageNumber < 1) {
        const err = new Error('O campo pageNumber é obrigatório.');
        err.statusCode = 400;
        throw err;
    }
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const err = new Error('O campo dateStr é obrigatório no formato YYYY-MM-DD.');
        err.statusCode = 400;
        throw err;
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
        const err = new Error('O campo dateStr deve seguir o formato YYYY-MM-DD.');
        err.statusCode = 400;
        throw err;
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

// GET /api/programs/:programId/exercises/today - Check exercises status for today
router.get('/:programId/exercises/today', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    const { dateStr } = req.query;

    assertProgramExists(programId);

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const err = new Error('O campo dateStr é obrigatório e deve seguir o formato YYYY-MM-DD.');
        err.statusCode = 400;
        throw err;
    }

    // Number of pages read today
    const pagesRead = db.prepare(`
        SELECT COUNT(*) as count FROM material_reading_log 
        WHERE program_id = ? AND date_str = ?
    `).get(programId, dateStr).count;

    // Check if exercise session exists for today
    const session = db.prepare(`
        SELECT id, date_str, questions_json, answers_json, score 
        FROM exercise_sessions 
        WHERE program_id = ? AND date_str = ?
    `).get(programId, dateStr);

    res.json({
        pagesReadCount: pagesRead,
        hasExercises: !!session,
        session: session ? {
            id: session.id,
            questions: JSON.parse(session.questions_json),
            answers: session.answers_json ? JSON.parse(session.answers_json) : null,
            score: session.score
        } : null
    });
}));

// GET /api/programs/:programId/exercises/history - History of exercise sessions
router.get('/:programId/exercises/history', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    assertProgramExists(programId);

    const rows = db.prepare(`
        SELECT id, date_str, questions_json, answers_json, score, created_at, completed_at, source_type
        FROM exercise_sessions 
        WHERE program_id = ? 
        ORDER BY created_at DESC
    `).all(programId);

    const result = rows.map(r => ({
        id: r.id,
        dateStr: r.date_str,
        sourceType: r.source_type,
        questions: JSON.parse(r.questions_json),
        answers: r.answers_json ? JSON.parse(r.answers_json) : null,
        score: r.score,
        createdAt: r.created_at,
        completedAt: r.completed_at
    }));

    res.json(result);
}));

// POST /api/programs/:programId/exercises/generate - Generate exercise session
router.post('/:programId/exercises/generate', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    const { dateStr } = req.body;

    assertProgramExists(programId);

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const err = new Error('O campo dateStr é obrigatório e deve seguir o formato YYYY-MM-DD.');
        err.statusCode = 400;
        throw err;
    }

    // Check if exercises already exist for this date
    const existing = db.prepare(`
        SELECT id, questions_json FROM exercise_sessions 
        WHERE program_id = ? AND date_str = ?
    `).get(programId, dateStr);

    if (existing) {
        return res.json({ id: existing.id, questions: JSON.parse(existing.questions_json) });
    }

    // Get pages read today
    const pagesRead = db.prepare(`
        SELECT material_id, page_number FROM material_reading_log 
        WHERE program_id = ? AND date_str = ? 
        ORDER BY timestamp ASC
    `).all(programId, dateStr);

    if (pagesRead.length === 0) {
        const err = new Error('Nenhuma página lida hoje.');
        err.statusCode = 400;
        throw err;
    }

    // Group pages by material
    const matPages = {};
    pagesRead.forEach(row => {
        if (!matPages[row.material_id]) matPages[row.material_id] = [];
        matPages[row.material_id].push(row.page_number);
    });

    let extractedContent = '';

    // Extract text from pages (utilizing cache service!)
    for (const [matId, pagesArray] of Object.entries(matPages)) {
        const material = db.prepare('SELECT title FROM materials WHERE id = ?').get(matId);
        const displayTitle = material ? material.title : matId;
        
        try {
            const pagesText = await getTextForMaterialPages(matId, pagesArray);
            const combinedText = Object.values(pagesText).join(' ');
            
            if (combinedText.trim().length > 100) {
                extractedContent += `\n\n=== CONTEÚDO: ${displayTitle} (páginas lidas: ${pagesArray.join(', ')}) ===\n${combinedText.substring(0, 8000)}`;
            }
        } catch (err) {
            console.error(`[Exercise Route] Failed to extract text for material ${matId}:`, err.message);
        }
    }

    if (!extractedContent.trim()) {
        const err = new Error('Não foi possível obter texto dos PDFs lidos para gerar questões.');
        err.statusCode = 500;
        throw err;
    }

    // Generate questions using the AI service
    const questions = await generateExercisesForContent(programId, extractedContent);

    const sessionId = `session-${Date.now()}`;
    const now = Date.now();

    // Save exercise session
    db.prepare(`
        INSERT INTO exercise_sessions (id, program_id, date_str, source_type, questions_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, programId, dateStr, 'pdf_reading', JSON.stringify(questions), now);

    // Save exercise sources
    const insertSource = db.prepare(`
        INSERT INTO exercise_sources (exercise_session_id, material_id, topic_id, page_number)
        VALUES (?, ?, ?, ?)
    `);

    pagesRead.forEach(p => {
        // Fetch topic mapping for this material if available, or just save the material link
        const topic = db.prepare('SELECT topic_id FROM topic_materials WHERE material_id = ? LIMIT 1').get(p.material_id);
        insertSource.run(sessionId, p.material_id, topic ? topic.topic_id : null, p.page_number);
    });

    res.json({ id: sessionId, questions });
}));

// POST /api/programs/:programId/exercises/:sessionId/save - Save quiz answers
router.post('/:programId/exercises/:sessionId/save', asyncRoute(async (req, res) => {
    const { programId, sessionId } = req.params;
    const { answers, score } = req.body;

    assertProgramExists(programId);

    if (!answers || typeof answers !== 'object') {
        const err = new Error('O campo answers é obrigatório.');
        err.statusCode = 400;
        throw err;
    }
    if (score === undefined || typeof score !== 'number') {
        const err = new Error('O campo score é obrigatório e deve ser numérico.');
        err.statusCode = 400;
        throw err;
    }

    const now = Date.now();

    const result = db.prepare(`
        UPDATE exercise_sessions 
        SET answers_json = ?, score = ?, completed_at = ? 
        WHERE id = ? AND program_id = ?
    `).run(JSON.stringify(answers), score, now, sessionId, programId);

    if (result.changes === 0) {
        return res.status(404).json({ error: 'Sessão de exercícios não encontrada ou não pertence a este programa.' });
    }

    res.json({ ok: true });
}));

// GET /api/programs/:programId/videos - Get modules, subjects, and videos with progress
router.get('/:programId/videos', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    assertProgramExists(programId);
    
    // 1. Get modules
    const modules = db.prepare('SELECT * FROM video_modules WHERE program_id = ? ORDER BY sort_order, module_number').all(programId);
    
    // 2. Get all subjects for these modules
    const moduleIds = modules.map(m => m.id);
    if (moduleIds.length === 0) {
        return res.json([]);
    }
    
    const placeholders = moduleIds.map(() => '?').join(',');
    const subjects = db.prepare(`SELECT * FROM video_subjects WHERE module_id IN (${placeholders}) ORDER BY sort_order`).all(moduleIds);
    
    // 3. Get all videos for these subjects
    const subjectIds = subjects.map(s => s.id);
    let videos = [];
    let progress = [];
    if (subjectIds.length > 0) {
        const subPlaceholders = subjectIds.map(() => '?').join(',');
        videos = db.prepare(`SELECT * FROM videos WHERE subject_id IN (${subPlaceholders}) ORDER BY video_number`).all(subjectIds);
        
        const videoIds = videos.map(v => v.id);
        if (videoIds.length > 0) {
            const vidPlaceholders = videoIds.map(() => '?').join(',');
            progress = db.prepare(`SELECT * FROM video_progress WHERE video_id IN (${vidPlaceholders})`).all(videoIds);
        }
    }
    
    // Build structure
    const progressMap = {};
    progress.forEach(p => {
        progressMap[p.video_id] = {
            status: p.status,
            lastPositionSeconds: p.last_position_seconds,
            completedAt: p.completed_at
        };
    });
    
    const videosMap = {};
    videos.forEach(v => {
        if (!videosMap[v.subject_id]) videosMap[v.subject_id] = [];
        videosMap[v.subject_id].push({
            id: v.id,
            videoNumber: v.video_number,
            title: v.title,
            durationSeconds: v.duration_seconds,
            url: v.url,
            progress: progressMap[v.id] || { status: 'todo', lastPositionSeconds: 0, completedAt: null }
        });
    });
    
    const subjectsMap = {};
    subjects.forEach(s => {
        if (!subjectsMap[s.module_id]) subjectsMap[s.module_id] = [];
        subjectsMap[s.module_id].push({
            id: s.id,
            name: s.name,
            videos: videosMap[s.id] || []
        });
    });
    
    const result = modules.map(m => ({
        id: m.id,
        moduleNumber: m.module_number,
        title: m.title,
        subjects: subjectsMap[m.id] || []
    }));
    
    res.json(result);
}));

// PUT /api/programs/:programId/videos/:videoId/progress - Update progress of a video
router.put('/:programId/videos/:videoId/progress', asyncRoute(async (req, res) => {
    const { programId, videoId } = req.params;
    const { status, lastPositionSeconds } = req.body;
    
    assertProgramExists(programId);
    
    // Check if video exists
    const video = db.prepare('SELECT id FROM videos WHERE id = ?').get(videoId);
    if (!video) {
        const err = new Error('Vídeo não encontrado.');
        err.statusCode = 404;
        throw err;
    }
    
    if (!status || !['todo', 'watching', 'done'].includes(status)) {
        const err = new Error('Status inválido.');
        err.statusCode = 400;
        throw err;
    }
    
    const pos = lastPositionSeconds ? parseInt(lastPositionSeconds, 10) : 0;
    const completedAt = status === 'done' ? Date.now() : null;
    const now = Date.now();
    
    db.prepare(`
        INSERT INTO video_progress (video_id, status, last_position_seconds, completed_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(video_id) DO UPDATE SET
            status = excluded.status,
            last_position_seconds = excluded.last_position_seconds,
            completed_at = excluded.completed_at,
            updated_at = excluded.updated_at
    `).run(videoId, status, pos, completedAt, now);
    
    res.json({ ok: true });
}));

module.exports = router;
