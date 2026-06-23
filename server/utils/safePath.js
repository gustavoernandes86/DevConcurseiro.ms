const path = require('path');

/**
 * Resolves a relative path within a specific root directory, raising a 400 error if it traverses outside.
 * @param {string} rootDir - Permitted root directory.
 * @param {string} relativePath - Target relative path.
 * @returns {string} - Resolved absolute path.
 */
function resolveInsideRoot(rootDir, relativePath) {
    if (!relativePath || typeof relativePath !== 'string') {
        const err = new Error('Caminho inválido');
        err.statusCode = 400;
        throw err;
    }

    const root = path.resolve(rootDir);
    const resolved = path.resolve(root, relativePath);

    // Ensure resolved path starts with the root path and isn't the root path itself
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        const err = new Error('Acesso negado: Caminho fora do diretório permitido');
        err.statusCode = 400;
        throw err;
    }

    return resolved;
}

/**
 * Asserts that a file path is a PDF.
 * @param {string} filePath - Absolute or relative file path.
 */
function assertPdfPath(filePath) {
    if (!filePath || typeof filePath !== 'string' || !filePath.toLowerCase().endsWith('.pdf')) {
        const err = new Error('Arquivo não permitido. Somente arquivos PDF são aceitos.');
        err.statusCode = 400;
        throw err;
    }
}

module.exports = {
    resolveInsideRoot,
    assertPdfPath
};
