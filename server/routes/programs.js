const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const asyncRoute = require('../middleware/asyncRoute');
const { resolveInsideRoot, assertPdfPath } = require('../utils/safePath');
const path = require('path');
const fs = require('fs');

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

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_api_key_here') {
        const err = new Error('GEMINI_API_KEY não configurada.');
        err.statusCode = 500;
        throw err;
    }

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
        if (!matPages[row.material_id]) matPages[row.material_id] = new Set();
        matPages[row.material_id].add(row.page_number);
    });

    let extractedContent = '';
    const pdfParse = require('pdf-parse');
    const rootDir = process.env.PDF_ROOT || path.join(__dirname, '../../public/pdfs');

    for (const [matId, pagesSet] of Object.entries(matPages)) {
        // Resolve material details from database
        const material = db.prepare('SELECT path, title FROM materials WHERE id = ?').get(matId);
        if (!material || !material.path) {
            console.warn(`[Exercise Generator] Material not found or path missing: ${matId}`);
            continue;
        }

        const pdfAbsPath = resolveInsideRoot(rootDir, material.path);
        assertPdfPath(pdfAbsPath);

        if (!fs.existsSync(pdfAbsPath)) {
            console.warn(`PDF file not found: ${pdfAbsPath}`);
            continue;
        }

        try {
            const dataBuffer = fs.readFileSync(pdfAbsPath);
            const sortedPages = Array.from(pagesSet).sort((a, b) => a - b);
            const pagesToExtract = sortedPages.slice(0, 30);

            const parsed = await pdfParse(dataBuffer, {
                max: Math.max(...pagesToExtract),
                pagerender: function(pageData) {
                    return pageData.getTextContent().then(function(textContent) {
                        return textContent.items.map(item => item.str).join(' ');
                    });
                }
            });

            const trimmedText = parsed.text.trim().substring(0, 8000);
            if (trimmedText.length > 100) {
                extractedContent += `\n\n=== CONTEÚDO: ${material.title} (páginas lidas: ${pagesToExtract.join(', ')}) ===\n${trimmedText}`;
            }
        } catch (pdfErr) {
            console.error(`Erro ao extrair PDF ${material.path}:`, pdfErr.message);
        }
    }

    if (!extractedContent.trim()) {
        const err = new Error('Não foi possível extrair texto dos PDFs lidos. Verifique se os arquivos existem.');
        err.statusCode = 500;
        throw err;
    }

    // Build prompt for Cesgranrio
    const prompt = `Você é um especialista em concursos públicos brasileiros e irá criar uma lista de exercícios de fixação no estilo da banca CESGRANRIO.

Com base no conteúdo estudado abaixo, elabore EXATAMENTE 10 questões de múltipla escolha (estilo Cesgranrio), cada uma com 5 alternativas (A, B, C, D e E) e apenas uma resposta correta.

REGRAS OBRIGATÓRIAS:
- As questões devem ser baseadas exclusivamente no conteúdo fornecido
- O nível de dificuldade deve ser moderado a alto (nível concurso público federal)
- As alternativas incorretas devem ser plausíveis (não óbvias)
- Cada questão deve ter um gabarito comentado objetivo e muito sucinto (máximo de 3 frases) explicando por que a resposta correta é a certa e por que as outras estão erradas. Evite explicações excessivamente longas para não estourar limites.
- Responda APENAS com JSON válido, sem nenhum texto fora do JSON

FORMATO JSON OBRIGATÓRIO (array com exatamente 10 objetos):
[
  {
    "id": 1,
    "enunciado": "Texto da questão...",
    "alternativas": {
      "A": "Texto da alternativa A",
      "B": "Texto da alternativa B",
      "C": "Texto da alternativa C",
      "D": "Texto da alternativa D",
      "E": "Texto da alternativa E"
    },
    "resposta_correta": "A",
    "comentario": "A alternativa A está correta porque..."
  }
]

CONTEÚDO ESTUDADO HOJE:
${extractedContent.substring(0, 30000)}`;

    let attempts = 0;
    const maxRetries = 2;
    let questions = null;
    let lastError = null;

    while (attempts < maxRetries) {
        attempts++;
        try {
            console.log(`Tentativa ${attempts} de gerar exercícios com Gemini...`);
            const geminiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 8192,
                            responseMimeType: 'application/json',
                            responseSchema: {
                                type: 'ARRAY',
                                items: {
                                    type: 'OBJECT',
                                    properties: {
                                        id: { type: 'INTEGER' },
                                        enunciado: { type: 'STRING' },
                                        alternativas: {
                                            type: 'OBJECT',
                                            properties: {
                                                A: { type: 'STRING' },
                                                B: { type: 'STRING' },
                                                C: { type: 'STRING' },
                                                D: { type: 'STRING' },
                                                E: { type: 'STRING' }
                                            },
                                            required: ["A", "B", "C", "D", "E"]
                                        },
                                        resposta_correta: { type: 'STRING' },
                                        comentario: { type: 'STRING' }
                                    },
                                    required: ["id", "enunciado", "alternativas", "resposta_correta", "comentario"]
                                }
                            }
                        }
                    })
                }
            );

            if (!geminiRes.ok) {
                const errText = await geminiRes.text();
                throw new Error('Erro na API do Gemini: ' + geminiRes.status + ' - ' + errText);
            }

            const geminiData = await geminiRes.json();
            const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!rawText) {
                throw new Error('A API do Gemini não retornou conteúdo');
            }

            try {
                questions = JSON.parse(rawText);
            } catch (parseErr) {
                const match = rawText.match(/\[[\s\S]*\]/);
                if (match) {
                    questions = JSON.parse(match[0]);
                } else {
                    throw new Error('Resposta da IA em formato JSON inválido');
                }
            }

            if (!Array.isArray(questions) || questions.length < 5) {
                throw new Error('A IA não gerou questões suficientes.');
            }
            break;
        } catch (err) {
            console.error(`Falha na geração de simulado (tentativa ${attempts}):`, err.message);
            lastError = err;
            if (attempts < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
    }

    if (!questions) {
        const err = new Error(lastError?.message || 'Erro ao gerar simulado no Gemini.');
        err.statusCode = 500;
        throw err;
    }

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

module.exports = router;
