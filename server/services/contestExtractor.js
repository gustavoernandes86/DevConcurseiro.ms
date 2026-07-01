const AppError = require('../utils/AppError');

// Rate limiter in-memory: 2 minutes between extractions per upload session
const rateLimitCache = new Map();
const RATE_LIMIT_WINDOW_MS = 2 * 60 * 1000;

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Extracts contest structure from a PDF buffer using Gemini.
 * @param {Buffer} pdfBuffer - PDF file content
 * @param {string} sessionKey - Unique key to enforce rate limiting (e.g. user ID)
 * @returns {Promise<Object>} - Extracted { contest_sections, disciplines, exam_profile }
 */
async function extractContestFromPdf(pdfBuffer, sessionKey = 'default') {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_api_key_here') {
        throw AppError.internal('GEMINI_API_KEY não configurada no servidor.');
    }

    // Rate limiting
    const now = Date.now();
    const lastRequest = rateLimitCache.get(`extract_${sessionKey}`);
    if (lastRequest && now - lastRequest < RATE_LIMIT_WINDOW_MS) {
        const wait = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - lastRequest)) / 1000);
        throw AppError.badRequest(`Aguarde ${wait}s antes de processar um novo edital.`);
    }
    rateLimitCache.set(`extract_${sessionKey}`, now);

    // Extract text from PDF buffer using pdf-parse
    let pdfText = '';
    try {
        const pdfParse = require('pdf-parse');
        const parsed = await pdfParse(pdfBuffer, { max: 80 }); // first 80 pages
        pdfText = parsed.text;
    } catch (parseErr) {
        throw AppError.internal(`Falha ao ler o PDF do edital: ${parseErr.message}`);
    }

    if (!pdfText || pdfText.trim().length < 200) {
        throw AppError.badRequest('O PDF enviado não contém texto legível suficiente para extração.');
    }

    // Limit text to prevent exceeding Gemini context
    const truncatedText = pdfText.substring(0, 40000);

    const prompt = buildExtractionPrompt(truncatedText);
    const schema = buildResponseSchema();

    let attempts = 0;
    const maxRetries = 2;
    let lastError = null;

    while (attempts < maxRetries) {
        attempts++;
        try {
            console.log(`[ContestExtractor] Gemini attempt ${attempts}...`);
            const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 8192,
                        responseMimeType: 'application/json',
                        responseSchema: schema
                    }
                })
            });

            if (!geminiRes.ok) {
                const errText = await geminiRes.text();
                throw AppError.internal(`Erro na API do Gemini: ${geminiRes.status} - ${errText}`);
            }

            const geminiData = await geminiRes.json();
            const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!rawText) {
                throw AppError.internal('A API do Gemini não retornou conteúdo.');
            }

            const parsed = JSON.parse(rawText);
            console.log('[ContestExtractor] Extracted successfully.');
            return parsed;

        } catch (err) {
            console.error(`[ContestExtractor] Attempt ${attempts} failed:`, err.message);
            lastError = err;
            if (attempts < maxRetries) {
                await new Promise(r => setTimeout(r, 1500));
            }
        }
    }

    throw lastError || AppError.internal('Falha ao extrair estrutura do edital.');
}

function buildExtractionPrompt(pdfText) {
    return `Você é um especialista em concursos públicos brasileiros. Analise o edital abaixo e extraia a estrutura do programa de provas em formato JSON.

INSTRUÇÕES:
- Identifique as seções/provas (ex: "Conhecimentos Básicos", "Conhecimentos Específicos")
- Para cada seção, liste as disciplinas/matérias
- Para cada disciplina, liste os tópicos do programa conforme descritos no edital
- Se um tópico tiver sub-tópicos explicitamente listados, inclua-os em "subtopics"
- Se o edital tiver tabela de distribuição de questões ou pesos, inclua em "topics_count_hint" e "weight"
- Para exam_profile: se o edital mencionar número de alternativas, se há penalidade por chute (anulação), ou o nome da banca examinadora, inclua essas informações
- Se uma informação não estiver explícita no edital, use null ou omita o campo
- NÃO invente tópicos que não estejam no edital

EDITAL:
${pdfText}`;
}

function buildResponseSchema() {
    return {
        type: 'OBJECT',
        properties: {
            contest_sections: {
                type: 'ARRAY',
                items: {
                    type: 'OBJECT',
                    properties: {
                        name: { type: 'STRING' },
                        is_eliminatory: { type: 'BOOLEAN' },
                        min_score: { type: 'NUMBER' },
                        topics_count_hint: { type: 'INTEGER' }
                    },
                    required: ['name']
                }
            },
            disciplines: {
                type: 'ARRAY',
                items: {
                    type: 'OBJECT',
                    properties: {
                        name: { type: 'STRING' },
                        section_name: { type: 'STRING' },
                        weight: { type: 'NUMBER' },
                        topics: {
                            type: 'ARRAY',
                            items: {
                                type: 'OBJECT',
                                properties: {
                                    title: { type: 'STRING' },
                                    detail: { type: 'STRING' },
                                    weight: { type: 'NUMBER' },
                                    subtopics: {
                                        type: 'ARRAY',
                                        items: {
                                            type: 'OBJECT',
                                            properties: {
                                                title: { type: 'STRING' },
                                                detail: { type: 'STRING' }
                                            },
                                            required: ['title']
                                        }
                                    }
                                },
                                required: ['title']
                            }
                        }
                    },
                    required: ['name', 'topics']
                }
            },
            exam_profile: {
                type: 'OBJECT',
                properties: {
                    board: { type: 'STRING' },
                    alternatives_count: { type: 'INTEGER' },
                    has_negative_marking: { type: 'BOOLEAN' },
                    notes: { type: 'STRING' }
                }
            }
        },
        required: ['contest_sections', 'disciplines']
    };
}

module.exports = { extractContestFromPdf };
