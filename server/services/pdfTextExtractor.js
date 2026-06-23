const fs = require('fs');
const path = require('path');
const db = require('../db/connection');
const pdfParse = require('pdf-parse');
const { resolveInsideRoot, assertPdfPath } = require('../utils/safePath');

/**
 * Extracts and returns text for specified page numbers of a material, caching text in DB.
 * @param {string} materialId - Target material ID.
 * @param {Array<number>} pages - List of page numbers.
 * @returns {Promise<Object>} - Object mapping page number to text string.
 */
async function getTextForMaterialPages(materialId, pages) {
    if (!pages || pages.length === 0) return {};

    const uniquePages = Array.from(new Set(pages)).sort((a, b) => a - b);
    const result = {};
    const missingPages = [];

    // 1. Check cache first
    const stmtSelect = db.prepare('SELECT page_number, text FROM pdf_page_text_cache WHERE material_id = ? AND page_number = ?');
    for (const page of uniquePages) {
        const cached = stmtSelect.get(materialId, page);
        if (cached) {
            result[page] = cached.text;
        } else {
            missingPages.push(page);
        }
    }

    if (missingPages.length === 0) {
        return result;
    }

    // 2. Fetch material path from DB
    const material = db.prepare('SELECT path FROM materials WHERE id = ?').get(materialId);
    if (!material || !material.path) {
        throw new Error(`Material não encontrado ou sem caminho de arquivo: ${materialId}`);
    }

    // Resolve path safely
    const pdfRoot = process.env.PDF_ROOT ? path.resolve(process.env.PDF_ROOT) : path.join(__dirname, '../../public/pdfs');
    const parentRoot = path.join(__dirname, '../..');
    let resolvedPath;
    
    try {
        resolvedPath = resolveInsideRoot(pdfRoot, material.path);
        if (!fs.existsSync(resolvedPath)) {
            resolvedPath = resolveInsideRoot(parentRoot, material.path);
        }
    } catch (e) {
        resolvedPath = resolveInsideRoot(parentRoot, material.path);
    }

    assertPdfPath(resolvedPath);

    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Arquivo físico do PDF não encontrado: ${material.path}`);
    }

    // 3. Extract missing pages text
    const dataBuffer = fs.readFileSync(resolvedPath);
    const maxPage = Math.max(...missingPages);

    const pagesTextCollector = {};
    
    try {
        await pdfParse(dataBuffer, {
            max: maxPage,
            pagerender: function(pageData) {
                return pageData.getTextContent().then(function(textContent) {
                    const text = textContent.items.map(item => item.str).join(' ');
                    const pageNum = pageData.pageIndex + 1;
                    pagesTextCollector[pageNum] = text;
                    return text;
                });
            }
        });
    } catch (parseErr) {
        console.error(`[pdfTextExtractor] Error extracting text from PDF:`, parseErr.message);
        throw new Error(`Falha ao extrair texto do arquivo PDF: ${material.path}. ${parseErr.message}`);
    }

    // 4. Save to cache and populate result
    const stmtInsert = db.prepare(`
        INSERT OR REPLACE INTO pdf_page_text_cache (material_id, page_number, text, extracted_at)
        VALUES (?, ?, ?, ?)
    `);

    for (const page of missingPages) {
        const text = pagesTextCollector[page] || '';
        stmtInsert.run(materialId, page, text, Date.now());
        result[page] = text;
    }

    return result;
}

module.exports = {
    getTextForMaterialPages
};
