const fs = require('fs');
const path = require('path');
const db = require('../db/connection');

/**
 * Loads all contests from the data/contests directory into the database.
 * Designed to be idempotent (will update existing without dropping progress).
 */
async function loadAllContests() {
    console.log('[Contest Loader] Starting to load contests...');
    
    const contestsDir = path.join(__dirname, '../../data/contests');
    if (!fs.existsSync(contestsDir)) {
        console.log('[Contest Loader] Contests folder not found at:', contestsDir);
        return;
    }

    const folders = fs.readdirSync(contestsDir).filter(f => {
        return fs.statSync(path.join(contestsDir, f)).isDirectory();
    });

    for (const folder of folders) {
        const dirPath = path.join(contestsDir, folder);
        const contestPath = path.join(dirPath, 'contest.json');
        const planPath = path.join(dirPath, 'plan.json');
        const materialsPath = path.join(dirPath, 'materials.json');

        if (!fs.existsSync(contestPath)) {
            console.warn(`[Contest Loader] Skip folder ${folder}: contest.json is missing.`);
            continue;
        }

        try {
            console.log(`[Contest Loader] Loading contest from folder: ${folder}...`);
            const contest = JSON.parse(fs.readFileSync(contestPath, 'utf8'));
            const plan = fs.existsSync(planPath) ? JSON.parse(fs.readFileSync(planPath, 'utf8')) : { phases: [] };
            const materialsList = fs.existsSync(materialsPath) ? JSON.parse(fs.readFileSync(materialsPath, 'utf8')) : [];

            // Execute load in transaction
            const loadTransaction = db.transaction(() => {
                const now = Date.now();

                // 1. Insert/Update learning_program
                db.prepare(`
                    INSERT INTO learning_programs (id, name, type, description, active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 1, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        description = excluded.description,
                        updated_at = excluded.updated_at
                `).run(
                    contest.programId,
                    contest.name,
                    'contest',
                    contest.role || '',
                    now,
                    now
                );

                // 2. Insert/Update contest
                db.prepare(`
                    INSERT INTO contests (id, program_id, institution, role, board, exam_style, metadata_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        program_id = excluded.program_id,
                        institution = excluded.institution,
                        role = excluded.role,
                        board = excluded.board,
                        exam_style = excluded.exam_style,
                        metadata_json = excluded.metadata_json
                `).run(
                    contest.id,
                    contest.programId,
                    contest.institution || '',
                    contest.role || '',
                    contest.board || '',
                    contest.examStyle || '',
                    JSON.stringify(contest.ui || {})
                );

                // 3. Insert/Update exam_profile
                if (contest.examProfile) {
                    db.prepare(`
                        INSERT INTO exam_profiles (id, contest_id, board, question_format, alternatives_json, alternatives_count, has_negative_marking, prompt_template)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            contest_id = excluded.contest_id,
                            board = excluded.board,
                            question_format = excluded.question_format,
                            alternatives_json = excluded.alternatives_json,
                            alternatives_count = excluded.alternatives_count,
                            has_negative_marking = excluded.has_negative_marking,
                            prompt_template = excluded.prompt_template
                    `).run(
                        contest.id, // Profile ID matches contest ID for simplicity
                        contest.id,
                        contest.board || '',
                        contest.examProfile.format || 'multiple_choice',
                        JSON.stringify(contest.examProfile.alternatives || []),
                        contest.examProfile.alternatives ? contest.examProfile.alternatives.length : 0,
                        contest.examProfile.negativeMarking ? 1 : 0,
                        contest.examProfile.promptTemplate || ''
                    );
                }

                // 4. Insert/Update materials
                for (const mat of materialsList) {
                    db.prepare(`
                        INSERT INTO materials (id, program_id, title, type, path, url, metadata_json, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            program_id = excluded.program_id,
                            title = excluded.title,
                            type = excluded.type,
                            path = excluded.path,
                            url = excluded.url,
                            metadata_json = excluded.metadata_json,
                            updated_at = excluded.updated_at
                    `).run(
                        mat.id,
                        contest.programId,
                        mat.title,
                        mat.type || 'pdf',
                        mat.path || '',
                        mat.url || '',
                        JSON.stringify(mat.metadata || {}),
                        now,
                        now
                    );
                }

                // 5. Insert/Update plan sections, weeks, topics & topic_materials
                let sectionIndex = 0;
                for (const phase of plan.phases) {
                    sectionIndex++;
                    const sectionId = `${contest.id}-${phase.id}`;
                    
                    // Insert contest section
                    db.prepare(`
                        INSERT INTO contest_sections (id, contest_id, name, sort_order)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            contest_id = excluded.contest_id,
                            name = excluded.name,
                            sort_order = excluded.sort_order
                    `).run(sectionId, contest.id, phase.title, sectionIndex);

                    let weekIndex = 0;
                    for (const week of phase.weeks) {
                        weekIndex++;
                        const weekId = `${contest.id}-${week.id}`;

                        // Insert study week
                        db.prepare(`
                            INSERT INTO study_weeks (id, contest_id, week_number, title, sort_order)
                            VALUES (?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                                contest_id = excluded.contest_id,
                                week_number = excluded.week_number,
                                title = excluded.title,
                                sort_order = excluded.sort_order
                        `).run(weekId, contest.id, week.number, week.title, weekIndex);

                        let topicIndex = 0;
                        for (const topic of week.topics) {
                            topicIndex++;
                            
                            // Insert topic
                            db.prepare(`
                                INSERT INTO topics (id, contest_id, title, priority, tag, tag_class, sort_order, detail)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                ON CONFLICT(id) DO UPDATE SET
                                    contest_id = excluded.contest_id,
                                    title = excluded.title,
                                    priority = excluded.priority,
                                    tag = excluded.tag,
                                    tag_class = excluded.tag_class,
                                    sort_order = excluded.sort_order,
                                    detail = excluded.detail
                            `).run(
                                topic.id,
                                contest.id,
                                topic.title,
                                topic.tagClass || '', // default priority mapping
                                topic.tag || '',
                                topic.tagClass || '',
                                topicIndex,
                                topic.detail || ''
                            );

                            // Link topic to week
                            db.prepare(`
                                INSERT INTO study_week_topics (week_id, topic_id, sort_order)
                                VALUES (?, ?, ?)
                                ON CONFLICT(week_id, topic_id) DO UPDATE SET
                                    sort_order = excluded.sort_order
                            `).run(weekId, topic.id, topicIndex);

                            // Link topic to materials
                            if (topic.materials) {
                                let matIndex = 0;
                                for (const tm of topic.materials) {
                                    matIndex++;
                                    db.prepare(`
                                        INSERT INTO topic_materials (topic_id, material_id, start_page, end_page, sort_order)
                                        VALUES (?, ?, ?, ?, ?)
                                        ON CONFLICT(topic_id, material_id, sort_order) DO UPDATE SET
                                            start_page = excluded.start_page,
                                            end_page = excluded.end_page
                                    `).run(
                                        topic.id,
                                        tm.materialId,
                                        tm.startPage || null,
                                        tm.endPage || null,
                                        matIndex
                                    );
                                }
                            }
                        }
                    }
                }
            });

            loadTransaction();
            console.log(`[Contest Loader] Successfully loaded contest: ${contest.name}`);
        } catch (err) {
            console.error(`[Contest Loader] Error loading contest from ${folder}:`, err);
        }
    }
}

// Run directly if executed as main module
if (require.main === module) {
    loadAllContests()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { loadAllContests };
