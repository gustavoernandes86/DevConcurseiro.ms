const path = require('path');
const { resolveInsideRoot, assertPdfPath } = require('../utils/safePath');

describe('safePath Path Security Utility', () => {
    const mockRoot = path.resolve(__dirname, '../../content/pdfs');

    describe('resolveInsideRoot', () => {
        test('should resolve valid relative paths inside the root', () => {
            const relativePath = 'portugues/grammar.pdf';
            const expected = path.resolve(mockRoot, relativePath);
            const resolved = resolveInsideRoot(mockRoot, relativePath);
            expect(resolved).toBe(expected);
        });

        test('should fail when relativePath traverses outside the root', () => {
            const maliciousPath = '../server/index.js';
            expect(() => {
                resolveInsideRoot(mockRoot, maliciousPath);
            }).toThrow('Acesso negado: Caminho fora do diretório permitido');
        });

        test('should throw error on invalid/empty relative paths', () => {
            expect(() => resolveInsideRoot(mockRoot, null)).toThrow('Caminho inválido');
            expect(() => resolveInsideRoot(mockRoot, '')).toThrow('Caminho inválido');
            expect(() => resolveInsideRoot(mockRoot, 123)).toThrow('Caminho inválido');
        });
    });

    describe('assertPdfPath', () => {
        test('should succeed for valid .pdf files (case-insensitive)', () => {
            expect(() => assertPdfPath('study.pdf')).not.toThrow();
            expect(() => assertPdfPath('STUDY.PDF')).not.toThrow();
        });

        test('should throw error for non-pdf files', () => {
            expect(() => assertPdfPath('notes.txt')).toThrow('Arquivo não permitido. Somente arquivos PDF são aceitos.');
            expect(() => assertPdfPath('run.exe')).toThrow('Arquivo não permitido.');
        });

        test('should throw error on invalid path arguments', () => {
            expect(() => assertPdfPath(null)).toThrow();
            expect(() => assertPdfPath('')).toThrow();
            expect(() => assertPdfPath(undefined)).toThrow();
        });
    });
});
