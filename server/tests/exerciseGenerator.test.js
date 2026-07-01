const AppError = require('../utils/AppError');
const { generateExercisesForContent } = require('../services/exerciseGenerator');
const db = require('../db/connection');

// Mock db connection module
jest.mock('../db/connection', () => {
    return {
        prepare: jest.fn(() => ({
            get: jest.fn(() => ({
                id: 'contest-123',
                board: 'CESGRANRIO',
                alternatives_count: 5,
                alternatives_json: '["A", "B", "C", "D", "E"]',
                has_negative_marking: 0
            }))
        }))
    };
});

describe('exerciseGenerator Service', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
        global.fetch = jest.fn();
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.clearAllMocks();
    });

    test('should throw internal error if GEMINI_API_KEY is not defined', async () => {
        delete process.env.GEMINI_API_KEY;
        await expect(generateExercisesForContent('prog-123', 'Some text content', 5))
            .rejects
            .toThrow('GEMINI_API_KEY não configurada no servidor.');
    });

    test('should validate rate limiting and throw badRequest error on rapid calls', async () => {
        process.env.GEMINI_API_KEY = 'test_key';
        
        // Mock successful fetch response
        global.fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                candidates: [{
                    content: {
                        parts: [{
                            text: JSON.stringify([
                                {
                                    text: 'Questão teste',
                                    options: { A: 'Opção A', B: 'Opção B' },
                                    correct: 'A',
                                    explanation: 'Comentário'
                                }
                            ])
                        }]
                    }
                }]
            })
        });

        // First call should succeed
        await expect(generateExercisesForContent('prog-123', 'Some content', 1)).resolves.toBeDefined();

        // Immediate second call for same programId should trigger rate limit error
        await expect(generateExercisesForContent('prog-123', 'Some content', 1))
            .rejects
            .toThrow('Aguarde pelo menos um minuto antes de gerar novas questões.');
    });
});
