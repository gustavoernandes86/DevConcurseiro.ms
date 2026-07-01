const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/connection');
const asyncRoute = require('../middleware/asyncRoute');
const AppError = require('../utils/AppError');
const { extractContestFromPdf } = require('../services/contestExtractor');

// ─── Multer: temp upload to content/uploads/tmp ───
const TMP_DIR = path.join(__dirname, '../../content/uploads/tmp');
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, TMP_DIR),
    filename: (req, file, cb) => {
        const unique = `edital-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
        cb(null, unique);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') return cb(null, true);
        cb(AppError.badRequest('Apenas arquivos PDF são aceitos.'));
    }
});

// ─── Helper: generate a slug-based ID ───
function toId(str) {
    return str
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 60);
}

// ─── POST /api/wizard/extract ───
// Receives PDF, extracts structure via Gemini, returns JSON for frontend review.
// Does NOT persist anything yet.
router.post('/extract', upload.single('edital'), asyncRoute(async (req, res) => {
    if (!req.file) {
        throw AppError.badRequest('Nenhum arquivo PDF enviado.');
    }

    const pdfPath = req.file.path;
    const sessionKey = req.session?.userId || 'anonymous';

    try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const extracted = await extractContestFromPdf(pdfBuffer, sessionKey);

        // Store tmp file path in session so /confirm can optionally move it
        req.session.lastEditalTmpPath = pdfPath;
        req.session.lastEditalOriginalName = req.file.originalname;

        res.json({ extracted, tmpFilename: req.file.filename });
    } catch (err) {
        // Clean up temp file on error
        try { fs.unlinkSync(pdfPath); } catch (_) {}
        throw err;
    }
}));

// ─── POST /api/wizard/confirm ───
// Receives the reviewed JSON + metadata and persists the full contest structure.
router.post('/confirm', asyncRoute(async (req, res) => {
    const {
        name,
        role,
        board,
        institution,
        status = 'pos_edital',
        examDate,         // ISO string or null
        keepEdital,       // boolean — whether to keep the PDF as a material
        tmpFilename,      // filename in TMP_DIR to move
        extracted         // reviewed JSON { contest_sections, disciplines, exam_profile }
    } = req.body;

    if (!name || typeof name !== 'string') {
        throw AppError.badRequest('O campo nome é obrigatório.');
    }
    if (!extracted || !Array.isArray(extracted.disciplines)) {
        throw AppError.badRequest('Os dados extraídos (disciplines) são obrigatórios.');
    }
    if (!['pre_edital', 'pos_edital'].includes(status)) {
        throw AppError.badRequest('Status inválido. Use pre_edital ou pos_edital.');
    }

    const programId = toId(name) + '-' + Date.now().toString(36);
    const contestId = programId;
    const now = Date.now();
    const examDateTs = examDate ? new Date(examDate).getTime() : null;

    // Optional: move edital PDF to permanent storage
    let editalMaterialId = null;
    if (keepEdital && tmpFilename) {
        const tmpPath = path.join(TMP_DIR, path.basename(tmpFilename));
        const destDir = path.join(__dirname, '../../content/pdfs/editais');
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        const destFilename = `edital-${programId}.pdf`;
        const destPath = path.join(destDir, destFilename);
        if (fs.existsSync(tmpPath)) {
            fs.renameSync(tmpPath, destPath);
        }
        editalMaterialId = `material-edital-${programId}`;
    } else if (tmpFilename) {
        // Clean up temp file if not keeping
        const tmpPath = path.join(TMP_DIR, path.basename(tmpFilename));
        try { fs.unlinkSync(tmpPath); } catch (_) {}
    }

    // Persist in one transaction
    const insertTransaction = db.transaction(() => {
        // 1. learning_programs
        db.prepare(`
            INSERT INTO learning_programs (id, name, type, description, active, created_at, updated_at)
            VALUES (?, ?, 'contest', ?, 1, ?, ?)
        `).run(programId, name, role || '', now, now);

        // 2. contests
        db.prepare(`
            INSERT INTO contests (id, program_id, institution, role, board, exam_style, metadata_json, status, exam_date)
            VALUES (?, ?, ?, ?, ?, 'multiple_choice_a_e', ?, ?, ?)
        `).run(
            contestId,
            programId,
            institution || '',
            role || '',
            board || '',
            JSON.stringify({ title: name, subtitle: role || '' }),
            status,
            examDateTs
        );

        // 3. exam_profile
        const ep = extracted.exam_profile || {};
        const altCount = ep.alternatives_count || 5;
        const altList = Array.from({ length: altCount }, (_, i) => String.fromCharCode(65 + i)); // A, B, C...
        db.prepare(`
            INSERT INTO exam_profiles (id, contest_id, board, question_format, alternatives_json, alternatives_count, has_negative_marking)
            VALUES (?, ?, ?, 'multiple_choice', ?, ?, ?)
        `).run(
            contestId,
            contestId,
            ep.board || board || '',
            JSON.stringify(altList),
            altCount,
            ep.has_negative_marking ? 1 : 0
        );

        // 4. edital material (optional)
        if (editalMaterialId) {
            db.prepare(`
                INSERT INTO materials (id, program_id, title, type, path, source, metadata_json, created_at, updated_at)
                VALUES (?, ?, ?, 'pdf', ?, 'Edital', '{}', ?, ?)
            `).run(editalMaterialId, programId, `Edital — ${name}`, `editais/edital-${programId}.pdf`, now, now);
        }

        // 5. contest_sections, disciplines, topics
        const sections = extracted.contest_sections || [];
        const disciplines = extracted.disciplines || [];

        let sectionOrder = 0;
        const sectionIdMap = {}; // section name -> section DB id

        for (const sec of sections) {
            sectionOrder++;
            const sectionId = `${contestId}-sec-${sectionOrder}`;
            sectionIdMap[sec.name] = sectionId;

            db.prepare(`
                INSERT INTO contest_sections (id, contest_id, name, is_eliminatory, min_score, sort_order)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(sectionId, contestId, sec.name, sec.is_eliminatory ? 1 : 0, sec.min_score || null, sectionOrder);
        }

        let disciplineOrder = 0;
        for (const disc of disciplines) {
            disciplineOrder++;
            const disciplineId = `${contestId}-disc-${disciplineOrder}`;
            const sectionId = sectionIdMap[disc.section_name] || null;

            db.prepare(`
                INSERT INTO disciplines (id, contest_id, section_id, name, sort_order)
                VALUES (?, ?, ?, ?, ?)
            `).run(disciplineId, contestId, sectionId, disc.name, disciplineOrder);

            let topicOrder = 0;
            for (const topic of (disc.topics || [])) {
                topicOrder++;
                const topicId = `${disciplineId}-t${topicOrder}`;

                db.prepare(`
                    INSERT INTO topics (id, contest_id, discipline_id, title, detail, weight, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(topicId, contestId, disciplineId, topic.title, topic.detail || '', topic.weight || 1, topicOrder);

                // Sub-topics
                let subOrder = 0;
                for (const sub of (topic.subtopics || [])) {
                    subOrder++;
                    const subId = `${topicId}-s${subOrder}`;
                    db.prepare(`
                        INSERT INTO topics (id, contest_id, discipline_id, parent_topic_id, title, detail, sort_order)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).run(subId, contestId, disciplineId, topicId, sub.title, sub.detail || '', subOrder);
                }
            }
        }
    });

    insertTransaction();
    console.log(`[ContestWizard] Contest "${name}" created with programId: ${programId}`);

    res.json({ ok: true, programId, contestId });
}));

// ─── DELETE /api/wizard/tmp/:filename ───
// Clean up a temp file if the user cancels the wizard.
router.delete('/tmp/:filename', asyncRoute(async (req, res) => {
    const safeName = path.basename(req.params.filename); // strip any directory traversal
    const tmpPath = path.join(TMP_DIR, safeName);
    if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
    }
    res.json({ ok: true });
}));

module.exports = router;
