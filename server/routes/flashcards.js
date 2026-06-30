const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db/connection');
const asyncRoute = require('../middleware/asyncRoute');
const AppError = require('../utils/AppError');
const { generateTopicFlashcards } = require('../services/flashcardGenerator');

function assertProgramExists(programId) {
    const program = db.prepare('SELECT id FROM learning_programs WHERE id = ?').get(programId);
    if (!program) throw AppError.notFound('Programa de aprendizado não encontrado.');
}

// ─── GET /api/programs/:programId/topics/:topicId/flashcards ───
// Returns all saved flashcards for a topic.
router.get('/:programId/topics/:topicId/flashcards', asyncRoute(async (req, res) => {
    const { programId, topicId } = req.params;
    assertProgramExists(programId);

    const cards = db.prepare(`
        SELECT id, topic_id AS topicId, front, back, created_at AS createdAt
        FROM topic_flashcards
        WHERE topic_id = ?
        ORDER BY id ASC
    `).all(topicId);

    res.json({ cards });
}));

// ─── POST /api/programs/:programId/topics/:topicId/flashcards/generate ───
// Triggers AI flashcards generation. Deletes old ones, saves new ones, and returns them.
router.post('/:programId/topics/:topicId/flashcards/generate', asyncRoute(async (req, res) => {
    const { programId, topicId } = req.params;
    assertProgramExists(programId);

    // Verify topic belongs to program's contest
    const topic = db.prepare(`
        SELECT t.id FROM topics t
        JOIN contests c ON t.contest_id = c.id
        WHERE t.id = ? AND c.program_id = ?
    `).get(topicId, programId);

    if (!topic) {
        throw AppError.notFound('Tópico não encontrado neste programa.');
    }

    console.log(`[Flashcards] Generating flashcards for topic ${topicId}...`);
    const cards = await generateTopicFlashcards(topicId, programId);

    const now = Date.now();

    // Transaction to insert cards
    const transaction = db.transaction(() => {
        // Delete old cards
        db.prepare('DELETE FROM topic_flashcards WHERE topic_id = ?').run(topicId);

        // Insert new cards
        const stmtInsert = db.prepare(`
            INSERT INTO topic_flashcards (topic_id, front, back, created_at)
            VALUES (?, ?, ?, ?)
        `);

        for (const card of cards) {
            stmtInsert.run(topicId, card.front, card.back, now);
        }
    });

    transaction();

    // Fetch and return the newly inserted cards
    const savedCards = db.prepare(`
        SELECT id, topic_id AS topicId, front, back, created_at AS createdAt
        FROM topic_flashcards
        WHERE topic_id = ?
        ORDER BY id ASC
    `).all(topicId);

    res.json({ cards: savedCards });
}));

module.exports = router;
