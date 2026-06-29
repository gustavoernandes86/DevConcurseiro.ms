require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const db = require('./db/connection');
const { runMigrations } = require('./db/migrate');
const asyncRoute = require('./middleware/asyncRoute');
const errorHandler = require('./middleware/errorHandler');
const requireAuth = require('./middleware/requireAuth');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ─── Middleware ───
app.use(express.json({ limit: '10mb' }));

// ─── Session ───
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-please-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
}));

// ─── Passport ───
app.use(passport.initialize());

// Google OAuth Strategy — configured only if credentials are present
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const callbackURL = `http://localhost:${PORT}/api/auth/google/callback`;

    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL
    }, (accessToken, refreshToken, profile, done) => {
        const user = {
            googleId: profile.id,
            email: profile.emails?.[0]?.value || '',
            name: profile.displayName || '',
            picture: profile.photos?.[0]?.value || ''
        };
        return done(null, user);
    }));
} else {
    console.warn('[Auth] GOOGLE_CLIENT_ID/SECRET not set. Google OAuth disabled.');
}

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

// ─── Auth routes (public — no requireAuth) ───
app.use('/api/auth', require('./routes/auth'));

// ─── All subsequent API routes require authentication ───
app.use('/api', requireAuth);

// ─── Modular API Routes ───
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
app.use('/api/wizard', require('./routes/contestWizard'));
app.use('/api/programs', require('./routes/summaries'));
app.use('/api/programs', require('./routes/flashcards'));

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
            if (!process.env.GOOGLE_CLIENT_ID) {
                console.log(`  ⚠️  GOOGLE_CLIENT_ID não configurado (Google OAuth desabilitado)`);
            } else {
                console.log(`  🔐 Google OAuth: configurado`);
            }
            const allowedEmails = process.env.ALLOWED_EMAILS || '';
            if (allowedEmails) {
                console.log(`  📧 E-mails permitidos: ${allowedEmails}`);
            }
            console.log(`  ✨ Servidor pronto!\n`);
        });
    })
    .catch(err => {
        console.error('[Migration Error] Critical: Migrations failed on boot. Server not started:', err);
        process.exit(1);
    });
