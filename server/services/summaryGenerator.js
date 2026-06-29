const db = require('../db/connection');
const AppError = require('../utils/AppError');
const { getTextForMaterialPages } = require('./pdfTextExtractor');

// Rate limiter: 2 minutes between generations per topic
const rateLimitCache = new Map();
const RATE_LIMIT_WINDOW_MS = 2 * 60 * 1000;

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const MAX_CHARS_PER_MATERIAL = 15000; // per-material text limit before chunking
const MAX_CHARS_TOTAL = 50000;        // total text limit for single-pass synthesis

/**
 * Generates an AI summary for a topic by combining text from all its PDF materials.
 * Uses chunking strategy if total text exceeds limits.
 * @param {string} topicId
 * @param {string} programId
 * @returns {Promise<{ content: string, sourceMaterialIds: string[] }>}
 */
async function generateTopicSummary(topicId, programId) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_api_key_here') {
        throw AppError.internal('GEMINI_API_KEY não configurada.');
    }

    // Rate limiting
    const now = Date.now();
    const lastRequest = rateLimitCache.get(`summary_${topicId}`);
    if (lastRequest && now - lastRequest < RATE_LIMIT_WINDOW_MS) {
        const wait = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - lastRequest)) / 1000);
        throw AppError.badRequest(`Aguarde ${wait}s antes de regerar o resumo.`);
    }
    rateLimitCache.set(`summary_${topicId}`, now);

    // Get topic info
    const topic = db.prepare('SELECT id, title FROM topics WHERE id = ?').get(topicId);
    if (!topic) throw AppError.notFound('Tópico não encontrado.');

    // Get all PDF materials linked to this topic with page ranges
    const mappings = db.prepare(`
        SELECT tm.material_id, tm.start_page, tm.end_page, m.title as material_title, m.source as material_source
        FROM topic_materials tm
        JOIN materials m ON tm.material_id = m.id
        WHERE tm.topic_id = ? AND m.type = 'pdf'
        ORDER BY tm.sort_order
    `).all(topicId);

    if (mappings.length === 0) {
        throw AppError.badRequest('Este tópico não possui materiais em PDF vinculados.');
    }

    // Extract text from each material
    const materialTexts = [];
    const sourceMaterialIds = [];

    for (const mapping of mappings) {
        let pages = [];
        if (mapping.start_page && mapping.end_page) {
            for (let p = mapping.start_page; p <= mapping.end_page; p++) pages.push(p);
        } else if (mapping.start_page) {
            // No end_page: extract up to 20 pages from start
            for (let p = mapping.start_page; p <= mapping.start_page + 19; p++) pages.push(p);
        }
        // If no page range at all: extract pages 1–15 as a fallback
        if (pages.length === 0) {
            pages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
        }

        try {
            const pagesText = await getTextForMaterialPages(mapping.material_id, pages);
            const combinedText = Object.values(pagesText).join(' ').trim();
            if (combinedText.length > 100) {
                const label = mapping.material_source
                    ? `${mapping.material_title} (${mapping.material_source})`
                    : mapping.material_title;
                materialTexts.push({
                    materialId: mapping.material_id,
                    label,
                    text: combinedText.substring(0, MAX_CHARS_PER_MATERIAL)
                });
                sourceMaterialIds.push(mapping.material_id);
            }
        } catch (err) {
            console.error(`[SummaryGenerator] Failed to extract text for material ${mapping.material_id}:`, err.message);
        }
    }

    if (materialTexts.length === 0) {
        throw AppError.badRequest('Não foi possível extrair texto dos PDFs vinculados ao tópico.');
    }

    // Decide: single-pass or chunked
    const totalChars = materialTexts.reduce((sum, m) => sum + m.text.length, 0);
    let finalContent;

    if (materialTexts.length === 1 || totalChars <= MAX_CHARS_TOTAL) {
        // Single-pass: all materials in one prompt
        finalContent = await callGeminiSynthesis(topic.title, materialTexts, GEMINI_API_KEY);
    } else {
        // Chunked: summarize each material first, then synthesize summaries
        console.log(`[SummaryGenerator] Using chunked strategy (${materialTexts.length} materials, ${totalChars} chars)`);
        const intermediates = [];
        for (const mat of materialTexts) {
            const intermediate = await callGeminiIntermediate(topic.title, mat, GEMINI_API_KEY);
            intermediates.push({ label: mat.label, text: intermediate });
        }
        finalContent = await callGeminiSynthesis(topic.title, intermediates, GEMINI_API_KEY);
    }

    return { content: finalContent, sourceMaterialIds };
}

/**
 * Single Gemini call: synthesize all material texts into a unified summary.
 */
async function callGeminiSynthesis(topicTitle, materials, apiKey) {
    const materialsBlock = materials
        .map((m, i) => `=== FONTE ${i + 1}: ${m.label} ===\n${m.text}`)
        .join('\n\n');

    const prompt = `Você é um professor especialista em concursos públicos. Elabore um resumo de estudo objetivo e completo sobre o seguinte tópico de edital:

TÓPICO: "${topicTitle}"

INSTRUÇÕES:
- Sintetize os pontos mais importantes para prova de concurso público
- Se as fontes apresentarem informações COMPLEMENTARES entre si, integre-as em um resumo unificado
- Se houver DIVERGÊNCIA entre fontes, indique explicitamente (ex: "Segundo [Fonte 1], X. Já [Fonte 2] afirma Y.")
- Use formatação clara: cabeçalhos com ##, listas com -, destaques com **negrito**
- Foque no que cai em prova, não em detalhes históricos ou acadêmicos irrelevantes
- Seja conciso mas completo. O resumo deve ser estudável diretamente.

MATERIAIS DE ESTUDO:
${materialsBlock}

Gere o resumo agora:`;

    return callGemini(prompt, apiKey, 4096);
}

/**
 * Intermediate Gemini call: summarize a single material before final synthesis.
 */
async function callGeminiIntermediate(topicTitle, material, apiKey) {
    const prompt = `Resuma os pontos principais sobre "${topicTitle}" do trecho de material abaixo, focando no que é relevante para concurso público. Seja conciso.

FONTE: ${material.label}
CONTEÚDO:
${material.text}`;

    return callGemini(prompt, apiKey, 2048);
}

/**
 * Generic Gemini text generation call (returns plain text).
 */
async function callGemini(prompt, apiKey, maxTokens = 4096) {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.4,
                maxOutputTokens: maxTokens
            }
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw AppError.internal(`Erro na API do Gemini: ${res.status} - ${err}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw AppError.internal('Gemini não retornou conteúdo para o resumo.');
    return text.trim();
}

module.exports = { generateTopicSummary };
