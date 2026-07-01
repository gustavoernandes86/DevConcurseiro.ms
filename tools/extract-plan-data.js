const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../plano_estudos.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Extract studyPlan block
const planStart = html.indexOf('const studyPlan = [');
const planEnd = html.indexOf('];', planStart) + 2;
const planStr = html.substring(planStart, planEnd);

// Extract PDF_FILE_MAP block
const mapStart = html.indexOf('const PDF_FILE_MAP = {');
const mapEnd = html.indexOf('};', mapStart) + 2;
const mapStr = html.substring(mapStart, mapEnd);

// Evaluate safely
const planFn = new Function(planStr + '; return studyPlan;');
const mapFn = new Function(mapStr + '; return PDF_FILE_MAP;');

const studyPlan = planFn();
const pdfFileMap = mapFn();

// Format materials
const materials = [];
for (const [key, paths] of Object.entries(pdfFileMap)) {
    // Normalize ID: remove .pdf everywhere, replace spaces/pluses/special chars with hyphens
    const id = key.replace(/\.pdf/g, '').replace(/[\s+]+/g, '-').replace(/-+/g, '-').toLowerCase();
    
    // Clean up title for user display
    let title = key.replace(/\.pdf/g, '').replace(/-/g, ' ').replace(/\+/g, '&');
    title = title.trim().charAt(0).toUpperCase() + title.slice(1);

    materials.push({
        id,
        title,
        type: 'pdf',
        path: Array.isArray(paths) ? paths[0] : paths,
        aliases: [key],
        metadata: {
            allPaths: Array.isArray(paths) ? paths : [paths]
        }
    });
}

// Format plan
const planPhases = studyPlan.map((phase, phaseIndex) => {
    return {
        id: `fase-${phaseIndex + 1}`,
        title: phase.phase,
        class: phase.phaseClass,
        subtitle: phase.subtitle,
        weeks: phase.weeks.map((week, weekIndex) => {
            return {
                id: `semana-${week.number}`,
                number: String(week.number),
                title: week.title,
                topics: week.topics.map((topic) => {
                    const topicMaterials = [];
                    if (topic.detail) {
                        const matAlias = topic.detail;
                        const matchedMat = materials.find(m => m.aliases.includes(matAlias));
                        if (matchedMat) {
                            topicMaterials.push({
                                materialId: matchedMat.id,
                                startPage: topic.startPage || 1,
                                endPage: topic.endPage || null
                            });
                        }
                    }
                    return {
                        id: topic.id,
                        title: topic.name,
                        tag: topic.tag,
                        tagClass: topic.tagClass,
                        detail: topic.detail || null,
                        materials: topicMaterials
                    };
                })
            };
        })
    };
});

const outDir = path.join(__dirname, '../data/contests/petrobras-eng-software-2026');
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'plan.json'), JSON.stringify({ phases: planPhases }, null, 2));
fs.writeFileSync(path.join(outDir, 'materials.json'), JSON.stringify(materials, null, 2));

console.log('Successfully extracted plan.json and materials.json!');
