const db = require('../db/connection');
const AppError = require('../utils/AppError');

// Simple in-memory rate limiter to prevent abuse/cost spikes
const rateLimitCache = new Map();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute between generations per program

/**
 * Compiles a profile-based prompt and calls Gemini API to generate questions.
 * @param {string} programId - Learning program ID.
 * @param {string} extractedContent - Text parsed from target pages.
 * @param {number} numQuestions - Number of questions to generate.
 * @returns {Promise<Array>} - Array of compiled questions.
 */
async function generateExercisesForContent(programId, extractedContent, numQuestions = 10) {
    // Rate Limiting Check
    const now = Date.now();
    const lastRequest = rateLimitCache.get(programId);
    if (lastRequest && now - lastRequest < RATE_LIMIT_WINDOW_MS) {
        throw AppError.badRequest(`Aguarde pelo menos um minuto antes de gerar novas questões.`);
    }
    
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_api_key_here') {
        throw AppError.internal('GEMINI_API_KEY não configurada no servidor.');
    }

    rateLimitCache.set(programId, now);

    // Fetch exam profile for the active program's contest
    const contest = db.prepare('SELECT id FROM contests WHERE program_id = ?').get(programId);
    let examProfile = null;
    if (contest) {
        examProfile = db.prepare('SELECT * FROM exam_profiles WHERE contest_id = ?').get(contest.id);
    }

    // Profile defaults (Cesgranrio format if not found)
    const boardName = examProfile ? examProfile.board : 'CESGRANRIO';
    const alternativesCount = examProfile ? examProfile.alternatives_count : 5;
    const alternativesList = examProfile && examProfile.alternatives_json 
        ? JSON.parse(examProfile.alternatives_json) 
        : ['A', 'B', 'C', 'D', 'E'];
    const negativeMarking = examProfile ? examProfile.has_negative_marking : 0;

    const prompt = buildExamPrompt(boardName, numQuestions, alternativesCount, alternativesList, negativeMarking, extractedContent);

    let attempts = 0;
    const maxRetries = 2;
    let questions = null;
    let lastError = null;

    while (attempts < maxRetries) {
        attempts++;
        try {
            console.log(`[Exercise Generator] Attempt ${attempts} with Gemini for ${boardName}...`);
            const geminiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 8192,
                            responseMimeType: 'application/json',
                            responseSchema: buildResponseSchema(alternativesList)
                        }
                    })
                }
            );

            if (!geminiRes.ok) {
                const errText = await geminiRes.text();
                throw AppError.internal('Erro na API do Gemini: ' + geminiRes.status + ' - ' + errText);
            }

            const geminiData = await geminiRes.json();
            const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!rawText) {
                throw AppError.internal('A API do Gemini não retornou conteúdo.');
            }

            questions = parseGeminiResponse(rawText);

            if (!Array.isArray(questions) || questions.length < 5) {
                throw AppError.internal('A IA não gerou questões suficientes.');
            }
            break;
        } catch (err) {
            console.error(`[Exercise Generator] Attempt ${attempts} failed:`, err.message);
            lastError = err;
            if (attempts < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
    }

    if (!questions) {
        throw lastError || AppError.internal('Falha ao gerar simulado no Gemini.');
    }

    return questions;
}

function buildExamPrompt(boardName, numQuestions, alternativesCount, alternativesList, negativeMarking, extractedContent) {
    let promptRules = `Você é um especialista em concursos públicos brasileiros e irá criar uma lista de exercícios de fixação no estilo da banca ${boardName.toUpperCase()}.

Com base no conteúdo estudado abaixo, elabore EXATAMENTE ${numQuestions} questões de múltipla escolha (estilo ${boardName}), cada uma com ${alternativesCount} alternativas (${alternativesList.join(', ')}) e apenas uma resposta correta.

REGRAS OBRIGATÓRIAS DE CONTEÚDO E SEGURANÇA:
- As questões devem ser baseadas no conteúdo fornecido, focando EXCLUSIVAMENTE nos conceitos técnicos, teóricos e acadêmicos do assunto abordado (por exemplo, modelos de ciclo de vida de software, engenharia de requisitos, etc.).
- NÃO faça perguntas sobre a autoria do PDF, dados biográficos de professores, sumário, índice, introdução do curso ou sobre a estrutura e formatação do próprio documento (evite enunciados como "No material didático...", "Segundo o sumário...", "Conforme o currículo de...").
- As questões devem ler-se como itens reais de uma prova de concurso público (focando puramente no assunto, por exemplo: "No que se refere a modelos de ciclo de vida de software...").
- As alternativas incorretas devem ser plausíveis (não óbvias).
- Cada questão deve ter um gabarito comentado objetivo e muito sucinto (máximo de 3 frases) explicando por que a resposta correta é a certa e por que as outras estão erradas. Evite explicações excessivamente longas para não estourar limites.
- Responda APENAS com JSON válido, sem nenhum texto fora do JSON.`;

    if (negativeMarking) {
        promptRules += '\n- ATENÇÃO: Esta banca adota pontuação negativa (uma resposta errada anula uma certa), portanto as questões devem exigir máxima precisão técnica.';
    }

    return `${promptRules}

FORMATO JSON OBRIGATÓRIO (array com exatamente ${numQuestions} objetos):
[
  {
    "id": 1,
    "enunciado": "Texto da questão...",
    "alternativas": {
      ${alternativesList.map(a => `"${a}": "Texto da alternativa ${a}"`).join(',\n      ')}
    },
    "resposta_correta": "${alternativesList[0]}",
    "comentario": "A alternativa ${alternativesList[0]} está correta porque..."
  }
]

CONTEÚDO ESTUDADO HOJE:
${extractedContent.substring(0, 30000)}`;
}

function buildResponseSchema(alternativesList) {
    return {
        type: 'ARRAY',
        items: {
            type: 'OBJECT',
            properties: {
                id: { type: 'INTEGER' },
                enunciado: { type: 'STRING' },
                alternativas: {
                    type: 'OBJECT',
                    properties: alternativesList.reduce((acc, alt) => {
                        acc[alt] = { type: 'STRING' };
                        return acc;
                    }, {}),
                    required: alternativesList
                },
                resposta_correta: { type: 'STRING' },
                comentario: { type: 'STRING' }
            },
            required: ["id", "enunciado", "alternativas", "resposta_correta", "comentario"]
        }
    };
}

function parseGeminiResponse(rawText) {
    try {
        let parsedJson = JSON.parse(rawText);
        return parsedJson.map((q, i) => ({
            id: q.id || `q${Date.now()}_${i}`,
            text: q.enunciado || q.text,
            options: q.alternativas || q.options,
            correct: q.resposta_correta || q.correct,
            explanation: q.comentario || q.explanation
        }));
    } catch (parseErr) {
        const match = rawText.match(/\[[\s\S]*\]/);
        if (match) {
            let parsedJson = JSON.parse(match[0]);
            return parsedJson.map((q, i) => ({
                id: q.id || `q${Date.now()}_${i}`,
                text: q.enunciado || q.text,
                options: q.alternativas || q.options,
                correct: q.resposta_correta || q.correct,
                explanation: q.comentario || q.explanation
            }));
        } else {
            throw AppError.internal('Resposta da IA em formato JSON inválido.');
        }
    }
}

module.exports = {
    generateExercisesForContent
};

