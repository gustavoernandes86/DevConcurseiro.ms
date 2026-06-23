const fs = require('fs');
const txt = fs.readFileSync('C:/Users/gusta/.gemini/antigravity-ide/brain/8cd78963-e446-4778-8809-fb5b9af0769b/.system_generated/logs/transcript.jsonl', 'utf8');

const lines = txt.split('\n');
let extractedHTML = '';

for (let line of lines) {
    if (!line) continue;
    try {
        const obj = JSON.parse(line);
        if (obj.tool_calls) {
            for (let tc of obj.tool_calls) {
                if (tc.function && tc.function.name === 'default_api:view_file' && tc.response && tc.response.output && tc.response.output.includes('<!DOCTYPE html>')) {
                    const output = tc.response.output;
                    // Usually view_file has some prefixed text: "File Path: ... Total Lines: ... \n<line_number>: <original_line>\n..."
                    // Wait, view_file prepends line numbers! e.g., "1: <!DOCTYPE html>"
                    // We need to parse that!
                    const linesWithNums = output.split('\n');
                    let codeLines = [];
                    for (let ol of linesWithNums) {
                        const match = ol.match(/^\d+:\s(.*)$/);
                        if (match) {
                            codeLines.push(match[1]);
                        }
                    }
                    if (codeLines.length > 100) {
                        extractedHTML = codeLines.join('\n');
                        fs.writeFileSync('extracted.html', extractedHTML);
                        console.log('Extracted from view_file, length: ', extractedHTML.length);
                        process.exit(0);
                    }
                }
            }
        }
    } catch(e) {}
}

console.log('Not found via view_file. Trying raw match.');
const start = txt.indexOf('<!DOCTYPE html>');
if (start !== -1) {
    // This might be in a JSON string, let's just regex out the content if possible
    // or just write the raw chunk and we can clean it manually.
    let end = txt.indexOf('</html>', start);
    let chunk = txt.substring(start, end + 7);
    fs.writeFileSync('extracted_raw.txt', chunk);
    console.log('Wrote extracted_raw.txt');
}
