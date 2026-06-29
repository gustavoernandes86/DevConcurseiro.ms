const db = require('../db/connection');
const AppError = require('../utils/AppError');
const { getTextForMaterialPages } = require('./pdfTextExtractor');

// Rate limiting map: 2 minutes between generations per topic
const rateLimitCache = new Map();
const RATE_LIMIT_WINDOW_MS = 2 * 60 * 1000;

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const MAX_CHARS_PER_MATERIAL = 15000;
const MAX_CHARS_TOTAL = 45000;

/**
 * Generates Anki-style flashcards for a topic by extracting text from its PDFs.
 * @param {string} topicId
 * @param {string} programId
 * @returns {Promise<Array<{ front: string, back: string }>>}
 */
async function generateTopicFlashcards(topicId, programId) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_api_key_here') {
        throw AppError.internal('GEMINI_API_KEY não configurada.');
    }

    // Rate limiting
    const now = Date.now();
    const lastRequest = rateLimitCache.get(`flashcard_${topicId}`);
    if (lastRequest && now - lastRequest < RATE_LIMIT_WINDOW_MS) {
        const wait = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - lastRequest)) / 1000);
        throw AppError.badRequest(`Aguarde ${wait}s antes de regerar os flashcards.`);
    }
    rateLimitCache.set(`flashcard_${topicId}`, now);

    // Get topic info
    const topic = db.prepare('SELECT id, title FROM topics WHERE id = ?').get(topicId);
    if (!topic) throw AppError.notFound('Tópico não encontrado.');

    // Get PDF materials linked to this topic
    const mappings = db.prepare(`
        SELECT tm.material_id, tm.start_page, tm.end_page, m.title as material_title
        FROM topic_materials tm
        JOIN materials m ON tm.material_id = m.id
        WHERE tm.topic_id = ? AND m.type = 'pdf'
        ORDER BY tm.sort_order
    `).all(topicId);

    if (mappings.length === 0) {
        throw AppError.badRequest('Este tópico não possui materiais em PDF vinculados.');
    }

    // Extract text from materials
    const materialTexts = [];
    for (const mapping of mappings) {
        let pages = [];
        if (mapping.start_page && mapping.end_page) {
            for (let p = mapping.start_page; p <= mapping.end_page; p++) pages.push(p);
        } else if (mapping.start_page) {
            for (let p = mapping.start_page; p <= mapping.start_page + 14; p++) pages.push(p);
        }
        if (pages.length === 0) {
            pages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        }

        try {
            const pagesText = await getTextForMaterialPages(mapping.material_id, pages);
            const combinedText = Object.values(pagesText).join(' ').trim();
            if (combinedText.length > 100) {
                materialTexts.push({
                    title: mapping.material_title,
                    text: combinedText.substring(0, MAX_CHARS_PER_MATERIAL)
                });
            }
        } catch (err) {
            console.error(`[FlashcardGenerator] Error extracting text for material ${mapping.material_id}:`, err.message);
        }
    }

    if (materialTexts.length === 0) {
        throw AppError.badRequest('Não foi possível extrair texto dos PDFs vinculados ao tópico.');
    }

    // Combine texts
    const combinedInputText = materialTexts
        .map((m, i) => `[Material ${i + 1}: ${m.title}]\n${m.text}`)
        .join('\n\n')
        .substring(0, MAX_CHARS_TOTAL);

    const prompt = buildFlashcardsPrompt(topic.title, combinedInputText);
    const schema = buildResponseSchema();

    let attempts = 0;
    const maxRetries = 2;
    let lastError = null;

    while (attempts < maxRetries) {
        attempts++;
        try {
            console.log(`[FlashcardGenerator] Gemini call attempt ${attempts} for topic ${topicId}...`);
            const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: 4096,
                        responseMimeType: 'application/json',
                        responseSchema: schema
                    }
                })
            });

            if (!res.ok) {
                const errText = await res.text();
                throw AppError.internal(`Erro na API do Gemini: ${res.status} - ${errText}`);
            }

            const data = await res.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) throw AppError.internal('Gemini não retornou dados.');

            const parsed = JSON.parse(rawText);
            if (!parsed.cards || !Array.isArray(parsed.cards)) {
                throw AppError.internal('Formato de resposta inválido.');
            }

            console.log(`[FlashcardGenerator] Generated ${parsed.cards.length} cards successfully.`);
            return parsed.cards;

        } catch (err) {
            console.error(`[FlashcardGenerator] Attempt ${attempts} failed:`, err.message);
            lastError = err;
            if (attempts < maxRetries) {
                await new Promise(r => setTimeout(r, 1500));
            }
        }
    }

    throw lastError || AppError.internal('Falha ao gerar cartões de revisão.');
}

function buildFlashcardsPrompt(topicTitle, contentText) {
    return `Você é um professor especialista em concursos públicos e técnicas de memorização ativa (Active Recall).
Com base no material fornecido abaixo sobre o tópico "${topicTitle}", crie entre 8 e 15 cartões de memorização estilo Anki (Flashcards).

DIRETRIZES PARA OS FLASHCARDS:
- Frente (front): Deve conter uma pergunta direta, uma lacuna (cloze deletion) ou um conceito para definir. Seja claro e conciso.
- Verso (back): Deve conter a resposta exata, direta e explicativa de forma sucinta (tente manter curto para memorização fácil).
- Foque em detalhes cobrados em bancas de concursos (definições cruciais, regras, exceções, listas curtas, classificações).
- Evite perguntas de Sim/Não vagas. Prefira "O que é...", "Quais são os 3 requisitos para...", "No modelo X, a fase Y é responsável por..."

CONTEÚDO DO MATERIAL:
${contentText}

Crie os flashcards agora seguindo o schema JSON fornecido.`;
}

function buildResponseSchema() {
    return {
        type: 'OBJECT',
        properties: {
            cards: {
                type: 'ARRAY',
                items: {
                    type: 'OBJECT',
                    properties: {
                        front: { type: 'STRING' },
                        back: { type: 'STRING' }
                    },
                    required: ['front', 'back']
                }
            }
        },
        required: ['cards']
    };
}

module.exports = { generateTopicFlashcards };
