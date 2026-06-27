const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db/connection');
const asyncRoute = require('../middleware/asyncRoute');
const AppError = require('../utils/AppError');

function assertProgramExists(programId) {
    const program = db.prepare('SELECT id FROM learning_programs WHERE id = ?').get(programId);
    if (!program) throw AppError.notFound('Programa de aprendizado não encontrado.');
}

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
        throw AppError.notFound('Vídeo não encontrado.');
    }
    
    if (!status || !['todo', 'watching', 'done'].includes(status)) {
        throw AppError.badRequest('Status inválido.');
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
