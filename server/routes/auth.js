const express = require('express');
const router = express.Router();
const passport = require('passport');
const db = require('../db/connection');
const asyncRoute = require('../middleware/asyncRoute');

// ─── GET /api/auth/me ───
// Returns the currently logged-in user, or 401 if not authenticated.
router.get('/me', asyncRoute(async (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Não autenticado.' });
    }

    const user = db.prepare('SELECT id, email, name, picture FROM users WHERE id = ?').get(req.session.userId);
    if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: 'Sessão inválida.' });
    }

    res.json({ user });
}));

// ─── GET /api/auth/google ───
// Initiates the Google OAuth2 flow.
router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

// ─── GET /api/auth/google/callback ───
// Google OAuth2 callback. Validates allowlist, creates/updates user, sets session.
router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/login?error=auth_failed', session: false }),
    asyncRoute(async (req, res) => {
        const { googleId, email, name, picture } = req.user;

        // ── Allowlist check ──
        const allowedEmails = (process.env.ALLOWED_EMAILS || '')
            .split(',')
            .map(e => e.trim().toLowerCase())
            .filter(Boolean);

        if (allowedEmails.length > 0 && !allowedEmails.includes(email.toLowerCase())) {
            console.warn(`[Auth] Login attempt blocked for unlisted email: ${email}`);
            return res.redirect('/login?error=not_allowed');
        }

        const now = Date.now();

        // ── Upsert user ──
        db.prepare(`
            INSERT INTO users (google_id, email, name, picture, created_at, last_login_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(google_id) DO UPDATE SET
                email = excluded.email,
                name = excluded.name,
                picture = excluded.picture,
                last_login_at = excluded.last_login_at
        `).run(googleId, email, name, picture, now, now);

        const user = db.prepare('SELECT id FROM users WHERE google_id = ?').get(googleId);

        // ── Set session ──
        req.session.userId = user.id;
        req.session.save(() => {
            res.redirect('/');
        });
    })
);

// ─── POST /api/auth/logout ───
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('[Auth] Session destroy error:', err);
        }
        res.clearCookie('connect.sid');
        res.json({ ok: true });
    });
});

module.exports = router;
