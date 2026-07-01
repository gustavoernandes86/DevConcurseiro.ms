const db = require('../db/connection');

/**
 * Checks if a table exists in the database
 * @param {string} tableName 
 * @returns {boolean}
 */
function tableExists(tableName) {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName);
    return !!row;
}

/**
 * Performs legacy data migration to the new relational model.
 * The operation is fully idempotent and transactional.
 */
async function migrateLegacyData() {
    // Check if any legacy tables exist. If none exist, we skip migration.
    const hasCompletedTopics = tableExists('completed_topics');
    const hasStudyNotes = tableExists('study_notes');
    const hasStudyLog = tableExists('study_log');
    const hasPdfBookmarks = tableExists('pdf_bookmarks');
    const hasPdfReadingLog = tableExists('pdf_reading_log');
    const hasExercisesSession = tableExists('exercises_session');

    if (!hasCompletedTopics && !hasStudyNotes && !hasStudyLog && !hasPdfBookmarks && !hasPdfReadingLog && !hasExercisesSession) {
        return; // Fresh database, no legacy data to migrate
    }

    console.log('[Legacy Migration] Checking for legacy data to migrate...');

    let migratedTopics = 0;
    let migratedNotes = 0;
    let migratedSessions = 0;
    let migratedBookmarks = 0;
    let migratedReadingLogs = 0;
    let migratedExercises = 0;

    const programId = 'petrobras-eng-software-2026'; // Default contest program ID

    // We wrap all migrations in a transaction for safety
    const runMigrationTx = db.transaction(() => {
        // Helper to resolve legacy pdf_key to active material ID
        const resolveMaterialId = (pdfKey) => {
            if (!pdfKey) return null;

            // Search directly by path or id
            let material = db.prepare('SELECT id FROM materials WHERE path LIKE ? OR id = ? LIMIT 1').get(`%${pdfKey}%`, pdfKey);
            if (material) return material.id;

            // Strip extension and search title/path
            const cleanKey = pdfKey.replace(/\.pdf$/i, '').trim();
            material = db.prepare('SELECT id FROM materials WHERE title LIKE ? OR path LIKE ? LIMIT 1').get(`%${cleanKey}%`, `%${cleanKey}%`);
            if (material) return material.id;

            // Final fallback: transform pdf_key into formatted id slug
            return pdfKey.replace(/\.pdf/g, '').replace(/[\s+]+/g, '-').toLowerCase();
        };

        // Shared entity checking helpers to prevent FOREIGN KEY violations
        const checkTopicExists = db.prepare('SELECT 1 FROM topics WHERE id = ?');
        const checkMaterialExists = db.prepare('SELECT 1 FROM materials WHERE id = ?');

        // 1. Migrate Completed Topics
        if (hasCompletedTopics) {
            const rows = db.prepare('SELECT topic_id, completed_at FROM completed_topics').all();
            const checkStmt = db.prepare('SELECT 1 FROM topic_progress WHERE program_id = ? AND topic_id = ?');
            const insertStmt = db.prepare(`
                INSERT INTO topic_progress (program_id, topic_id, status, completed_at, updated_at)
                VALUES (?, ?, 'done', ?, ?)
            `);
            rows.forEach(row => {
                // Ensure topic actually exists in structured plan to satisfy Foreign Key
                if (checkTopicExists.get(row.topic_id)) {
                    const exists = checkStmt.get(programId, row.topic_id);
                    if (!exists) {
                        const res = insertStmt.run(programId, row.topic_id, row.completed_at, row.completed_at);
                        if (res.changes > 0) migratedTopics++;
                    }
                }
            });
        }

        // 2. Migrate Study Notes
        if (hasStudyNotes) {
            const rows = db.prepare('SELECT topic_id, note FROM study_notes').all();
            const checkStmt = db.prepare("SELECT 1 FROM notes WHERE program_id = ? AND target_type = 'topic' AND target_id = ?");
            const insertStmt = db.prepare(`
                INSERT INTO notes (program_id, target_type, target_id, note, created_at, updated_at)
                VALUES (?, 'topic', ?, ?, ?, ?)
            `);
            rows.forEach(row => {
                const exists = checkStmt.get(programId, row.topic_id);
                if (!exists) {
                    const now = Date.now();
                    const res = insertStmt.run(programId, row.topic_id, row.note, now, now);
                    if (res.changes > 0) migratedNotes++;
                }
            });
        }

        // 3. Migrate Study Logs (Pomodoro focus/break sessions)
        if (hasStudyLog) {
            const rows = db.prepare('SELECT timestamp, type, duration FROM study_log').all();
            const checkStmt = db.prepare('SELECT id FROM study_sessions WHERE program_id = ? AND started_at = ?');
            const insertStmt = db.prepare(`
                INSERT INTO study_sessions (program_id, started_at, ended_at, type, duration, source)
                VALUES (?, ?, ?, ?, ?, 'legacy_migration')
            `);

            rows.forEach(row => {
                const exists = checkStmt.get(programId, row.timestamp);
                if (!exists) {
                    const durationSeconds = row.duration * 60;
                    const endedAt = row.timestamp + (durationSeconds * 1000);
                    const type = (row.type === 'shortBreak' || row.type === 'short_break') ? 'short_break' : 
                                 (row.type === 'longBreak' || row.type === 'long_break') ? 'long_break' : 'focus';
                    
                    const res = insertStmt.run(programId, row.timestamp, endedAt, type, durationSeconds);
                    if (res.changes > 0) migratedSessions++;
                }
            });
        }

        // 4. Migrate PDF Bookmarks
        if (hasPdfBookmarks) {
            const rows = db.prepare('SELECT pdf_key, current_page, total_pages, last_read_at FROM pdf_bookmarks').all();
            const checkStmt = db.prepare('SELECT 1 FROM material_bookmarks WHERE program_id = ? AND material_id = ? AND topic_id IS NULL');
            const insertStmt = db.prepare(`
                INSERT INTO material_bookmarks (program_id, material_id, topic_id, current_page, total_pages, last_read_at)
                VALUES (?, ?, NULL, ?, ?, ?)
            `);

            rows.forEach(row => {
                const matId = resolveMaterialId(row.pdf_key);
                if (matId && checkMaterialExists.get(matId)) {
                    const exists = checkStmt.get(programId, matId);
                    if (!exists) {
                        const res = insertStmt.run(programId, matId, row.current_page, row.total_pages, row.last_read_at);
                        if (res.changes > 0) migratedBookmarks++;
                    }
                }
            });
        }

        // 5. Migrate PDF Reading Log
        if (hasPdfReadingLog) {
            const rows = db.prepare('SELECT pdf_key, page_number, date_str, timestamp FROM pdf_reading_log').all();
            const checkStmt = db.prepare('SELECT 1 FROM material_reading_log WHERE program_id = ? AND material_id = ? AND page_number = ? AND date_str = ?');
            const insertStmt = db.prepare(`
                INSERT INTO material_reading_log (program_id, material_id, topic_id, page_number, date_str, timestamp)
                VALUES (?, ?, NULL, ?, ?, ?)
            `);

            rows.forEach(row => {
                const matId = resolveMaterialId(row.pdf_key);
                if (matId && checkMaterialExists.get(matId)) {
                    const exists = checkStmt.get(programId, matId, row.page_number, row.date_str);
                    if (!exists) {
                        const res = insertStmt.run(programId, matId, row.page_number, row.date_str, row.timestamp);
                        if (res.changes > 0) migratedReadingLogs++;
                    }
                }
            });
        }

        // 6. Migrate Exercises Sessions
        if (hasExercisesSession) {
            const rows = db.prepare('SELECT date_str, questions_json, answers_json, score, created_at FROM exercises_session').all();
            const checkStmt = db.prepare('SELECT 1 FROM exercise_sessions WHERE id = ?');
            const insertStmt = db.prepare(`
                INSERT INTO exercise_sessions (id, program_id, date_str, source_type, questions_json, answers_json, score, created_at, completed_at)
                VALUES (?, ?, ?, 'pdf_reading', ?, ?, ?, ?, ?)
            `);

            rows.forEach(row => {
                const sessionId = `session-legacy-${row.created_at}`;
                const exists = checkStmt.get(sessionId);
                if (!exists) {
                    const completedAt = row.score !== null ? row.created_at : null;
                    const res = insertStmt.run(sessionId, programId, row.date_str, row.questions_json, row.answers_json, row.score, row.created_at, completedAt);
                    if (res.changes > 0) migratedExercises++;
                }
            });
        }
    });

    try {
        runMigrationTx();
        
        // Log migration details
        if (migratedTopics > 0 || migratedNotes > 0 || migratedSessions > 0 || migratedBookmarks > 0 || migratedReadingLogs > 0 || migratedExercises > 0) {
            console.log('\n======================================');
            console.log('[Legacy Migration] Migrados:');
            console.log(`- ${migratedTopics} tópicos concluídos`);
            console.log(`- ${migratedNotes} notas`);
            console.log(`- ${migratedSessions} sessões de estudo`);
            console.log(`- ${migratedBookmarks} bookmarks`);
            console.log(`- ${migratedReadingLogs} páginas lidas`);
            console.log(`- ${migratedExercises} simulados`);
            console.log('======================================\n');
        } else {
            console.log('[Legacy Migration] Nenhum dado novo a ser migrado.');
        }
    } catch (err) {
        console.error('[Legacy Migration Error] Falha crítica na migração de dados antigos:', err.message);
    }
}

module.exports = {
    migrateLegacyData
};
