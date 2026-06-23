require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');

const db = require('./db/connection');
const { runMigrations } = require('./db/migrate');
const asyncRoute = require('./middleware/asyncRoute');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ─── Middleware ───
app.use(express.json({ limit: '10mb' }));

// Security: Prevent path traversal and static access to sensitive files
app.use((req, res, next) => {
    const url = decodeURIComponent(req.path).toLowerCase();
    
    const sensitivePatterns = [
        /\.env/i,
        /\.db/i,
        /\.git/i,
        /\.zip/i,
        /package\.json/i,
        /package-lock\.json/i,
        /yarn\.lock/i,
        /^\/server/i,
        /^\/tools/i,
        /^\/data/i
    ];

    const isSensitive = sensitivePatterns.some(pattern => pattern.test(url));
    if (isSensitive) {
        return res.status(403).json({ error: 'Acesso negado: arquivo ou diretório restrito.' });
    }
    next();
});

// Serve application files (HTML, etc.) from the project root
app.use(express.static(path.join(__dirname, '..'), {
    extensions: ['html'],
    index: 'plano_estudos.html'
}));

// Serve PDFs and other files from the parent directory of the project (one level above the project root)
app.use(express.static(path.join(__dirname, '../..')));

// ─── Modular API Routes (Phases 3 & 4) ───
app.use('/api/contests', require('./routes/contests'));
app.use('/api/programs', require('./routes/programs'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/config', require('./routes/config'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/admin', require('./routes/admin'));

// ─── API Routes with Validation and Error Handling (Legacy) ───

// ════════════════════════════════════════
//  API: COMPLETED TOPICS
// ════════════════════════════════════════
app.get('/api/topics', asyncRoute(async (req, res) => {
    const rows = db.prepare('SELECT topic_id, completed_at FROM completed_topics').all();
    const result = {};
    rows.forEach(r => result[r.topic_id] = r.completed_at);
    res.json(result);
}));

app.post('/api/topics/:id', asyncRoute(async (req, res) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || !id.trim()) {
        const err = new Error('O ID do tópico é obrigatório.');
        err.statusCode = 400;
        throw err;
    }

    const completedAt = req.body.completed_at || Date.now();
    if (completedAt && typeof completedAt !== 'number') {
        const err = new Error('O campo completed_at deve ser um timestamp numérico.');
        err.statusCode = 400;
        throw err;
    }

    db.prepare('INSERT OR REPLACE INTO completed_topics (topic_id, completed_at) VALUES (?, ?)').run(id, completedAt);
    res.json({ ok: true });
}));

app.delete('/api/topics/:id', asyncRoute(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        const err = new Error('O ID do tópico é obrigatório.');
        err.statusCode = 400;
        throw err;
    }
    db.prepare('DELETE FROM completed_topics WHERE topic_id = ?').run(id);
    res.json({ ok: true });
}));

app.delete('/api/topics', asyncRoute(async (req, res) => {
    db.prepare('DELETE FROM completed_topics').run();
    res.json({ ok: true });
}));

// ════════════════════════════════════════
//  API: STUDY NOTES
// ════════════════════════════════════════
app.get('/api/notes', asyncRoute(async (req, res) => {
    const rows = db.prepare('SELECT topic_id, note FROM study_notes').all();
    const result = {};
    rows.forEach(r => result[r.topic_id] = r.note);
    res.json(result);
}));

app.put('/api/notes/:id', asyncRoute(async (req, res) => {
    const { id } = req.params;
    const { note } = req.body;

    if (!id || typeof id !== 'string' || !id.trim()) {
        const err = new Error('O ID do tópico é obrigatório.');
        err.statusCode = 400;
        throw err;
    }

    if (note && note.trim()) {
        db.prepare('INSERT OR REPLACE INTO study_notes (topic_id, note) VALUES (?, ?)').run(id, note);
    } else {
        db.prepare('DELETE FROM study_notes WHERE topic_id = ?').run(id);
    }
    res.json({ ok: true });
}));

// ════════════════════════════════════════
//  API: STUDY LOG
// ════════════════════════════════════════
app.get('/api/log', asyncRoute(async (req, res) => {
    const rows = db.prepare('SELECT id, timestamp, type, duration FROM study_log ORDER BY id ASC').all();
    res.json(rows);
}));

app.post('/api/log', asyncRoute(async (req, res) => {
    const { timestamp, type, duration } = req.body;

    if (!timestamp || typeof timestamp !== 'number') {
        const err = new Error('O campo timestamp é obrigatório e deve ser um número.');
        err.statusCode = 400;
        throw err;
    }
    if (!type || typeof type !== 'string' || !type.trim()) {
        const err = new Error('O campo type é obrigatório e deve ser uma string.');
        err.statusCode = 400;
        throw err;
    }
    if (duration === undefined || typeof duration !== 'number') {
        const err = new Error('O campo duration é obrigatório e deve ser um número.');
        err.statusCode = 400;
        throw err;
    }

    const result = db.prepare('INSERT INTO study_log (timestamp, type, duration) VALUES (?, ?, ?)').run(timestamp, type, duration);
    res.json({ ok: true, id: result.lastInsertRowid });
}));

app.delete('/api/log/:id', asyncRoute(async (req, res) => {
    const { id } = req.params;
    if (!id || isNaN(parseInt(id, 10))) {
        const err = new Error('O ID do log é obrigatório e deve ser numérico.');
        err.statusCode = 400;
        throw err;
    }
    db.prepare('DELETE FROM study_log WHERE id = ?').run(id);
    res.json({ ok: true });
}));

// ════════════════════════════════════════
//  API: APP CONFIG (generic key-value)
// ════════════════════════════════════════
app.get('/api/config', asyncRoute(async (req, res) => {
    const rows = db.prepare('SELECT key, value FROM app_config').all();
    const result = {};
    rows.forEach(r => {
        try { result[r.key] = JSON.parse(r.value); }
        catch { result[r.key] = r.value; }
    });
    res.json(result);
}));

app.put('/api/config/:key', asyncRoute(async (req, res) => {
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
    db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run(key, valueStr);
    res.json({ ok: true });
}));

// ════════════════════════════════════════
//  API: PDF BOOKMARKS
// ════════════════════════════════════════
app.get('/api/bookmarks', asyncRoute(async (req, res) => {
    const rows = db.prepare('SELECT pdf_key, current_page, total_pages, last_read_at FROM pdf_bookmarks').all();
    const result = {};
    rows.forEach(r => result[r.pdf_key] = {
        currentPage: r.current_page,
        totalPages: r.total_pages,
        lastReadAt: r.last_read_at
    });
    res.json(result);
}));

app.put('/api/bookmarks/:key', asyncRoute(async (req, res) => {
    const pdfKey = decodeURIComponent(req.params.key);
    const { currentPage, totalPages } = req.body;

    if (!pdfKey || !pdfKey.trim()) {
        const err = new Error('A chave do PDF é obrigatória.');
        err.statusCode = 400;
        throw err;
    }
    if (currentPage !== undefined && (typeof currentPage !== 'number' || currentPage < 1)) {
        const err = new Error('O campo currentPage deve ser um número maior ou igual a 1.');
        err.statusCode = 400;
        throw err;
    }
    if (totalPages !== undefined && (typeof totalPages !== 'number' || totalPages < 1)) {
        const err = new Error('O campo totalPages deve ser um número maior ou igual a 1.');
        err.statusCode = 400;
        throw err;
    }

    // Safety check path traversal if pdfKey contains path characters
    const { resolveInsideRoot, assertPdfPath } = require('./utils/safePath');
    try {
        const pdfRelPath = pdfKey.split('#')[0];
        const rootDir = path.join(__dirname, '../..'); // Root of parent files
        const resolved = resolveInsideRoot(rootDir, pdfRelPath);
        assertPdfPath(resolved);
    } catch (pathErr) {
        // If not a path (e.g. just a generic key), we can still allow it, but if it is a path, sanitize it.
        if (pdfKey.includes('/') || pdfKey.includes('\\') || pdfKey.includes('..')) {
            throw pathErr;
        }
    }

    const now = Date.now();
    db.prepare(
        'INSERT OR REPLACE INTO pdf_bookmarks (pdf_key, current_page, total_pages, last_read_at) VALUES (?, ?, ?, ?)'
    ).run(pdfKey, currentPage || 1, totalPages || 1, now);
    res.json({ ok: true });
}));

// ════════════════════════════════════════
//  API: PDF READING LOG
// ════════════════════════════════════════
app.post('/api/reading-log', asyncRoute(async (req, res) => {
    const { pdfKey, pageNumber, dateStr } = req.body;

    if (!pdfKey || typeof pdfKey !== 'string' || !pdfKey.trim()) {
        const err = new Error('O campo pdfKey é obrigatório.');
        err.statusCode = 400;
        throw err;
    }
    if (pageNumber === undefined || typeof pageNumber !== 'number' || pageNumber < 1) {
        const err = new Error('O campo pageNumber é obrigatório e deve ser um número maior ou igual a 1.');
        err.statusCode = 400;
        throw err;
    }
    if (!dateStr || typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const err = new Error('O campo dateStr é obrigatório e deve seguir o formato YYYY-MM-DD.');
        err.statusCode = 400;
        throw err;
    }

    // Safety check path traversal
    const { resolveInsideRoot, assertPdfPath } = require('./utils/safePath');
    const pdfRelPath = pdfKey.split('#')[0];
    const rootDir = path.join(__dirname, '../..');
    const resolved = resolveInsideRoot(rootDir, pdfRelPath);
    assertPdfPath(resolved);

    db.prepare(
        'INSERT OR IGNORE INTO pdf_reading_log (pdf_key, page_number, date_str, timestamp) VALUES (?, ?, ?, ?)'
    ).run(pdfKey, pageNumber, dateStr, Date.now());
    res.json({ ok: true });
}));

app.get('/api/reading-log/:dateStr', asyncRoute(async (req, res) => {
    const { dateStr } = req.params;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const err = new Error('O campo dateStr deve seguir o formato YYYY-MM-DD.');
        err.statusCode = 400;
        throw err;
    }
    const rows = db.prepare(
        'SELECT pdf_key, page_number FROM pdf_reading_log WHERE date_str = ? ORDER BY timestamp ASC'
    ).all(dateStr);
    res.json(rows);
}));

// ════════════════════════════════════════
//  API: EXERCISES
// ════════════════════════════════════════
app.get('/api/exercises/today', asyncRoute(async (req, res) => {
    const { dateStr } = req.query;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const err = new Error('O campo dateStr é obrigatório e deve seguir o formato YYYY-MM-DD.');
        err.statusCode = 400;
        throw err;
    }

    const pagesRead = db.prepare(
        'SELECT COUNT(*) as count FROM pdf_reading_log WHERE date_str = ?'
    ).get(dateStr);

    const session = db.prepare(
        'SELECT date_str, questions_json, answers_json, score FROM exercises_session WHERE date_str = ?'
    ).get(dateStr);

    res.json({
        pagesReadCount: pagesRead ? pagesRead.count : 0,
        hasExercises: !!session,
        session: session ? {
            questions: JSON.parse(session.questions_json),
            answers: session.answers_json ? JSON.parse(session.answers_json) : null,
            score: session.score
        } : null
    });
}));

app.get('/api/exercises/history', asyncRoute(async (req, res) => {
    const rows = db.prepare('SELECT date_str, questions_json, answers_json, score, created_at FROM exercises_session ORDER BY created_at DESC').all();
    const result = rows.map(r => ({
        dateStr: r.date_str,
        questions: JSON.parse(r.questions_json),
        answers: r.answers_json ? JSON.parse(r.answers_json) : null,
        score: r.score,
        createdAt: r.created_at
    }));
    res.json(result);
}));

app.post('/api/exercises/generate', asyncRoute(async (req, res) => {
    const { dateStr } = req.body;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const err = new Error('O campo dateStr é obrigatório e deve seguir o formato YYYY-MM-DD.');
        err.statusCode = 400;
        throw err;
    }

    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_api_key_here') {
        const err = new Error('GEMINI_API_KEY não configurada. Edite o arquivo .env.');
        err.statusCode = 500;
        throw err;
    }

    const existing = db.prepare('SELECT questions_json FROM exercises_session WHERE date_str = ?').get(dateStr);
    if (existing) {
        return res.json({ questions: JSON.parse(existing.questions_json) });
    }

    const pagesRead = db.prepare(
        'SELECT pdf_key, page_number FROM pdf_reading_log WHERE date_str = ? ORDER BY timestamp ASC'
    ).all(dateStr);

    if (pagesRead.length === 0) {
        const err = new Error('Nenhuma página lida hoje.');
        err.statusCode = 400;
        throw err;
    }

    const pdfPages = {};
    pagesRead.forEach(row => {
        const pdfPath = row.pdf_key.split('#')[0];
        if (!pdfPages[pdfPath]) pdfPages[pdfPath] = new Set();
        pdfPages[pdfPath].add(row.page_number);
    });

    let extractedContent = '';
    const pdfParse = require('pdf-parse');
    const rootDir = path.join(__dirname, '../..');
    const { resolveInsideRoot, assertPdfPath } = require('./utils/safePath');

    for (const [pdfRelPath, pagesSet] of Object.entries(pdfPages)) {
        // Sanitize path to prevent traverse leakage
        const pdfAbsPath = resolveInsideRoot(rootDir, pdfRelPath);
        assertPdfPath(pdfAbsPath);

        if (!fs.existsSync(pdfAbsPath)) {
            console.warn(`PDF não encontrado: ${pdfAbsPath}`);
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

            const filename = path.basename(pdfRelPath);
            const displayName = filename.replace(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d+-/, '')
                .replace(/-e\d+\.pdf$/, '.pdf')
                .replace(/\.pdf$/, '')
                .replace(/-/g, ' ');

            const trimmedText = parsed.text.trim().substring(0, 8000);
            if (trimmedText.length > 100) {
                extractedContent += `\n\n=== CONTEÚDO: ${displayName} (páginas lidas: ${pagesToExtract.join(', ')}) ===\n${trimmedText}`;
            }
        } catch (pdfErr) {
            console.error(`Erro ao extrair PDF ${pdfRelPath}:`, pdfErr.message);
        }
    }

    if (!extractedContent.trim()) {
        const err = new Error('Não foi possível extrair texto dos PDFs lidos. Verifique se os arquivos existem.');
        err.statusCode = 500;
        throw err;
    }

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
                throw new Error('A IA não gerou questões suficientes. Geradas: ' + (questions ? questions.length : 0));
            }
            break;
        } catch (err) {
            console.error(`Falha na tentativa ${attempts}:`, err.message);
            lastError = err;
            if (attempts < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
    }

    if (!questions) {
        const err = new Error(lastError?.message || 'Erro ao gerar exercícios após várias tentativas.');
        err.statusCode = 500;
        throw err;
    }

    db.prepare(
        'INSERT OR REPLACE INTO exercises_session (date_str, questions_json, created_at) VALUES (?, ?, ?)'
    ).run(dateStr, JSON.stringify(questions), Date.now());

    res.json({ questions });
}));

app.post('/api/exercises/save', asyncRoute(async (req, res) => {
    const { dateStr, answers, score } = req.body;

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const err = new Error('O campo dateStr é obrigatório e deve seguir o formato YYYY-MM-DD.');
        err.statusCode = 400;
        throw err;
    }
    if (!answers || typeof answers !== 'object') {
        const err = new Error('O campo answers é obrigatório e deve ser um objeto.');
        err.statusCode = 400;
        throw err;
    }
    if (score !== undefined && typeof score !== 'number') {
        const err = new Error('O campo score deve ser um número.');
        err.statusCode = 400;
        throw err;
    }

    db.prepare(
        'UPDATE exercises_session SET answers_json = ?, score = ? WHERE date_str = ?'
    ).run(JSON.stringify(answers), score || 0, dateStr);
    res.json({ ok: true });
}));

// ════════════════════════════════════════
//  API: EXPORT / IMPORT (full backup)
// ════════════════════════════════════════
app.get('/api/export', asyncRoute(async (req, res) => {
    const data = {
        completedTopics: {},
        studyNotes: {},
        studyLog: [],
        config: {},
        pdfBookmarks: {},
        exportDate: new Date().toISOString()
    };

    db.prepare('SELECT topic_id, completed_at FROM completed_topics').all()
        .forEach(r => data.completedTopics[r.topic_id] = r.completed_at);

    db.prepare('SELECT topic_id, note FROM study_notes').all()
        .forEach(r => data.studyNotes[r.topic_id] = r.note);

    data.studyLog = db.prepare('SELECT id, timestamp, type, duration FROM study_log ORDER BY id ASC').all();

    db.prepare('SELECT key, value FROM app_config').all()
        .forEach(r => {
            try { data.config[r.key] = JSON.parse(r.value); }
            catch { data.config[r.key] = r.value; }
        });

    db.prepare('SELECT pdf_key, current_page, total_pages, last_read_at FROM pdf_bookmarks').all()
        .forEach(r => data.pdfBookmarks[r.pdf_key] = {
            currentPage: r.current_page,
            totalPages: r.total_pages,
            lastReadAt: r.last_read_at
        });

    res.json(data);
}));

app.post('/api/import', asyncRoute(async (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object') {
        const err = new Error('O payload de importação é obrigatório e deve ser um JSON.');
        err.statusCode = 400;
        throw err;
    }

    const importTransaction = db.transaction(() => {
        if (data.completedTopics) {
            db.prepare('DELETE FROM completed_topics').run();
            const stmt = db.prepare('INSERT INTO completed_topics (topic_id, completed_at) VALUES (?, ?)');
            for (const [id, ts] of Object.entries(data.completedTopics)) {
                stmt.run(id, ts);
            }
        }

        if (data.studyNotes) {
            db.prepare('DELETE FROM study_notes').run();
            const stmt = db.prepare('INSERT INTO study_notes (topic_id, note) VALUES (?, ?)');
            for (const [id, note] of Object.entries(data.studyNotes)) {
                stmt.run(id, note);
            }
        }

        if (data.studyLog) {
            db.prepare('DELETE FROM study_log').run();
            const stmt = db.prepare('INSERT INTO study_log (timestamp, type, duration) VALUES (?, ?, ?)');
            data.studyLog.forEach(entry => {
                stmt.run(entry.timestamp, entry.type, entry.duration);
            });
        }

        if (data.config) {
            db.prepare('DELETE FROM app_config').run();
            const stmt = db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?)');
            for (const [key, value] of Object.entries(data.config)) {
                stmt.run(key, JSON.stringify(value));
            }
        }

        if (data.pdfBookmarks) {
            db.prepare('DELETE FROM pdf_bookmarks').run();
            const stmt = db.prepare('INSERT INTO pdf_bookmarks (pdf_key, current_page, total_pages, last_read_at) VALUES (?, ?, ?, ?)');
            for (const [key, bm] of Object.entries(data.pdfBookmarks)) {
                stmt.run(key, bm.currentPage || 1, bm.totalPages || 1, bm.lastReadAt || Date.now());
            }
        }

        if (data.pomodoroState) {
            db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run('pomodoroState', JSON.stringify(data.pomodoroState));
        }
        if (data.pomodoroConfig) {
            db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run('pomodoroConfig', JSON.stringify(data.pomodoroConfig));
        }
        if (data.soundConfig) {
            db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run('soundConfig', JSON.stringify(data.soundConfig));
        }
    });

    importTransaction();
    res.json({ ok: true });
}));

// ════════════════════════════════════════
//  API: MIGRATE FROM LOCALSTORAGE (one-shot)
// ════════════════════════════════════════
app.post('/api/migrate', asyncRoute(async (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object') {
        const err = new Error('O payload de migração é obrigatório.');
        err.statusCode = 400;
        throw err;
    }

    const migrateTransaction = db.transaction(() => {
        if (data.completedTopics && Object.keys(data.completedTopics).length > 0) {
            const stmt = db.prepare('INSERT OR IGNORE INTO completed_topics (topic_id, completed_at) VALUES (?, ?)');
            for (const [id, ts] of Object.entries(data.completedTopics)) {
                stmt.run(id, ts);
            }
        }
        if (data.studyNotes && Object.keys(data.studyNotes).length > 0) {
            const stmt = db.prepare('INSERT OR IGNORE INTO study_notes (topic_id, note) VALUES (?, ?)');
            for (const [id, note] of Object.entries(data.studyNotes)) {
                stmt.run(id, note);
            }
        }
        if (data.studyLog && data.studyLog.length > 0) {
            const stmt = db.prepare('INSERT INTO study_log (timestamp, type, duration) VALUES (?, ?, ?)');
            data.studyLog.forEach(entry => {
                stmt.run(entry.timestamp, entry.type, entry.duration);
            });
        }
        if (data.pomodoroState) {
            db.prepare('INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)').run('pomodoroState', JSON.stringify(data.pomodoroState));
        }
        if (data.pomodoroConfig) {
            db.prepare('INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)').run('pomodoroConfig', JSON.stringify(data.pomodoroConfig));
        }
        if (data.soundConfig) {
            db.prepare('INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)').run('soundConfig', JSON.stringify(data.soundConfig));
        }
        if (data.pdfPanelWidth) {
            db.prepare('INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)').run('pdfPanelWidth', JSON.stringify(data.pdfPanelWidth));
        }
    });

    migrateTransaction();
    res.json({ ok: true, message: 'Migração concluída com sucesso' });
}));

// Fallback HTML page loading
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../plano_estudos.html'));
});

// Error handling middleware
app.use(errorHandler);

// ─── Startup sequence ───
runMigrations()
    .then(async () => {
        // Automatically load and sync contest configurations on startup
        try {
            const { loadAllContests } = require('./services/contestLoader');
            await loadAllContests();
        } catch (loaderErr) {
            console.error('[Loader Error] Failed to load contest configurations during boot:', loaderErr.message);
        }

        app.listen(PORT, () => {
            console.log(`\n  🛢️  Plano de Estudos Petrobras (Restruturado)`);
            console.log(`  ─────────────────────────────`);
            console.log(`  🌐 http://localhost:${PORT}`);
            console.log(`  💾 SQLite: ${db.name}`);
            if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_api_key_here') {
                console.log(`  ⚠️  GEMINI_API_KEY não configurada (edite .env)`);
            } else {
                console.log(`  🤖 Gemini API: configurada`);
            }
            console.log(`  ✨ Servidor pronto!\n`);
        });
    })
    .catch(err => {
        console.error('[Migration Error] Critical: Migrations failed on boot. Server not started:', err);
        process.exit(1);
    });
