const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const asyncRoute = require('../middleware/asyncRoute');
const { resolveInsideRoot, assertPdfPath } = require('../utils/safePath');
const path = require('path');
const fs = require('fs');

// GET /api/materials/:materialId/file - Serve a material PDF file securely
router.get('/:materialId/file', asyncRoute(async (req, res) => {
    const { materialId } = req.params;
    
    const material = db.prepare('SELECT path FROM materials WHERE id = ?').get(materialId);
    if (!material || !material.path) {
        return res.status(404).json({ error: 'Arquivo do material não encontrado no banco de dados.' });
    }

    // Determine PDF root folder (defaulting to content/pdfs)
    const pdfRoot = process.env.PDF_ROOT ? path.resolve(process.env.PDF_ROOT) : path.join(__dirname, '../../content/pdfs');

    const resolvedPath = resolveInsideRoot(pdfRoot, material.path);
    assertPdfPath(resolvedPath);

    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: `Arquivo físico não encontrado: ${material.path}` });
    }

    res.sendFile(resolvedPath);
}));

module.exports = router;
