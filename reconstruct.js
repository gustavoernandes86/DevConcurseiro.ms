const fs = require('fs');

const txt = fs.readFileSync('C:/Users/gusta/.gemini/antigravity-ide/brain/8cd78963-e446-4778-8809-fb5b9af0769b/.system_generated/logs/transcript.jsonl', 'utf8');
const lines = txt.split('\n');

let allCodeLines = new Map();

for (let line of lines) {
    if (!line) continue;
    try {
        const obj = JSON.parse(line);
        if (obj.type === 'VIEW_FILE' && obj.content && obj.content.includes('f:/_GRAN/Petrobras/plano_estudos.html')) {
            const contentLines = obj.content.split('\n');
            let isCode = false;
            for (let cl of contentLines) {
                // match "123: <code>"
                const match = cl.match(/^(\d+):\s(.*)$/);
                if (match) {
                    const lineNum = parseInt(match[1], 10);
                    // Don't overwrite if we already have it, unless we want to. Actually, earlier views are cleaner because they don't have my changes? 
                    // Wait, these views were done BEFORE I corrupted the file!
                    // Let's just store the line.
                    if (!allCodeLines.has(lineNum)) {
                        allCodeLines.set(lineNum, match[2]);
                    }
                }
            }
        }
    } catch(e) {}
}

const maxLine = Math.max(...Array.from(allCodeLines.keys()));
let reconstructed = [];
for (let i = 1; i <= maxLine; i++) {
    if (allCodeLines.has(i)) {
        reconstructed.push(allCodeLines.get(i));
    } else {
        reconstructed.push('<!-- MISSING LINE ' + i + ' -->');
    }
}

fs.writeFileSync('reconstructed.html', reconstructed.join('\n'));
console.log('Reconstructed lines: ' + maxLine);

