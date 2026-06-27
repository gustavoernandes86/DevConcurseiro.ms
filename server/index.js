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



// Serve PDF.js viewer (pdfjs folder at project root)
app.use('/pdfjs', express.static(path.join(__dirname, '../pdfjs')));

// ─── Modular API Routes (Phases 3 & 4) ───
app.use('/api/contests', require('./routes/contests'));
app.use('/api/programs', require('./routes/programs'));
app.use('/api/programs', require('./routes/exercises'));
app.use('/api/programs', require('./routes/videos'));
app.use('/api/programs', require('./routes/readingLog'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/config', require('./routes/config'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/admin', require('./routes/admin'));

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

        // Run legacy data migration (idempotent)
        try {
            const { migrateLegacyData } = require('./services/legacyMigrationService');
            await migrateLegacyData();
        } catch (migrationErr) {
            console.error('[Migration Service Error] Failed to migrate legacy tables:', migrationErr.message);
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
