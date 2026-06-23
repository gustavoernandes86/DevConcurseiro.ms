const db = require('../db/connection');

/**
 * Compiles a profile-based prompt and calls Gemini API to generate questions.
 * @param {string} programId - Learning program ID.
 * @param {string} extractedContent - Text parsed from target pages.
 * @returns {Promise<Array>} - Array of 10 compiled questions.
 */
async function generateExercisesForContent(programId, extractedContent) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_api_key_here') {
        throw new Error('GEMINI_API_KEY não configurada no servidor.');
    }

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

    // Build the prompt based on exam profile rules
    let promptRules = `Você é um especialista em concursos públicos brasileiros e irá criar uma lista de exercícios de fixação no estilo da banca ${boardName.toUpperCase()}.

Com base no conteúdo estudado abaixo, elabore EXATAMENTE 10 questões de múltipla escolha (estilo ${boardName}), cada uma com ${alternativesCount} alternativas (${alternativesList.join(', ')}) e apenas uma resposta correta.

REGRAS OBRIGATÓRIAS:
- As questões devem ser baseadas exclusivamente no conteúdo fornecido.
- O nível de dificuldade deve ser moderado a alto (nível concurso público federal).
- As alternativas incorretas devem ser plausíveis (não óbvias).
- Cada questão deve ter um gabarito comentado objetivo e muito sucinto (máximo de 3 frases) explicando por que a resposta correta é a certa e por que as outras estão erradas. Evite explicações excessivamente longas para não estourar limites.
- Responda APENAS com JSON válido, sem nenhum texto fora do JSON.`;

    if (negativeMarking) {
        promptRules += '\n- ATENÇÃO: Esta banca adota pontuação negativa (uma resposta errada anula uma certa), portanto as questões devem exigir máxima precisão técnica.';
    }

    const prompt = `${promptRules}

FORMATO JSON OBRIGATÓRIO (array com exatamente 10 objetos):
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
                            responseSchema: {
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
                            }
                        }
                    })
                }
            );

            if (!geminiRes.ok) {
                const errText = await geminiRes.text();
                throw new Error('Erro na API do Gemini: ' + geminiRes.status + ' - ' + errText);
            }

            const geminiData = await geminiRes.json();
            const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!rawText) {
                throw new Error('A API do Gemini não retornou conteúdo.');
            }

            try {
                questions = JSON.parse(rawText);
            } catch (parseErr) {
                const match = rawText.match(/\[[\s\S]*\]/);
                if (match) {
                    questions = JSON.parse(match[0]);
                } else {
                    throw new Error('Resposta da IA em formato JSON inválido.');
                }
            }

            if (!Array.isArray(questions) || questions.length < 5) {
                throw new Error('A IA não gerou questões suficientes.');
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
        throw lastError || new Error('Falha ao gerar simulado no Gemini.');
    }

    return questions;
}

module.exports = {
    generateExercisesForContent
};
