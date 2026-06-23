const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const asyncRoute = require('../middleware/asyncRoute');

// GET /api/backup/export - Export full database tables as JSON
router.get('/export', asyncRoute(async (req, res) => {
    const data = {
        // User progress & logs
        topic_progress: db.prepare('SELECT * FROM topic_progress').all(),
        notes: db.prepare('SELECT * FROM notes').all(),
        study_sessions: db.prepare('SELECT * FROM study_sessions').all(),
        app_config: db.prepare('SELECT * FROM app_config').all(),
        material_bookmarks: db.prepare('SELECT * FROM material_bookmarks').all(),
        material_reading_log: db.prepare('SELECT * FROM material_reading_log').all(),
        exercise_sessions: db.prepare('SELECT * FROM exercise_sessions').all(),
        exercise_sources: db.prepare('SELECT * FROM exercise_sources').all(),
        video_progress: db.prepare('SELECT * FROM video_progress').all(),
        
        // Structural tables (for full backup restoration)
        learning_programs: db.prepare('SELECT * FROM learning_programs').all(),
        contests: db.prepare('SELECT * FROM contests').all(),
        exam_profiles: db.prepare('SELECT * FROM exam_profiles').all(),
        contest_sections: db.prepare('SELECT * FROM contest_sections').all(),
        disciplines: db.prepare('SELECT * FROM disciplines').all(),
        topics: db.prepare('SELECT * FROM topics').all(),
        study_weeks: db.prepare('SELECT * FROM study_weeks').all(),
        study_week_topics: db.prepare('SELECT * FROM study_week_topics').all(),
        materials: db.prepare('SELECT * FROM materials').all(),
        topic_materials: db.prepare('SELECT * FROM topic_materials').all(),
        video_modules: db.prepare('SELECT * FROM video_modules').all(),
        video_subjects: db.prepare('SELECT * FROM video_subjects').all(),
        videos: db.prepare('SELECT * FROM videos').all(),
        
        // Metadata
        exportDate: new Date().toISOString(),
        schemaVersion: 6
    };

    res.json(data);
}));

// POST /api/backup/import - Restore database tables from JSON
router.post('/import', asyncRoute(async (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object') {
        const err = new Error('O payload de backup é obrigatório.');
        err.statusCode = 400;
        throw err;
    }

    const importTransaction = db.transaction(() => {
        // Check for legacy format keys and convert to the new schema
        if (data.completedTopics || data.studyNotes || data.studyLog || data.config || data.pdfBookmarks) {
            console.log('[Backup Import] Detected legacy backup format. Performing conversion to new schema...');
            const programId = 'petrobras-eng-software-2026'; // default legacy program

            // Completed topics -> topic_progress
            if (data.completedTopics) {
                db.prepare("DELETE FROM topic_progress WHERE program_id = ?", programId).run();
                const stmt = db.prepare('INSERT INTO topic_progress (program_id, topic_id, status, completed_at, updated_at) VALUES (?, ?, ?, ?, ?)');
                for (const [id, ts] of Object.entries(data.completedTopics)) {
                    stmt.run(programId, id, 'done', ts, ts);
                }
            }

            // Study notes -> notes
            if (data.studyNotes) {
                db.prepare("DELETE FROM notes WHERE program_id = ? AND target_type = 'topic'", programId).run();
                const stmt = db.prepare('INSERT INTO notes (program_id, target_type, target_id, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
                for (const [id, note] of Object.entries(data.studyNotes)) {
                    stmt.run(programId, 'topic', id, note, Date.now(), Date.now());
                }
            }

            // Study log -> study_sessions
            if (data.studyLog) {
                db.prepare("DELETE FROM study_sessions WHERE program_id = ?", programId).run();
                const stmt = db.prepare('INSERT INTO study_sessions (program_id, started_at, ended_at, type, duration, source) VALUES (?, ?, ?, ?, ?, ?)');
                data.studyLog.forEach(entry => {
                    const type = entry.type || 'focus';
                    const duration = entry.duration || 25;
                    const start = entry.timestamp;
                    const end = start + (duration * 60 * 1000);
                    stmt.run(programId, start, end, type, duration, 'legacy_import');
                });
            }

            // Config -> app_config
            if (data.config) {
                db.prepare('DELETE FROM app_config').run();
                const stmt = db.prepare('INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)');
                for (const [key, value] of Object.entries(data.config)) {
                    stmt.run(key, JSON.stringify(value), Date.now());
                }
            }

            // PDF Bookmarks -> material_bookmarks
            if (data.pdfBookmarks) {
                db.prepare("DELETE FROM material_bookmarks WHERE program_id = ?", programId).run();
                const stmt = db.prepare('INSERT INTO material_bookmarks (program_id, material_id, topic_id, current_page, total_pages, last_read_at) VALUES (?, ?, ?, ?, ?, ?)');
                
                for (const [key, bm] of Object.entries(data.pdfBookmarks)) {
                    const pdfPath = key.split('#')[0];
                    const topicId = key.split('#')[1] || null;
                    
                    const material = db.prepare('SELECT id FROM materials WHERE path = ? OR path LIKE ? LIMIT 1')
                        .get(pdfPath, `%${pdfPath}%`);
                    
                    const matId = material ? material.id : pdfPath.replace(/\.pdf/g, '').replace(/[\s+]+/g, '-').toLowerCase();
                    
                    stmt.run(programId, matId, topicId, bm.currentPage || 1, bm.totalPages || 1, bm.lastReadAt || Date.now());
                }
            }

            console.log('[Backup Import] Legacy backup conversion completed.');
            return;
        }

        // Standard restoration helper
        const restoreTable = (tableName, rows) => {
            if (!rows || !Array.isArray(rows)) return;

            db.prepare(`DELETE FROM ${tableName}`).run();
            if (rows.length === 0) return;

            const columns = Object.keys(rows[0]);
            const placeholders = columns.map(() => '?').join(', ');
            const stmt = db.prepare(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`);

            for (const row of rows) {
                const values = columns.map(col => row[col]);
                stmt.run(values);
            }
        };

        // Restoring user progress & logs
        restoreTable('topic_progress', data.topic_progress);
        restoreTable('notes', data.notes);
        restoreTable('study_sessions', data.study_sessions);
        restoreTable('app_config', data.app_config);
        restoreTable('material_bookmarks', data.material_bookmarks);
        restoreTable('material_reading_log', data.material_reading_log);
        restoreTable('exercise_sessions', data.exercise_sessions);
        restoreTable('exercise_sources', data.exercise_sources);
        restoreTable('video_progress', data.video_progress);

        // Restoring structural metadata
        restoreTable('learning_programs', data.learning_programs);
        restoreTable('contests', data.contests);
        restoreTable('exam_profiles', data.exam_profiles);
        restoreTable('contest_sections', data.contest_sections);
        restoreTable('disciplines', data.disciplines);
        restoreTable('topics', data.topics);
        restoreTable('study_weeks', data.study_weeks);
        restoreTable('study_week_topics', data.study_week_topics);
        restoreTable('materials', data.materials);
        restoreTable('topic_materials', data.topic_materials);
        restoreTable('video_modules', data.video_modules);
        restoreTable('video_subjects', data.video_subjects);
        restoreTable('videos', data.videos);
    });

    try {
        importTransaction();
        res.json({ ok: true });
    } catch (err) {
        console.error('[Backup Import Error]:', err);
        res.status(500).json({ error: 'Erro ao restaurar tabelas do backup: ' + err.message });
    }
}));

module.exports = router;
