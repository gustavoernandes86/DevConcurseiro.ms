const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db/connection');
const asyncRoute = require('../middleware/asyncRoute');
const AppError = require('../utils/AppError');

/**
 * GET /api/programs/:programId/dashboard-stats
 *
 * Retorna um único payload com todos os dados necessários para
 * o Dashboard de Progresso: tempo de estudo, progresso por tópico,
 * performance em exercícios e leitura de PDFs.
 */
router.get('/:programId/dashboard-stats', asyncRoute(async (req, res) => {
    const { programId } = req.params;

    // Verifica se o programa existe
    const program = db.prepare('SELECT id FROM learning_programs WHERE id = ?').get(programId);
    if (!program) throw AppError.notFound('Programa de aprendizado não encontrado.');

    // ───────────────────────────────────────────────
    // 1. TEMPO DE ESTUDO
    // ───────────────────────────────────────────────

    // Total de minutos estudados (apenas sessões de foco, PDF e vídeo)
    const totalSecondsRow = db.prepare(`
        SELECT COALESCE(SUM(duration), 0) as total
        FROM study_sessions
        WHERE program_id = ?
          AND type IN ('focus', 'pdf', 'video', 'manual')
    `).get(programId);
    const totalStudyMinutes = Math.round((totalSecondsRow.total || 0) / 60);

    // Atividade diária — últimos 30 dias (minutos por dia, por tipo)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const dailySessions = db.prepare(`
        SELECT
            date(started_at / 1000, 'unixepoch', 'localtime') as date_str,
            type,
            COALESCE(SUM(duration), 0) as total_seconds
        FROM study_sessions
        WHERE program_id = ?
          AND started_at >= ?
          AND type IN ('focus', 'pdf', 'video', 'manual')
        GROUP BY date_str, type
        ORDER BY date_str ASC
    `).all(programId, thirtyDaysAgo);

    // Agrega por data com breakdown por tipo
    const dailyMap = {};
    dailySessions.forEach(row => {
        if (!dailyMap[row.date_str]) {
            dailyMap[row.date_str] = { date: row.date_str, minutes: 0, focus: 0, pdf: 0, video: 0, manual: 0 };
        }
        const mins = Math.round(row.total_seconds / 60);
        dailyMap[row.date_str].minutes += mins;
        dailyMap[row.date_str][row.type] = (dailyMap[row.date_str][row.type] || 0) + mins;
    });

    // Preenche os 30 dias (dias sem estudo ficam zerados)
    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const dateStr = d.toISOString().split('T')[0];
        last30Days.push(dailyMap[dateStr] || { date: dateStr, minutes: 0, focus: 0, pdf: 0, video: 0, manual: 0 });
    }

    // ───────────────────────────────────────────────
    // 2. PROGRESSO POR TÓPICO / DISCIPLINA
    // ───────────────────────────────────────────────

    // Contagem global por status
    const topicStatusCounts = db.prepare(`
        SELECT status, COUNT(*) as count
        FROM topic_progress
        WHERE program_id = ?
        GROUP BY status
    `).all(programId);

    const topicStatusMap = { todo: 0, studying: 0, done: 0, review: 0 };
    topicStatusCounts.forEach(row => { topicStatusMap[row.status] = row.count; });

    // Busca todas as disciplinas com progresso de tópicos
    // Schema: contests.program_id → learning_programs.id (relação inversa)
    // disciplines.contest_id → contests.id
    const disciplineProgress = db.prepare(`
        SELECT
            d.id,
            d.name,
            COUNT(t.id) as total_topics,
            COUNT(CASE WHEN tp.status = 'done' THEN 1 END) as done_topics,
            COUNT(CASE WHEN tp.status = 'review' THEN 1 END) as review_topics,
            COUNT(CASE WHEN tp.status = 'studying' THEN 1 END) as studying_topics
        FROM disciplines d
        LEFT JOIN topics t ON t.discipline_id = d.id
        LEFT JOIN topic_progress tp ON tp.topic_id = t.id AND tp.program_id = ?
        WHERE d.contest_id IN (
            SELECT c.id FROM contests c WHERE c.program_id = ?
        )
        GROUP BY d.id, d.name
        HAVING total_topics > 0
        ORDER BY d.sort_order ASC
    `).all(programId, programId);

    const disciplineData = disciplineProgress.map(d => ({
        id: d.id,
        name: d.name,
        total: d.total_topics,
        done: d.done_topics,
        review: d.review_topics,
        studying: d.studying_topics,
        todo: d.total_topics - d.done_topics - d.review_topics - d.studying_topics,
        percent: d.total_topics > 0 ? Math.round((d.done_topics / d.total_topics) * 100) : 0
    }));

    // ───────────────────────────────────────────────
    // 3. PERFORMANCE EM EXERCÍCIOS
    // ───────────────────────────────────────────────

    // Histórico de sessões de exercícios com score
    const exerciseHistory = db.prepare(`
        SELECT
            id,
            date_str,
            source_type,
            score,
            total_questions,
            created_at,
            completed_at
        FROM exercise_sessions
        WHERE program_id = ?
          AND completed_at IS NOT NULL
          AND score IS NOT NULL
        ORDER BY created_at ASC
    `).all(programId);

    const exerciseHistoryMapped = exerciseHistory.map(e => ({
        id: e.id,
        date: e.date_str,
        sourceType: e.source_type,
        score: e.score,
        totalQuestions: e.total_questions || 10,
        scorePercent: e.total_questions > 0 ? Math.round((e.score / e.total_questions) * 100) : e.score,
        completedAt: e.completed_at
    }));

    // Totais de exercícios
    const exerciseTotals = db.prepare(`
        SELECT
            COUNT(*) as total_sessions,
            COALESCE(SUM(score), 0) as total_correct,
            COALESCE(SUM(total_questions), 0) as total_questions_answered
        FROM exercise_sessions
        WHERE program_id = ?
          AND completed_at IS NOT NULL
          AND score IS NOT NULL
    `).get(programId);

    const avgScorePercent = exerciseTotals.total_questions_answered > 0
        ? Math.round((exerciseTotals.total_correct / exerciseTotals.total_questions_answered) * 100)
        : 0;

    // Melhor sessão
    const bestSession = exerciseHistory.length > 0
        ? exerciseHistoryMapped.reduce((best, cur) => cur.scorePercent > best.scorePercent ? cur : best, exerciseHistoryMapped[0])
        : null;

    // Performance por disciplina (via exercise_sources → topic → discipline)
    const exerciseByDiscipline = db.prepare(`
        SELECT
            d.name as discipline_name,
            COUNT(DISTINCT es.id) as session_count,
            COALESCE(SUM(es.score), 0) as total_correct,
            COALESCE(SUM(es.total_questions), 0) as total_questions
        FROM exercise_sessions es
        JOIN exercise_sources esrc ON esrc.exercise_session_id = es.id
        JOIN topics t ON t.id = esrc.topic_id
        JOIN disciplines d ON d.id = t.discipline_id
        WHERE es.program_id = ?
          AND es.completed_at IS NOT NULL
          AND es.score IS NOT NULL
          AND esrc.topic_id IS NOT NULL
        GROUP BY d.id, d.name
        ORDER BY session_count DESC
    `).all(programId);

    const exerciseByDisciplineMapped = exerciseByDiscipline.map(r => ({
        name: r.discipline_name,
        sessions: r.session_count,
        avgScore: r.total_questions > 0 ? Math.round((r.total_correct / r.total_questions) * 100) : 0,
        totalCorrect: r.total_correct,
        totalQuestions: r.total_questions
    }));

    // ───────────────────────────────────────────────
    // 4. LEITURA DE PDFs
    // ───────────────────────────────────────────────

    // Total de páginas lidas
    const totalPagesRow = db.prepare(`
        SELECT COUNT(*) as count FROM material_reading_log WHERE program_id = ?
    `).get(programId);
    const totalPagesRead = totalPagesRow.count || 0;

    // Páginas por material
    const pagesByMaterial = db.prepare(`
        SELECT
            m.title,
            COUNT(mrl.page_number) as pages_read
        FROM material_reading_log mrl
        JOIN materials m ON m.id = mrl.material_id
        WHERE mrl.program_id = ?
        GROUP BY mrl.material_id, m.title
        ORDER BY pages_read DESC
        LIMIT 10
    `).all(programId);

    // Heatmap — últimos 60 dias de leitura
    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const sixtyDaysAgoStr = new Date(sixtyDaysAgo).toISOString().split('T')[0];
    const readingHeatmap = db.prepare(`
        SELECT date_str as date, COUNT(*) as pages
        FROM material_reading_log
        WHERE program_id = ?
          AND date_str >= ?
        GROUP BY date_str
        ORDER BY date_str ASC
    `).all(programId, sixtyDaysAgoStr);

    // ───────────────────────────────────────────────
    // 5. STREAK DE DIAS
    // ───────────────────────────────────────────────
    const sessionDates = db.prepare(`
        SELECT DISTINCT date(started_at / 1000, 'unixepoch', 'localtime') as date_str
        FROM study_sessions
        WHERE program_id = ?
          AND type IN ('focus', 'pdf', 'video', 'manual')
        ORDER BY date_str DESC
    `).all(programId).map(r => r.date_str);

    let currentStreak = 0;
    if (sessionDates.length > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (sessionDates[0] === todayStr || sessionDates[0] === yesterdayStr) {
            currentStreak = 1;
            for (let i = 0; i < sessionDates.length - 1; i++) {
                const cur = new Date(sessionDates[i]);
                const prev = new Date(sessionDates[i + 1]);
                const diff = Math.round((cur - prev) / (1000 * 60 * 60 * 24));
                if (diff === 1) currentStreak++;
                else break;
            }
        }
    }

    // ───────────────────────────────────────────────
    // RESPONSE
    // ───────────────────────────────────────────────
    res.json({
        studyTime: {
            totalMinutes: totalStudyMinutes,
            currentStreak,
            last30Days
        },
        topicProgress: {
            ...topicStatusMap,
            byDiscipline: disciplineData
        },
        exercises: {
            totalSessions: exerciseTotals.total_sessions,
            totalQuestionsAnswered: exerciseTotals.total_questions_answered,
            totalCorrect: exerciseTotals.total_correct,
            avgScorePercent,
            bestSession,
            history: exerciseHistoryMapped,
            byDiscipline: exerciseByDisciplineMapped
        },
        reading: {
            totalPagesRead,
            byMaterial: pagesByMaterial.map(r => ({ title: r.title, pages: r.pages_read })),
            heatmap: readingHeatmap
        }
    });
}));

module.exports = router;
