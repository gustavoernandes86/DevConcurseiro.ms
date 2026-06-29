const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db/connection');
const asyncRoute = require('../middleware/asyncRoute');
const AppError = require('../utils/AppError');
const { generateTopicSummary } = require('../services/summaryGenerator');

function assertProgramExists(programId) {
    const program = db.prepare('SELECT id FROM learning_programs WHERE id = ?').get(programId);
    if (!program) throw AppError.notFound('Programa de aprendizado não encontrado.');
}

// ─── GET /api/programs/:programId/topics/:topicId/summary ───
// Returns the saved summary for a topic, or null if none exists.
router.get('/:programId/topics/:topicId/summary', asyncRoute(async (req, res) => {
    const { programId, topicId } = req.params;
    assertProgramExists(programId);

    const summary = db.prepare(`
        SELECT id, topic_id, content, source_material_ids, generated_at
        FROM topic_summaries
        WHERE topic_id = ?
        ORDER BY generated_at DESC
        LIMIT 1
    `).get(topicId);

    if (!summary) {
        return res.json({ summary: null });
    }

    res.json({
        summary: {
            id: summary.id,
            topicId: summary.topic_id,
            content: summary.content,
            sourceMaterialIds: JSON.parse(summary.source_material_ids || '[]'),
            generatedAt: summary.generated_at
        }
    });
}));

// ─── POST /api/programs/:programId/topics/:topicId/summary/generate ───
// Triggers AI summary generation. Saves result and returns it.
router.post('/:programId/topics/:topicId/summary/generate', asyncRoute(async (req, res) => {
    const { programId, topicId } = req.params;
    assertProgramExists(programId);

    // Verify topic belongs to this program's contest
    const topic = db.prepare(`
        SELECT t.id FROM topics t
        JOIN contests c ON t.contest_id = c.id
        WHERE t.id = ? AND c.program_id = ?
    `).get(topicId, programId);

    if (!topic) {
        throw AppError.notFound('Tópico não encontrado neste programa.');
    }

    console.log(`[Summaries] Generating summary for topic ${topicId}, program ${programId}...`);

    const { content, sourceMaterialIds } = await generateTopicSummary(topicId, programId);

    const now = Date.now();

    // Upsert: delete old summary for this topic, insert new one
    db.prepare('DELETE FROM topic_summaries WHERE topic_id = ?').run(topicId);
    const result = db.prepare(`
        INSERT INTO topic_summaries (topic_id, content, source_material_ids, generated_at)
        VALUES (?, ?, ?, ?)
    `).run(topicId, content, JSON.stringify(sourceMaterialIds), now);

    res.json({
        summary: {
            id: result.lastInsertRowid,
            topicId,
            content,
            sourceMaterialIds,
            generatedAt: now
        }
    });
}));

module.exports = router;
