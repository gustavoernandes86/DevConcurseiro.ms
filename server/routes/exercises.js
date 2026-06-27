const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db/connection');
const asyncRoute = require('../middleware/asyncRoute');
const AppError = require('../utils/AppError');

function assertProgramExists(programId) {
    const program = db.prepare('SELECT id FROM learning_programs WHERE id = ?').get(programId);
    if (!program) throw AppError.notFound('Programa de aprendizado não encontrado.');
}

const { generateExercisesForContent } = require('../services/exerciseGenerator');
const { getTextForMaterialPages } = require('../services/pdfTextExtractor');

// GET /api/programs/:programId/exercises/today - Check exercises status for today
router.get('/:programId/exercises/today', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    const { dateStr } = req.query;

    assertProgramExists(programId);

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw AppError.badRequest('O campo dateStr é obrigatório e deve seguir o formato YYYY-MM-DD.');
    }

    // Number of pages read today
    const pagesRead = db.prepare(`
        SELECT COUNT(*) as count FROM material_reading_log 
        WHERE program_id = ? AND date_str = ?
    `).get(programId, dateStr).count;

    // Check if exercise session exists for today
    const session = db.prepare(`
        SELECT id, date_str, questions_json, answers_json, score, completed_at
        FROM exercise_sessions 
        WHERE program_id = ? AND date_str = ?
        ORDER BY created_at DESC
        LIMIT 1
    `).get(programId, dateStr);

    res.json({
        pagesReadCount: pagesRead,
        hasExercises: !!session,
        session: session ? {
            id: session.id,
            questions: JSON.parse(session.questions_json),
            answers: session.answers_json ? JSON.parse(session.answers_json) : null,
            score: session.score,
            completedAt: session.completed_at
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

// DELETE /api/programs/:programId/exercises/sessions/:sessionId - Delete an exercise session
router.delete('/:programId/exercises/sessions/:sessionId', asyncRoute(async (req, res) => {
    const { programId, sessionId } = req.params;
    assertProgramExists(programId);

    // Verify session exists and belongs to this program
    const session = db.prepare('SELECT id FROM exercise_sessions WHERE id = ? AND program_id = ?').get(sessionId, programId);
    if (!session) {
        throw AppError.notFound('Simulado não encontrado.');
    }

    // Delete associated sources first
    db.prepare('DELETE FROM exercise_sources WHERE exercise_session_id = ?').run(sessionId);
    db.prepare('DELETE FROM exercise_sessions WHERE id = ?').run(sessionId);

    res.json({ success: true, message: 'Simulado removido com sucesso.' });
}));

// POST /api/programs/:programId/exercises/generate - Generate exercise session
router.post('/:programId/exercises/generate', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    const { dateStr } = req.body;

    assertProgramExists(programId);

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw AppError.badRequest('O campo dateStr é obrigatório e deve seguir o formato YYYY-MM-DD.');
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
        throw AppError.badRequest('Nenhuma página lida hoje.');
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
        throw new AppError('Não foi possível obter texto dos PDFs lidos para gerar questões.', 500);
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

// POST /api/programs/:programId/exercises/generate-custom - Generate custom dynamic exercise session
router.post('/:programId/exercises/generate-custom', asyncRoute(async (req, res) => {
    const { programId } = req.params;
    const { sourceType, numQuestions = 10, topicIds } = req.body;

    assertProgramExists(programId);

    if (!sourceType || !['pdf_reading', 'manual_topic'].includes(sourceType)) {
        throw AppError.badRequest('O campo sourceType é obrigatório e deve ser "pdf_reading" ou "manual_topic".');
    }

    const dateStr = new Date().toISOString().split('T')[0];
    let extractedContent = '';
    const pagesListForSources = []; // Array of { materialId, pageNumber, topicId }

    if (sourceType === 'pdf_reading') {
        // Get pages read today
        const pagesRead = db.prepare(`
            SELECT material_id, page_number FROM material_reading_log 
            WHERE program_id = ? AND date_str = ? 
            ORDER BY timestamp ASC
        `).all(programId, dateStr);

        if (pagesRead.length === 0) {
            throw AppError.badRequest('Nenhuma página de PDF lida hoje.');
        }

        // Group pages by material
        const matPages = {};
        pagesRead.forEach(row => {
            if (!matPages[row.material_id]) matPages[row.material_id] = [];
            matPages[row.material_id].push(row.page_number);
        });

        // Extract text from pages
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
                console.error(`[Custom Exercise Route] Failed to extract text for material ${matId}:`, err.message);
            }
        }

        pagesRead.forEach(p => {
            const topic = db.prepare('SELECT topic_id FROM topic_materials WHERE material_id = ? LIMIT 1').get(p.material_id);
            pagesListForSources.push({
                materialId: p.material_id,
                pageNumber: p.page_number,
                topicId: topic ? topic.topic_id : null
            });
        });
    } else if (sourceType === 'manual_topic') {
        if (!topicIds || !Array.isArray(topicIds) || topicIds.length === 0) {
            throw AppError.badRequest('O campo topicIds é obrigatório e deve ser uma lista não vazia para sourceType "manual_topic".');
        }

        // Get material pages mapping for selected topics
        const pagesToRead = [];
        for (const topicId of topicIds) {
            const mappings = db.prepare('SELECT material_id, start_page, end_page FROM topic_materials WHERE topic_id = ?').all(topicId);
            for (const map of mappings) {
                const start = map.start_page || 1;
                // Se end_page for nulo, limitamos em start + 15 páginas
                const end = map.end_page || (start + 15);
                for (let p = start; p <= end; p++) {
                    pagesToRead.push({ materialId: map.material_id, pageNumber: p, topicId });
                }
            }
        }

        if (pagesToRead.length === 0) {
            throw AppError.badRequest('Nenhum PDF didático encontrado nos tópicos selecionados.');
        }

        // Group pages by material and limit pages to avoid token overflow
        const matPages = {};
        pagesToRead.forEach(p => {
            if (!matPages[p.materialId]) matPages[p.materialId] = [];
            if (matPages[p.materialId].length < 25) {
                matPages[p.materialId].push(p.pageNumber);
            }
        });

        // Extract text
        for (const [matId, pagesArray] of Object.entries(matPages)) {
            const material = db.prepare('SELECT title FROM materials WHERE id = ?').get(matId);
            const displayTitle = material ? material.title : matId;
            try {
                const pagesText = await getTextForMaterialPages(matId, pagesArray);
                const combinedText = Object.values(pagesText).join(' ');
                if (combinedText.trim().length > 100) {
                    extractedContent += `\n\n=== CONTEÚDO: ${displayTitle} (páginas extraídas: ${pagesArray.join(', ')}) ===\n${combinedText.substring(0, 8000)}`;
                }
            } catch (err) {
                console.error(`[Custom Exercise Route] Failed to extract text for manual material ${matId}:`, err.message);
            }
        }

        // Save topic sources
        topicIds.forEach(topicId => {
            const mappings = db.prepare('SELECT DISTINCT material_id FROM topic_materials WHERE topic_id = ?').all(topicId);
            if (mappings.length > 0) {
                mappings.forEach(map => {
                    pagesListForSources.push({
                        materialId: map.material_id,
                        pageNumber: null,
                        topicId: topicId
                    });
                });
            } else {
                pagesListForSources.push({
                    materialId: null,
                    pageNumber: null,
                    topicId: topicId
                });
            }
        });
    }

    if (!extractedContent.trim()) {
        throw new AppError('Não foi possível obter texto dos materiais didáticos para gerar as questões.', 500);
    }

    // Generate questions using the AI service with dynamic numQuestions
    const questions = await generateExercisesForContent(programId, extractedContent, numQuestions);

    const sessionId = `session-${Date.now()}`;
    const now = Date.now();

    // Save exercise session
    db.prepare(`
        INSERT INTO exercise_sessions (id, program_id, date_str, source_type, questions_json, total_questions, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, programId, dateStr, sourceType, JSON.stringify(questions), numQuestions, now);

    // Save exercise sources
    const insertSource = db.prepare(`
        INSERT INTO exercise_sources (exercise_session_id, material_id, topic_id, page_number)
        VALUES (?, ?, ?, ?)
    `);

    pagesListForSources.forEach(p => {
        insertSource.run(sessionId, p.materialId, p.topicId, p.pageNumber);
    });

    res.json({ id: sessionId, questions });
}));

// POST /api/programs/:programId/exercises/:sessionId/save - Save quiz answers
router.post('/:programId/exercises/:sessionId/save', asyncRoute(async (req, res) => {
    const { programId, sessionId } = req.params;
    const { answers, score } = req.body;

    assertProgramExists(programId);

    if (!answers || typeof answers !== 'object') {
        throw AppError.badRequest('O campo answers é obrigatório.');
    }
    if (score === undefined || typeof score !== 'number') {
        throw AppError.badRequest('O campo score é obrigatório e deve ser numérico.');
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

    res.json({ ok: true, completedAt: now });
}));

module.exports = router;
