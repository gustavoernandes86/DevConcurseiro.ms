require('dotenv').config();

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ─── Middleware ───
app.use(express.json({ limit: '10mb' }));

// Serve os arquivos da aplicação (HTML, etc.)
app.use(express.static(path.join(__dirname), {
    extensions: ['html'],
    index: 'plano_estudos.html'
}));

// Serve os PDFs e demais arquivos do diretório raiz do projeto (um nível acima)
app.use(express.static(path.join(__dirname, '..')));

// ─── Database Init ───
const db = new Database(path.join(__dirname, 'estudos.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS completed_topics (
        topic_id TEXT PRIMARY KEY,
        completed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS study_notes (
        topic_id TEXT PRIMARY KEY,
        note TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS study_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        duration INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pdf_bookmarks (
        pdf_key TEXT PRIMARY KEY,
        current_page INTEGER NOT NULL DEFAULT 1,
        total_pages INTEGER NOT NULL DEFAULT 1,
        last_read_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pdf_reading_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pdf_key TEXT NOT NULL,
        page_number INTEGER NOT NULL,
        date_str TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        UNIQUE(pdf_key, page_number, date_str)
    );

    CREATE TABLE IF NOT EXISTS exercises_session (
        date_str TEXT PRIMARY KEY,
        questions_json TEXT NOT NULL,
        answers_json TEXT,
        score INTEGER,
        created_at INTEGER NOT NULL
    );
`);

// ════════════════════════════════════════
//  API: COMPLETED TOPICS
// ════════════════════════════════════════
app.get('/api/topics', (req, res) => {
    const rows = db.prepare('SELECT topic_id, completed_at FROM completed_topics').all();
    const result = {};
    rows.forEach(r => result[r.topic_id] = r.completed_at);
    res.json(result);
});

app.post('/api/topics/:id', (req, res) => {
    const { id } = req.params;
    const completedAt = req.body.completed_at || Date.now();
    db.prepare('INSERT OR REPLACE INTO completed_topics (topic_id, completed_at) VALUES (?, ?)').run(id, completedAt);
    res.json({ ok: true });
});

app.delete('/api/topics/:id', (req, res) => {
    db.prepare('DELETE FROM completed_topics WHERE topic_id = ?').run(req.params.id);
    res.json({ ok: true });
});

app.delete('/api/topics', (req, res) => {
    db.prepare('DELETE FROM completed_topics').run();
    res.json({ ok: true });
});

// ════════════════════════════════════════
//  API: STUDY NOTES
// ════════════════════════════════════════
app.get('/api/notes', (req, res) => {
    const rows = db.prepare('SELECT topic_id, note FROM study_notes').all();
    const result = {};
    rows.forEach(r => result[r.topic_id] = r.note);
    res.json(result);
});

app.put('/api/notes/:id', (req, res) => {
    const { id } = req.params;
    const { note } = req.body;
    if (note && note.trim()) {
        db.prepare('INSERT OR REPLACE INTO study_notes (topic_id, note) VALUES (?, ?)').run(id, note);
    } else {
        db.prepare('DELETE FROM study_notes WHERE topic_id = ?').run(id);
    }
    res.json({ ok: true });
});

// ════════════════════════════════════════
//  API: STUDY LOG
// ════════════════════════════════════════
app.get('/api/log', (req, res) => {
    const rows = db.prepare('SELECT id, timestamp, type, duration FROM study_log ORDER BY id ASC').all();
    res.json(rows);
});

app.post('/api/log', (req, res) => {
    const { timestamp, type, duration } = req.body;
    const result = db.prepare('INSERT INTO study_log (timestamp, type, duration) VALUES (?, ?, ?)').run(timestamp, type, duration);
    res.json({ ok: true, id: result.lastInsertRowid });
});

app.delete('/api/log/:id', (req, res) => {
    db.prepare('DELETE FROM study_log WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ════════════════════════════════════════
//  API: APP CONFIG (generic key-value)
// ════════════════════════════════════════
app.get('/api/config', (req, res) => {
    const rows = db.prepare('SELECT key, value FROM app_config').all();
    const result = {};
    rows.forEach(r => {
        try { result[r.key] = JSON.parse(r.value); }
        catch { result[r.key] = r.value; }
    });
    res.json(result);
});

app.put('/api/config/:key', (req, res) => {
    const { key } = req.params;
    const value = JSON.stringify(req.body.value);
    db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run(key, value);
    res.json({ ok: true });
});

// ════════════════════════════════════════
//  API: PDF BOOKMARKS
// ════════════════════════════════════════
app.get('/api/bookmarks', (req, res) => {
    const rows = db.prepare('SELECT pdf_key, current_page, total_pages, last_read_at FROM pdf_bookmarks').all();
    const result = {};
    rows.forEach(r => result[r.pdf_key] = {
        currentPage: r.current_page,
        totalPages: r.total_pages,
        lastReadAt: r.last_read_at
    });
    res.json(result);
});

app.put('/api/bookmarks/:key', (req, res) => {
    const pdfKey = decodeURIComponent(req.params.key);
    const { currentPage, totalPages } = req.body;
    const now = Date.now();
    db.prepare(
        'INSERT OR REPLACE INTO pdf_bookmarks (pdf_key, current_page, total_pages, last_read_at) VALUES (?, ?, ?, ?)'
    ).run(pdfKey, currentPage || 1, totalPages || 1, now);
    res.json({ ok: true });
});

// ════════════════════════════════════════
//  API: PDF READING LOG
// ════════════════════════════════════════
app.post('/api/reading-log', (req, res) => {
    const { pdfKey, pageNumber, dateStr } = req.body;
    if (!pdfKey || !pageNumber || !dateStr) {
        return res.status(400).json({ error: 'pdfKey, pageNumber e dateStr são obrigatórios' });
    }
    try {
        db.prepare(
            'INSERT OR IGNORE INTO pdf_reading_log (pdf_key, page_number, date_str, timestamp) VALUES (?, ?, ?, ?)'
        ).run(pdfKey, pageNumber, dateStr, Date.now());
        res.json({ ok: true });
    } catch (err) {
        console.error('Reading log error:', err);
        res.status(500).json({ error: 'Erro ao registrar página lida' });
    }
});

app.get('/api/reading-log/:dateStr', (req, res) => {
    const { dateStr } = req.params;
    const rows = db.prepare(
        'SELECT pdf_key, page_number FROM pdf_reading_log WHERE date_str = ? ORDER BY timestamp ASC'
    ).all(dateStr);
    res.json(rows);
});

// ════════════════════════════════════════
//  API: EXERCISES
// ════════════════════════════════════════
app.get('/api/exercises/today', (req, res) => {
    const { dateStr } = req.query;
    if (!dateStr) return res.status(400).json({ error: 'dateStr obrigatório' });

    // Check how many pages were read today
    const pagesRead = db.prepare(
        'SELECT COUNT(*) as count FROM pdf_reading_log WHERE date_str = ?'
    ).get(dateStr);

    // Check if exercises were already generated
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
});

app.get('/api/exercises/history', (req, res) => {
    try {
        const rows = db.prepare('SELECT date_str, questions_json, answers_json, score, created_at FROM exercises_session ORDER BY created_at DESC').all();
        const result = rows.map(r => ({
            dateStr: r.date_str,
            questions: JSON.parse(r.questions_json),
            answers: r.answers_json ? JSON.parse(r.answers_json) : null,
            score: r.score,
            createdAt: r.created_at
        }));
        res.json(result);
    } catch (err) {
        console.error('Error fetching exercise history:', err);
        res.status(500).json({ error: 'Erro ao carregar histórico de exercícios' });
    }
});

app.post('/api/exercises/generate', async (req, res) => {
    const { dateStr, pdfFileMap } = req.body;
    if (!dateStr) return res.status(400).json({ error: 'dateStr obrigatório' });

    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_api_key_here') {
        return res.status(500).json({ error: 'GEMINI_API_KEY não configurada. Edite o arquivo .env na pasta app/' });
    }

    // Check if exercises already exist
    const existing = db.prepare('SELECT questions_json FROM exercises_session WHERE date_str = ?').get(dateStr);
    if (existing) {
        return res.json({ questions: JSON.parse(existing.questions_json) });
    }

    // Get pages read today
    const pagesRead = db.prepare(
        'SELECT pdf_key, page_number FROM pdf_reading_log WHERE date_str = ? ORDER BY timestamp ASC'
    ).all(dateStr);

    if (pagesRead.length === 0) {
        return res.status(400).json({ error: 'Nenhuma página lida hoje' });
    }

    // Group pages by pdf_key (take original path from pdfKey which is "path#topicId")
    const pdfPages = {};
    pagesRead.forEach(row => {
        // pdfKey can be "path/to/file.pdf#topicId" or just "path/to/file.pdf"
        const pdfPath = row.pdf_key.split('#')[0];
        if (!pdfPages[pdfPath]) pdfPages[pdfPath] = new Set();
        pdfPages[pdfPath].add(row.page_number);
    });

    // Extract text from pages
    let extractedContent = '';
    const pdfParse = require('pdf-parse');
    const rootDir = path.join(__dirname, '..');

    for (const [pdfRelPath, pagesSet] of Object.entries(pdfPages)) {
        const pdfAbsPath = path.join(rootDir, pdfRelPath);
        if (!fs.existsSync(pdfAbsPath)) {
            console.warn(`PDF não encontrado: ${pdfAbsPath}`);
            continue;
        }

        try {
            const dataBuffer = fs.readFileSync(pdfAbsPath);
            const sortedPages = Array.from(pagesSet).sort((a, b) => a - b);
            // Limit to 30 pages max to avoid huge prompts
            const pagesToExtract = sortedPages.slice(0, 30);

            const parsed = await pdfParse(dataBuffer, {
                max: Math.max(...pagesToExtract),
                pagerender: function(pageData) {
                    return pageData.getTextContent().then(function(textContent) {
                        return textContent.items.map(item => item.str).join(' ');
                    });
                }
            });

            // pdf-parse doesn't support per-page extraction easily, so we get all text
            // and note which file it came from
            const filename = path.basename(pdfRelPath);
            const displayName = filename.replace(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d+-/, '')
                .replace(/-e\d+\.pdf$/, '.pdf')
                .replace(/\.pdf$/, '')
                .replace(/-/g, ' ');

            // Trim text to be reasonable (first 8000 chars per file)
            const trimmedText = parsed.text.trim().substring(0, 8000);
            if (trimmedText.length > 100) {
                extractedContent += `\n\n=== CONTEÚDO: ${displayName} (páginas lidas: ${pagesToExtract.join(', ')}) ===\n${trimmedText}`;
            }
        } catch (pdfErr) {
            console.error(`Erro ao extrair PDF ${pdfRelPath}:`, pdfErr.message);
        }
    }

    if (!extractedContent.trim()) {
        return res.status(500).json({ error: 'Não foi possível extrair texto dos PDFs lidos. Verifique se os arquivos existem.' });
    }

    // Build prompt
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
                // Try to extract JSON array
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

            // Successfully parsed and validated
            break;
        } catch (err) {
            console.error(`Falha na tentativa ${attempts}:`, err.message);
            lastError = err;
            if (attempts < maxRetries) {
                // Wait 1.5 seconds before retrying
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
    }

    if (!questions) {
        return res.status(500).json({ error: lastError?.message || 'Erro ao gerar exercícios após várias tentativas.' });
    }

    // Save to database
    db.prepare(
        'INSERT OR REPLACE INTO exercises_session (date_str, questions_json, created_at) VALUES (?, ?, ?)'
    ).run(dateStr, JSON.stringify(questions), Date.now());

    res.json({ questions });
});

app.post('/api/exercises/save', (req, res) => {
    const { dateStr, answers, score } = req.body;
    if (!dateStr || !answers) return res.status(400).json({ error: 'dateStr e answers são obrigatórios' });

    db.prepare(
        'UPDATE exercises_session SET answers_json = ?, score = ? WHERE date_str = ?'
    ).run(JSON.stringify(answers), score || 0, dateStr);
    res.json({ ok: true });
});

// ════════════════════════════════════════
//  API: EXPORT / IMPORT (full backup)
// ════════════════════════════════════════
app.get('/api/export', (req, res) => {
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
});

app.post('/api/import', (req, res) => {
    const data = req.body;

    const importTransaction = db.transaction(() => {
        // Completed topics
        if (data.completedTopics) {
            db.prepare('DELETE FROM completed_topics').run();
            const stmt = db.prepare('INSERT INTO completed_topics (topic_id, completed_at) VALUES (?, ?)');
            for (const [id, ts] of Object.entries(data.completedTopics)) {
                stmt.run(id, ts);
            }
        }

        // Study notes
        if (data.studyNotes) {
            db.prepare('DELETE FROM study_notes').run();
            const stmt = db.prepare('INSERT INTO study_notes (topic_id, note) VALUES (?, ?)');
            for (const [id, note] of Object.entries(data.studyNotes)) {
                stmt.run(id, note);
            }
        }

        // Study log
        if (data.studyLog) {
            db.prepare('DELETE FROM study_log').run();
            const stmt = db.prepare('INSERT INTO study_log (timestamp, type, duration) VALUES (?, ?, ?)');
            data.studyLog.forEach(entry => {
                stmt.run(entry.timestamp, entry.type, entry.duration);
            });
        }

        // Config
        if (data.config) {
            db.prepare('DELETE FROM app_config').run();
            const stmt = db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?)');
            for (const [key, value] of Object.entries(data.config)) {
                stmt.run(key, JSON.stringify(value));
            }
        }

        // PDF Bookmarks
        if (data.pdfBookmarks) {
            db.prepare('DELETE FROM pdf_bookmarks').run();
            const stmt = db.prepare('INSERT INTO pdf_bookmarks (pdf_key, current_page, total_pages, last_read_at) VALUES (?, ?, ?, ?)');
            for (const [key, bm] of Object.entries(data.pdfBookmarks)) {
                stmt.run(key, bm.currentPage || 1, bm.totalPages || 1, bm.lastReadAt || Date.now());
            }
        }

        // Legacy format support
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

    try {
        importTransaction();
        res.json({ ok: true });
    } catch (err) {
        console.error('Import error:', err);
        res.status(500).json({ error: 'Erro ao importar dados' });
    }
});

// ════════════════════════════════════════
//  API: MIGRATE FROM LOCALSTORAGE (one-shot)
// ════════════════════════════════════════
app.post('/api/migrate', (req, res) => {
    const data = req.body;

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

    try {
        migrateTransaction();
        res.json({ ok: true, message: 'Migração concluída com sucesso' });
    } catch (err) {
        console.error('Migration error:', err);
        res.status(500).json({ error: 'Erro na migração' });
    }
});

// ─── Fallback: serve the main HTML ───
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'plano_estudos.html'));
});

// ─── Start ───
app.listen(PORT, () => {
    console.log(`\n  🛢️  Plano de Estudos Petrobras`);
    console.log(`  ─────────────────────────────`);
    console.log(`  🌐 http://localhost:${PORT}`);
    console.log(`  💾 SQLite: estudos.db`);
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_api_key_here') {
        console.log(`  ⚠️  GEMINI_API_KEY não configurada (edite app/.env)`);
    } else {
        console.log(`  🤖 Gemini API: configurada`);
    }
    console.log(`  ✨ Servidor pronto!\n`);
});
