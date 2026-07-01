const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const asyncRoute = require('../middleware/asyncRoute');

// GET /api/contests - List all contests
router.get('/', asyncRoute(async (req, res) => {
    const contests = db.prepare(`
        SELECT c.*, lp.name as program_name, lp.description as program_description 
        FROM contests c 
        JOIN learning_programs lp ON c.program_id = lp.id
    `).all();
    
    // Parse metadata_json
    contests.forEach(c => {
        try { c.ui = JSON.parse(c.metadata_json); } catch (e) { c.ui = {}; }
        delete c.metadata_json;
    });
    
    res.json(contests);
}));

// GET /api/contests/:contestId - Get single contest details
router.get('/:contestId', asyncRoute(async (req, res) => {
    const { contestId } = req.params;
    const contest = db.prepare(`
        SELECT c.*, lp.name as program_name, lp.description as program_description 
        FROM contests c 
        JOIN learning_programs lp ON c.program_id = lp.id
        WHERE c.id = ?
    `).get(contestId);

    if (!contest) {
        return res.status(404).json({ error: 'Concurso não encontrado.' });
    }

    try { contest.ui = JSON.parse(contest.metadata_json); } catch (e) { contest.ui = {}; }
    delete contest.metadata_json;

    res.json(contest);
}));

// GET /api/contests/:contestId/plan - Get the full study plan sections, weeks, and topics
router.get('/:contestId/plan', asyncRoute(async (req, res) => {
    const { contestId } = req.params;
    
    // Check if contest exists
    const contest = db.prepare('SELECT id, program_id FROM contests WHERE id = ?').get(contestId);
    if (!contest) {
        return res.status(404).json({ error: 'Concurso não encontrado.' });
    }

    // 1. Get contest sections (phases)
    const sections = db.prepare('SELECT * FROM contest_sections WHERE contest_id = ? ORDER BY sort_order').all(contestId);
    
    // 2. Get study weeks
    const weeks = db.prepare('SELECT * FROM study_weeks WHERE contest_id = ? ORDER BY sort_order').all(contestId);

    // 3. Get all topics for the contest
    const topics = db.prepare('SELECT * FROM topics WHERE contest_id = ? ORDER BY sort_order').all(contestId);

    // 4. Get topic material mappings
    const topicMaterials = db.prepare(`
        SELECT tm.*, m.title as material_title, m.type as material_type, m.path as material_path
        FROM topic_materials tm
        JOIN materials m ON tm.material_id = m.id
        WHERE m.program_id = ?
        ORDER BY tm.topic_id, tm.sort_order
    `).all(contest.program_id);

    // Build hierarchical structure
    const planPhases = sections.map(section => {
        // Find weeks under this section
        // Note: For now we can group weeks by section. If sections don't map weeks directly, we group by section name matching / segment mapping
        // In Petrobras: Fase 1 (Semanas 1-4), Fase 2 (Semanas 5-8), Fase 3 (Semanas 9-12), Básicas (PT/EN)
        // Let's filter weeks belonging to this section/phase.
        // Wait, is there a section_id in study_weeks? In our schema, study_weeks has phase_id!
        // Yes, week has phase_id, which corresponds to the section_id!
        const sectionWeeks = weeks.filter(w => {
            // Check matching: week has phase_id. We set phase_id = `${contest.id}-${phase.id}` in loader!
            return w.phase_id === section.id || w.id.startsWith(section.id);
        });

        const formattedWeeks = sectionWeeks.map(week => {
            // Find topics for this week.
            // In our schema: study_week_topics maps week_id to topic_id
            const weekTopicsList = db.prepare(`
                SELECT t.* 
                FROM topics t
                JOIN study_week_topics swt ON t.id = swt.topic_id
                WHERE swt.week_id = ?
                ORDER BY swt.sort_order
            `).all(week.id);

            const formattedTopics = weekTopicsList.map(topic => {
                // Find materials for this topic
                const mats = topicMaterials.filter(tm => tm.topic_id === topic.id);
                return {
                    id: topic.id,
                    title: topic.title,
                    tag: topic.tag,
                    tagClass: topic.tag_class,
                    detail: topic.detail,
                    materials: mats.map(m => ({
                        materialId: m.material_id,
                        title: m.material_title,
                        type: m.material_type,
                        path: m.material_path,
                        startPage: m.start_page,
                        endPage: m.end_page
                    }))
                };
            });

            return {
                id: week.id,
                number: week.week_number,
                title: week.title,
                subtitle: week.subtitle,
                topics: formattedTopics
            };
        });

        return {
            id: section.id,
            title: section.name,
            subtitle: section.subtitle || '',
            weeks: formattedWeeks
        };
    });

    res.json({ phases: planPhases });
}));

// GET /api/contests/:contestId/materials - List all materials mapped to this contest
router.get('/:contestId/materials', asyncRoute(async (req, res) => {
    const { contestId } = req.params;
    const contest = db.prepare('SELECT program_id FROM contests WHERE id = ?').get(contestId);
    if (!contest) {
        return res.status(404).json({ error: 'Concurso não encontrado.' });
    }

    const materials = db.prepare('SELECT * FROM materials WHERE program_id = ?').all(contest.program_id);
    materials.forEach(m => {
        try { m.metadata = JSON.parse(m.metadata_json); } catch (e) { m.metadata = {}; }
        delete m.metadata_json;
    });

    res.json(materials);
}));

// GET /api/contests/:contestId/stats - Calculate statistics (completion, notes, etc.)
router.get('/:contestId/stats', asyncRoute(async (req, res) => {
    const { contestId } = req.params;
    const contest = db.prepare('SELECT program_id FROM contests WHERE id = ?').get(contestId);
    if (!contest) {
        return res.status(404).json({ error: 'Concurso não encontrado.' });
    }

    const programId = contest.program_id;

    // Total topics count
    const totalTopics = db.prepare('SELECT COUNT(*) as count FROM topics WHERE contest_id = ?').get(contestId).count;

    // Completed topics count
    const completedTopics = db.prepare(`
        SELECT COUNT(*) as count 
        FROM topic_progress 
        WHERE program_id = ? AND status = 'done'
    `).get(programId).count;

    // Breakdown by contest section (phase)
    const sections = db.prepare('SELECT id, name FROM contest_sections WHERE contest_id = ?').all(contestId);
    const sectionBreakdown = [];

    for (const sec of sections) {
        // Count topics in this section
        const secTotal = db.prepare(`
            SELECT COUNT(t.id) as count
            FROM topics t
            JOIN study_week_topics swt ON t.id = swt.topic_id
            JOIN study_weeks sw ON swt.week_id = sw.id
            WHERE sw.phase_id = ? OR sw.id LIKE ?
        `).get(sec.id, `${sec.id}%`).count;

        const secCompleted = db.prepare(`
            SELECT COUNT(t.id) as count
            FROM topics t
            JOIN study_week_topics swt ON t.id = swt.topic_id
            JOIN study_weeks sw ON swt.week_id = sw.id
            JOIN topic_progress tp ON t.id = tp.topic_id
            WHERE (sw.phase_id = ? OR sw.id LIKE ?) AND tp.program_id = ? AND tp.status = 'done'
        `).get(sec.id, `${sec.id}%`, programId).count;

        sectionBreakdown.push({
            sectionId: sec.id,
            name: sec.name,
            total: secTotal,
            completed: secCompleted,
            percentage: secTotal > 0 ? Math.round((secCompleted / secTotal) * 100) : 0
        });
    }

    res.json({
        totalTopics,
        completedTopics,
        percentage: totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0,
        sectionBreakdown
    });
}));

module.exports = router;
