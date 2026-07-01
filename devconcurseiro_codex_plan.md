# DevConcurseiro.ms — Plano de Refatoração e Prompt para Codex

**Objetivo:** transformar o projeto atual, hoje focado no concurso Petrobras — Ênfase 4: Engenharia de Software, em uma aplicação local-first configurável para múltiplos concursos e trilhas de aprendizagem, com backend Express/SQLite mais seguro e frontend Vue 3 + PrimeVue.

**Estado atual resumido:**

- Backend em Node.js + Express.
- Banco SQLite com `better-sqlite3`, WAL ativo e schema criado diretamente no `server.js`.
- Frontend monolítico em `plano_estudos.html`, usando HTML, CSS e Vanilla JavaScript.
- Plano Petrobras e `PDF_FILE_MAP` hardcoded no frontend.
- Pomodoro, bookmarks de PDF, leitura diária, geração de simulados por IA, histórico e backup já implementados.
- IA usando Gemini no backend.
- `extract.js` é utilitário avulso e não deve fazer parte do runtime da aplicação.

---

## 1. Decisões tomadas

### 1.1. Frontend

Migrar o frontend para:

```txt
Vue 3 + Vite + PrimeVue + Pinia + Vue Router
```

Não usar Nuxt agora. O sistema é local-first e o backend Express já cumpre o papel server-side necessário.

### 1.2. Backend

Manter:

```txt
Node.js + Express + SQLite + better-sqlite3
```

Mas refatorar para:

- rotas separadas;
- middleware global de erro;
- validação estrita de payload;
- sanitização de paths;
- migrations versionadas;
- backup antes de alteração de schema;
- endpoints escopados por `programId`;
- paths de PDF resolvidos no backend a partir de `materialId`.

### 1.3. Domínio do produto

O sistema deve deixar de ser apenas um “Plano Petrobras” e passar a ser um **gerenciador de programas de aprendizagem**.

Tipos iniciais:

```txt
learning_program.type = 'contest'
learning_program.type = 'course'
```

Exemplos:

```txt
Concursos:
- Petrobras — Engenharia de Software
- Banco do Brasil — TI
- Receita Federal — TI

Cursos / Pós-graduação:
- Full Stack
- Cloud Computing
- Inteligência Artificial
```

### 1.4. Petrobras

Petrobras será o primeiro concurso configurado, migrado para arquivos de dados:

```txt
data/contests/petrobras-eng-software-2026/contest.json
data/contests/petrobras-eng-software-2026/plan.json
data/contests/petrobras-eng-software-2026/materials.json
data/contests/petrobras-eng-software-2026/strategy.md
```

O frontend não deve conter `studyPlan` nem `PDF_FILE_MAP` hardcoded.

### 1.5. Pós-graduação

Não criar apenas uma tabela isolada `pos_video_progress` como modelo final.

Implementar pós-graduação como `learning_program` do tipo `course`, com módulos, disciplinas, vídeos e progresso.

---

## 2. Regras inegociáveis para o Codex

1. **Não apagar o app antigo imediatamente.**  
   Manter `plano_estudos.html` como referência durante a migração. Só remover quando o Vue estiver funcional.

2. **Preservar dados existentes.**  
   O banco atual `estudos.db` não pode ser sobrescrito sem backup e migração.

3. **Criar backup automático antes de migrations.**

4. **Não expor `.env`, banco SQLite, scripts, backups ou código-fonte via `express.static`.**

5. **Não confiar em paths enviados pelo frontend.**  
   O frontend deve enviar `materialId`; o backend resolve o path real e valida se está dentro de `PDF_ROOT`.

6. **Todo endpoint de escrita deve ter validação e tratamento de erro.**  
   Aplicar a todos os métodos `POST`, `PUT`, `PATCH` e `DELETE`.

7. **A chave Gemini fica somente no backend.**

8. **Não usar `v-html` sem sanitização.**  
   Dados vindos de usuário, IA, JSON ou banco devem ser renderizados com escaping padrão do Vue.

9. **Migrations devem ser idempotentes.**

10. **O visual escuro atual deve ser preservado.**  
    PrimeVue deve ser usado como base de componentes, não como substituto total da identidade visual.

11. **Não usar React. Não usar Nuxt nesta fase.**

12. **Não criar pós-graduação como silo paralelo.**  
    Ela deve compartilhar modelo de `learning_program`, sessões, notas e progresso.

---

## 3. Estrutura final desejada

```txt
devconcurseiro/
├── package.json
├── .env.example
├── README.md
├── data/
│   ├── estudos.db
│   ├── backups/
│   └── contests/
│       └── petrobras-eng-software-2026/
│           ├── contest.json
│           ├── plan.json
│           ├── materials.json
│           └── strategy.md
│
├── server/
│   ├── index.js
│   ├── db/
│   │   ├── connection.js
│   │   ├── migrate.js
│   │   └── migrations/
│   │       ├── 001_initial_legacy.sql
│   │       ├── 002_programs_contests.sql
│   │       ├── 003_materials_topics.sql
│   │       ├── 004_progress_sessions_notes.sql
│   │       ├── 005_exercises_sources.sql
│   │       └── 006_video_learning.sql
│   ├── routes/
│   │   ├── contests.js
│   │   ├── programs.js
│   │   ├── topics.js
│   │   ├── notes.js
│   │   ├── sessions.js
│   │   ├── config.js
│   │   ├── materials.js
│   │   ├── pdf.js
│   │   ├── readingLog.js
│   │   ├── exercises.js
│   │   └── backup.js
│   ├── services/
│   │   ├── contestLoader.js
│   │   ├── materialResolver.js
│   │   ├── pdfTextExtractor.js
│   │   ├── exerciseGenerator.js
│   │   ├── backupService.js
│   │   └── legacyMigrationService.js
│   ├── middleware/
│   │   ├── asyncRoute.js
│   │   ├── errorHandler.js
│   │   └── validate.js
│   └── utils/
│       ├── safePath.js
│       ├── date.js
│       └── json.js
│
├── frontend/
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── src/
│       ├── main.ts
│       ├── App.vue
│       ├── router/
│       ├── stores/
│       ├── services/
│       ├── components/
│       ├── views/
│       └── assets/
│
├── public/
│   ├── pdfjs/
│   └── pdfs/
│
└── tools/
    └── extract.js
```

Mover `extract.js` para `/tools`, pois ele é um script auxiliar e não deve ser servido nem empacotado no runtime.

---

## 4. Fase 0 — Preparação e proteção

### Tarefas

1. Criar branch:

```bash
git checkout -b refactor/devconcurseiro-vue-multiconcurso
```

2. Criar backup do banco atual:

```txt
data/backups/estudos-before-refactor-YYYYMMDD-HHMMSS.db
```

3. Criar `.env.example`:

```env
PORT=3000
DB_PATH=./data/estudos.db
PDF_ROOT=./public/pdfs
GEMINI_API_KEY=your_api_key_here
NODE_ENV=development
```

4. Atualizar `.gitignore`:

```gitignore
.env
*.db
*.db-shm
*.db-wal
data/backups/
node_modules/
frontend/node_modules/
frontend/dist/
.DS_Store
```

5. Ajustar `package.json` raiz para backend + frontend.

### Critério de aceite

- O app antigo ainda sobe.
- O banco atual não foi perdido.
- Existe backup antes de qualquer migration.
- `.env`, `.db` e backups não são servidos pelo Express.

---

## 5. Fase 1 — Refatoração segura do backend

### 5.1. Criar middleware de erro

Criar `server/middleware/asyncRoute.js`:

```js
function asyncRoute(handler) {
  return async function wrapped(req, res, next) {
    try {
      await handler(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = asyncRoute;
```

Criar `server/middleware/errorHandler.js`:

```js
function errorHandler(err, req, res, next) {
  console.error(err);

  const status = err.statusCode || err.status || 500;

  res.status(status).json({
    error: err.publicMessage || err.message || 'Erro interno do servidor'
  });
}

module.exports = errorHandler;
```

Aplicar em todas as rotas de escrita:

```txt
POST
PUT
PATCH
DELETE
```

### 5.2. Configuração SQLite

Criar `server/db/connection.js`:

```js
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/estudos.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

module.exports = db;
```

### 5.3. Corrigir `express.static`

Remover o comportamento atual de servir diretórios amplos.

Substituir por:

```js
app.use('/pdfjs', express.static(path.join(__dirname, '../public/pdfjs')));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
}
```

PDFs devem ser servidos por endpoint controlado:

```txt
GET /api/materials/:materialId/file
```

Esse endpoint resolve `materialId` no banco, valida o path e então faz `res.sendFile`.

### 5.4. Sanitização segura de paths

Criar `server/utils/safePath.js`:

```js
const path = require('path');

function resolveInsideRoot(rootDir, relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    const err = new Error('Caminho inválido');
    err.statusCode = 400;
    throw err;
  }

  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, relativePath);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    const err = new Error('Caminho fora do diretório permitido');
    err.statusCode = 400;
    throw err;
  }

  return resolved;
}

function assertPdfPath(filePath) {
  if (!filePath.toLowerCase().endsWith('.pdf')) {
    const err = new Error('Arquivo não permitido');
    err.statusCode = 400;
    throw err;
  }
}

module.exports = {
  resolveInsideRoot,
  assertPdfPath
};
```

Aplicar em:

```txt
GET /api/materials/:materialId/file
POST /api/reading-log
POST /api/exercises/generate
PUT /api/bookmarks/:key
```

Preferencialmente, bookmarks devem usar `materialId`, não path livre.

---

## 6. Fase 2 — Schema novo com migrations

### 6.1. Tabela de migrations

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
);
```

Criar `server/db/migrate.js` que:

```txt
1. Lê migrations em ordem.
2. Verifica quais versões já foram aplicadas.
3. Executa novas migrations dentro de transaction.
4. Registra em schema_migrations.
5. Faz backup antes da primeira migration estrutural.
```

### 6.2. Programas e concursos

```sql
CREATE TABLE IF NOT EXISTS learning_programs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('contest', 'course')),
    description TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contests (
    id TEXT PRIMARY KEY,
    program_id TEXT NOT NULL UNIQUE,
    institution TEXT,
    role TEXT,
    board TEXT,
    exam_style TEXT,
    metadata_json TEXT,
    FOREIGN KEY (program_id) REFERENCES learning_programs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exam_profiles (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL,
    board TEXT NOT NULL,
    question_format TEXT NOT NULL,
    alternatives_json TEXT,
    alternatives_count INTEGER,
    has_negative_marking INTEGER NOT NULL DEFAULT 0,
    scoring_json TEXT,
    prompt_template TEXT,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
);
```

### 6.3. Edital, disciplinas, tópicos e materiais

```sql
CREATE TABLE IF NOT EXISTS contest_sections (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_eliminatory INTEGER NOT NULL DEFAULT 0,
    is_classificatory INTEGER NOT NULL DEFAULT 1,
    min_score REAL,
    weight REAL DEFAULT 1,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS disciplines (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL,
    section_id TEXT,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES contest_sections(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS topics (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL,
    discipline_id TEXT,
    parent_topic_id TEXT,
    title TEXT NOT NULL,
    detail TEXT,
    priority TEXT,
    tag TEXT,
    tag_class TEXT,
    weight REAL DEFAULT 1,
    sort_order INTEGER NOT NULL,
    metadata_json TEXT,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
    FOREIGN KEY (discipline_id) REFERENCES disciplines(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_topic_id) REFERENCES topics(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS study_weeks (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL,
    phase_id TEXT,
    week_number TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS study_week_topics (
    week_id TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    PRIMARY KEY (week_id, topic_id),
    FOREIGN KEY (week_id) REFERENCES study_weeks(id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    program_id TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('pdf', 'video', 'link', 'book', 'question_list', 'other')),
    path TEXT,
    url TEXT,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (program_id) REFERENCES learning_programs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS topic_materials (
    topic_id TEXT NOT NULL,
    material_id TEXT NOT NULL,
    start_page INTEGER,
    end_page INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (topic_id, material_id, sort_order),
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);
```

### 6.4. Progresso, notas e sessões

```sql
CREATE TABLE IF NOT EXISTS topic_progress (
    program_id TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'studying', 'done', 'review')),
    completed_at INTEGER,
    confidence INTEGER,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (program_id, topic_id),
    FOREIGN KEY (program_id) REFERENCES learning_programs(id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK(target_type IN ('topic', 'material', 'page', 'video', 'exercise', 'program')),
    target_id TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (program_id) REFERENCES learning_programs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS study_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id TEXT,
    discipline_id TEXT,
    topic_id TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    type TEXT NOT NULL CHECK(type IN ('focus', 'short_break', 'long_break', 'manual', 'video', 'pdf')),
    duration INTEGER NOT NULL,
    source TEXT,
    metadata_json TEXT,
    FOREIGN KEY (program_id) REFERENCES learning_programs(id) ON DELETE SET NULL,
    FOREIGN KEY (discipline_id) REFERENCES disciplines(id) ON DELETE SET NULL,
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER
);
```

### 6.5. PDFs, bookmarks e leitura

```sql
CREATE TABLE IF NOT EXISTS material_bookmarks (
    program_id TEXT NOT NULL,
    material_id TEXT NOT NULL,
    topic_id TEXT,
    current_page INTEGER NOT NULL DEFAULT 1,
    total_pages INTEGER NOT NULL DEFAULT 1,
    last_read_at INTEGER NOT NULL,
    PRIMARY KEY (program_id, material_id, topic_id),
    FOREIGN KEY (program_id) REFERENCES learning_programs(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS material_reading_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id TEXT NOT NULL,
    material_id TEXT NOT NULL,
    topic_id TEXT,
    page_number INTEGER NOT NULL,
    date_str TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    UNIQUE(program_id, material_id, topic_id, page_number, date_str),
    FOREIGN KEY (program_id) REFERENCES learning_programs(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pdf_page_text_cache (
    material_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    text TEXT NOT NULL,
    extracted_at INTEGER NOT NULL,
    PRIMARY KEY (material_id, page_number),
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);
```

### 6.6. Exercícios

Substituir a limitação atual de `date_str PRIMARY KEY`, permitindo múltiplos simulados por dia.

```sql
CREATE TABLE IF NOT EXISTS exercise_sessions (
    id TEXT PRIMARY KEY,
    program_id TEXT NOT NULL,
    date_str TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('pdf_reading', 'manual_topic', 'revision', 'mock_exam')),
    questions_json TEXT NOT NULL,
    answers_json TEXT,
    score INTEGER,
    total_questions INTEGER,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    metadata_json TEXT,
    FOREIGN KEY (program_id) REFERENCES learning_programs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exercise_sources (
    exercise_session_id TEXT NOT NULL,
    material_id TEXT,
    topic_id TEXT,
    page_number INTEGER,
    FOREIGN KEY (exercise_session_id) REFERENCES exercise_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL,
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
);
```

### 6.7. Vídeos / pós-graduação

```sql
CREATE TABLE IF NOT EXISTS video_modules (
    id TEXT PRIMARY KEY,
    program_id TEXT NOT NULL,
    module_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY (program_id) REFERENCES learning_programs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS video_subjects (
    id TEXT PRIMARY KEY,
    module_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY (module_id) REFERENCES video_modules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    video_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    duration_seconds INTEGER,
    url TEXT,
    metadata_json TEXT,
    FOREIGN KEY (subject_id) REFERENCES video_subjects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS video_progress (
    video_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'watching', 'done')),
    last_position_seconds INTEGER DEFAULT 0,
    completed_at INTEGER,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);
```

Criar programas iniciais vazios/configuráveis:

```txt
fullstack-pos
cloud-computing-pos
ia-gestao-pos
```

---

## 7. Fase 3 — Migrar Petrobras para dados configuráveis

### 7.1. Criar `contest.json`

```json
{
  "id": "petrobras-eng-software-2026",
  "programId": "petrobras-eng-software-2026",
  "name": "Petrobras — Engenharia de Software",
  "institution": "Petrobras",
  "role": "Profissional Petrobras NS Júnior",
  "emphasis": "Ênfase 4",
  "board": "Cesgranrio",
  "examStyle": "multiple_choice_a_e",
  "ui": {
    "icon": "🛢️",
    "title": "Plano Petrobras",
    "subtitle": "Ênfase 4 — Engenharia de Software | Cesgranrio"
  },
  "examProfile": {
    "format": "multiple_choice",
    "alternatives": ["A", "B", "C", "D", "E"],
    "negativeMarking": false,
    "questionCountDefault": 10
  }
}
```

### 7.2. Criar `plan.json`

Migrar o array `studyPlan` do HTML para:

```txt
data/contests/petrobras-eng-software-2026/plan.json
```

Formato sugerido:

```json
{
  "phases": [
    {
      "id": "fase-1",
      "title": "FASE 1 — FUNDAÇÃO",
      "class": "fase1",
      "subtitle": "Semanas 1-4 · Temas de Alta Prioridade",
      "weeks": [
        {
          "id": "semana-1",
          "number": "1",
          "title": "Engenharia de Software",
          "topics": [
            {
              "id": "s1_1",
              "title": "Modelos de Ciclo de Vida (Cascata, Espiral, Iterativo, Incremental)",
              "tag": "Bloco I",
              "tagClass": "tag-red",
              "detail": "engenharia-de-software.pdf",
              "materials": [
                {
                  "materialId": "engenharia-de-software",
                  "startPage": 1,
                  "endPage": 28
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### 7.3. Criar `materials.json`

Migrar `PDF_FILE_MAP` do HTML para:

```txt
data/contests/petrobras-eng-software-2026/materials.json
```

Formato sugerido:

```json
[
  {
    "id": "engenharia-de-software",
    "title": "Engenharia de Software",
    "type": "pdf",
    "path": "Engenharia de Software/2025-08-06-12-32-53-115352055-engenharia-de-software-e1754494373.pdf",
    "aliases": ["engenharia-de-software.pdf"]
  }
]
```

### 7.4. Criar loader idempotente

Criar `server/services/contestLoader.js`:

```txt
1. Lê contest.json.
2. Lê plan.json.
3. Lê materials.json.
4. Insere/atualiza learning_programs, contests, exam_profiles, topics, materials e topic_materials.
5. É idempotente.
6. Não apaga progresso do usuário.
```

Criar endpoint local/admin:

```txt
POST /api/admin/reload-contests
```

Ou executar automaticamente no boot em ambiente local.

---

## 8. Fase 4 — APIs novas

### 8.1. Programas e concursos

```txt
GET /api/programs
GET /api/programs/:programId
GET /api/contests
GET /api/contests/:contestId
GET /api/contests/:contestId/plan
GET /api/contests/:contestId/materials
GET /api/contests/:contestId/stats
```

### 8.2. Progresso

```txt
GET /api/programs/:programId/progress
PUT /api/programs/:programId/topics/:topicId/progress
DELETE /api/programs/:programId/topics/:topicId/progress
```

Payload:

```json
{
  "status": "done",
  "completedAt": 1760000000000,
  "confidence": 4
}
```

### 8.3. Notas

```txt
GET /api/programs/:programId/notes
PUT /api/programs/:programId/notes
DELETE /api/programs/:programId/notes/:noteId
```

Payload:

```json
{
  "targetType": "topic",
  "targetId": "s1_1",
  "note": "Resumo..."
}
```

### 8.4. Pomodoro / sessões

```txt
GET /api/programs/:programId/sessions
POST /api/programs/:programId/sessions
DELETE /api/sessions/:sessionId
```

Payload:

```json
{
  "startedAt": 1760000000000,
  "endedAt": 1760001500000,
  "type": "focus",
  "duration": 25,
  "topicId": "s1_1",
  "source": "pomodoro"
}
```

### 8.5. Config

```txt
GET /api/config
PUT /api/config/:key
```

Chaves previstas:

```txt
activeProgramId
pomodoroConfig
pomodoroState
soundConfig
pdfPanelWidth
theme
```

### 8.6. Materiais e PDF

```txt
GET /api/programs/:programId/materials
GET /api/materials/:materialId/file
GET /api/programs/:programId/bookmarks
PUT /api/programs/:programId/bookmarks
POST /api/programs/:programId/reading-log
GET /api/programs/:programId/reading-log/:dateStr
```

Bookmark payload:

```json
{
  "materialId": "engenharia-de-software",
  "topicId": "s1_1",
  "currentPage": 10,
  "totalPages": 120
}
```

Reading log payload:

```json
{
  "materialId": "engenharia-de-software",
  "topicId": "s1_1",
  "pageNumber": 10,
  "dateStr": "2026-06-23"
}
```

### 8.7. Exercícios

```txt
GET /api/programs/:programId/exercises/today?dateStr=YYYY-MM-DD
GET /api/programs/:programId/exercises/history
POST /api/programs/:programId/exercises/generate
POST /api/programs/:programId/exercises/:sessionId/save
```

Generate payload:

```json
{
  "dateStr": "2026-06-23",
  "sourceType": "pdf_reading"
}
```

### 8.8. Backup

```txt
GET /api/backup/export
POST /api/backup/import
```

Export deve incluir:

```txt
learning_programs
contests
exam_profiles
contest_sections
disciplines
topics
study_weeks
study_week_topics
materials
topic_materials
topic_progress
notes
study_sessions
app_config
material_bookmarks
material_reading_log
exercise_sessions
exercise_sources
video_modules
video_subjects
videos
video_progress
exportDate
schemaVersion
appVersion
```

---

## 9. Fase 5 — IA e simulados

### 9.1. Novo fluxo

O endpoint de exercícios não deve receber `pdfFileMap` nem path de arquivo.

Fluxo correto:

```txt
1. Buscar páginas lidas em material_reading_log.
2. Agrupar por materialId.
3. Resolver cada materialId no banco.
4. Validar path dentro de PDF_ROOT.
5. Extrair texto.
6. Gerar questões com prompt baseado em exam_profile.
7. Salvar exercise_session.
8. Salvar exercise_sources.
```

### 9.2. Prompt por banca

Criar `server/services/exerciseGenerator.js`.

Para Cesgranrio:

```txt
- múltipla escolha
- 5 alternativas
- A-E
- sem pontuação negativa
- comentários objetivos
- JSON válido
```

O prompt não deve ficar hardcoded apenas no endpoint. Deve ser gerado com base em `exam_profiles`.

### 9.3. Cache de texto por página

Criar `server/services/pdfTextExtractor.js` com interface:

```js
async function getTextForMaterialPages(materialId, pages) {
  // 1. Verifica cache.
  // 2. Extrai páginas ausentes.
  // 3. Salva cache.
  // 4. Retorna texto por página.
}
```

Se a extração real por página com `pdf-parse` não for confiável, manter fallback documentado e preparar substituição posterior por `pdfjs-dist`.

### Critérios de aceite

- O frontend não envia paths de PDF para gerar simulados.
- Cada simulado salvo possui fontes: `materialId`, `topicId`, `pageNumber`.
- É possível gerar mais de um simulado no mesmo dia.
- Histórico de simulados continua funcionando.

---

## 10. Fase 6 — Frontend Vue 3 + PrimeVue

### 10.1. Criar projeto

Dentro de `/frontend`:

```bash
npm create vite@latest frontend -- --template vue-ts
```

Instalar:

```bash
npm install primevue @primeuix/themes primeicons pinia vue-router
```

Configurar `main.ts`:

```ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';

import App from './App.vue';
import router from './router';

import './assets/theme.css';
import 'primeicons/primeicons.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(PrimeVue);
app.use(ToastService);
app.use(ConfirmationService);

app.mount('#app');
```

### 10.2. Proxy Vite

Configurar `frontend/vite.config.ts`:

```ts
server: {
  proxy: {
    '/api': 'http://localhost:3000',
    '/pdfjs': 'http://localhost:3000'
  }
}
```

### 10.3. Rotas

Criar Vue Router:

```txt
/
  redireciona para programa ativo

/programs/:programId/dashboard
/programs/:programId/plan
/programs/:programId/history
/programs/:programId/strategy
/programs/:programId/exercises
/programs/:programId/videos
/settings
```

### 10.4. Stores Pinia

Criar:

```txt
stores/programStore.ts
stores/contestStore.ts
stores/studyPlanStore.ts
stores/progressStore.ts
stores/notesStore.ts
stores/pomodoroStore.ts
stores/pdfStore.ts
stores/exerciseStore.ts
stores/configStore.ts
stores/videoStore.ts
```

---

## 11. Fase 7 — Componentização do frontend

### 11.1. Layout

```txt
components/layout/AppHeader.vue
components/layout/AppShell.vue
components/layout/AppSidebar.vue
components/layout/MainNav.vue
components/layout/ProgramSelector.vue
```

O cabeçalho deve ser dinâmico, vindo de `contest.json`:

```txt
Plano Petrobras
Ênfase 4 — Engenharia de Software | Cesgranrio
```

### 11.2. Plano de estudos

```txt
views/StudyPlanView.vue
components/study-plan/TopicFilters.vue
components/study-plan/PhaseSection.vue
components/study-plan/WeekCard.vue
components/study-plan/TopicItem.vue
components/study-plan/TopicNoteEditor.vue
components/study-plan/TopicMaterialLinks.vue
components/study-plan/PdfProgressBadge.vue
```

Remover renderização manual por `innerHTML`.

### 11.3. Pomodoro

```txt
components/pomodoro/PomodoroTimer.vue
components/pomodoro/PomodoroConfig.vue
components/pomodoro/AlarmOverlay.vue
```

Regras:

```txt
- manter presets: clássico, curto, longo, personalizado;
- manter som via Web Audio API;
- manter notificações desktop;
- salvar sessões no backend;
- escopar sessão por programId ativo.
```

### 11.4. PDF

```txt
components/pdf/PdfReaderPanel.vue
components/pdf/PdfBookmarkBar.vue
components/pdf/PdfToolbar.vue
```

Regras:

```txt
- manter painel lateral redimensionável;
- usar PrimeVue Splitter/Drawer se adequado;
- manter pdf.js;
- abrir por materialId;
- salvar bookmark com materialId + topicId;
- registrar página após 15 segundos.
```

### 11.5. Exercícios

```txt
views/ExercisesView.vue
components/exercises/ExerciseGenerator.vue
components/exercises/QuizQuestion.vue
components/exercises/QuizResult.vue
components/exercises/ExerciseHistoryTable.vue
components/exercises/ExerciseStats.vue
```

Usar PrimeVue para:

```txt
Toast
ConfirmDialog
DataTable
Button
ProgressBar
Tag
Card
```

### 11.6. Dashboard e histórico

```txt
views/DashboardView.vue
views/HistoryView.vue
components/dashboard/ProgressOverview.vue
components/dashboard/StreakCard.vue
components/dashboard/StudySessionTable.vue
components/dashboard/PhaseProgressGrid.vue
components/backup/BackupImportExport.vue
```

### 11.7. Pós-graduação / vídeos

```txt
views/VideosView.vue
components/videos/VideoModuleCard.vue
components/videos/VideoSubjectSection.vue
components/videos/VideoItem.vue
components/videos/VideoProgressBar.vue
```

Regras:

```txt
- listar módulos;
- listar disciplinas;
- listar aulas;
- marcar aula como concluída;
- salvar posição da aula se houver URL/player;
- exibir progresso por programa.
```

---

## 12. Fase 8 — UI PrimeVue preservando tema atual

Usar PrimeVue como base funcional, não como imposição visual.

Componentes recomendados:

```txt
Card
Button
Tabs
DataTable
Dialog
ConfirmDialog
Toast
Select
MultiSelect
InputText
Textarea
InputNumber
Slider
ToggleSwitch
ProgressBar
Tag
Drawer
Splitter
```

Migrar variáveis CSS atuais para:

```txt
frontend/src/assets/theme.css
```

Preservar tokens visuais:

```txt
--bg-primary
--bg-secondary
--bg-card
--bg-card-hover
--text-primary
--text-secondary
--text-muted
--accent-blue
--accent-green
--accent-red
--accent-purple
--accent-yellow
--accent-orange
--radius
--radius-sm
--shadow-lg
```

---

## 13. Fase 9 — Compatibilidade com dados legados

Criar `server/services/legacyMigrationService.js`.

### Mapeamentos

```txt
completed_topics.topic_id
-> topic_progress(program_id='petrobras-eng-software-2026', topic_id, status='done')

study_notes.topic_id
-> notes(program_id, target_type='topic', target_id=topic_id)

study_log
-> study_sessions(program_id='petrobras-eng-software-2026', type='focus'/'short_break', duration)

pdf_bookmarks.pdf_key
-> material_bookmarks usando alias/path em materials.json

pdf_reading_log.pdf_key
-> material_reading_log usando alias/path em materials.json

exercises_session.date_str
-> exercise_sessions com id gerado
```

### Regras

1. Migração deve ser idempotente.
2. Não duplicar dados se executar duas vezes.
3. Criar relatório no console:

```txt
Migrados:
- X tópicos concluídos
- X notas
- X sessões de estudo
- X bookmarks
- X páginas lidas
- X simulados
```

---

## 14. Fase 10 — Testes mínimos

### Backend

Criar script:

```txt
npm run check:server
```

Validar:

```txt
- migrations executam sem erro;
- DB abre;
- contests carregam;
- plano Petrobras carrega;
- materiais Petrobras carregam;
- rotas principais respondem;
- endpoints de escrita rejeitam payload inválido;
- safePath bloqueia path traversal.
```

### Frontend

Criar script:

```txt
npm run build
```

Aceite:

```txt
- TypeScript compila;
- Vite builda;
- não há erro de import.
```

### Testes manuais obrigatórios

1. Abrir app.
2. Selecionar Petrobras.
3. Ver plano de estudos.
4. Marcar tópico como concluído.
5. Criar nota.
6. Abrir PDF.
7. Salvar bookmark.
8. Registrar leitura após 15 segundos.
9. Gerar simulado.
10. Responder simulado.
11. Ver histórico.
12. Exportar backup.
13. Importar backup.
14. Criar programa de pós-graduação.
15. Marcar vídeo como concluído.

---

## 15. Fase 11 — Scripts finais

No `package.json` raiz:

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:frontend\"",
    "dev:server": "node server/index.js",
    "dev:frontend": "npm --prefix frontend run dev",
    "build": "npm --prefix frontend run build",
    "start": "NODE_ENV=production node server/index.js",
    "migrate": "node server/db/migrate.js",
    "load:contests": "node server/scripts/loadContests.js",
    "check": "npm run migrate && npm run build"
  }
}
```

Se não usar `concurrently`, documentar dois terminais:

```bash
npm run dev:server
npm run dev:frontend
```

---

## 16. Ordem de execução recomendada

```txt
1. Backup + estrutura de pastas.
2. Extrair backend para /server sem mudar comportamento.
3. Corrigir express.static e path safety.
4. Criar migrations.
5. Criar novo schema.
6. Migrar Petrobras para contest.json, plan.json e materials.json.
7. Criar APIs novas.
8. Criar loader Petrobras.
9. Criar projeto Vue.
10. Implementar shell/layout.
11. Implementar ProgramSelector.
12. Implementar StudyPlanView.
13. Implementar progresso e notas.
14. Implementar Pomodoro.
15. Implementar histórico/dashboard.
16. Implementar PDF viewer.
17. Implementar reading log.
18. Implementar exercícios IA.
19. Implementar backup/import completo.
20. Implementar vídeos/pós-graduação.
21. Testar fluxo completo.
22. Remover dependências mortas do HTML antigo.
23. Atualizar README.
```

---

## 17. Critérios finais de aceite

```txt
[ ] O app sobe com npm run dev.
[ ] O app builda com npm run build.
[ ] O backend sobe com npm start.
[ ] O banco antigo é migrado sem perda de dados.
[ ] Petrobras aparece como concurso configurável.
[ ] Nenhum plano de concurso está hardcoded em componente Vue.
[ ] Nenhum path de PDF é enviado pelo frontend como fonte de verdade.
[ ] O frontend envia materialId.
[ ] O backend resolve materialId para path seguro.
[ ] Não há express.static expondo diretório raiz, .env ou banco.
[ ] Tópicos concluídos são escopados por programId.
[ ] Notas são escopadas por programId e target.
[ ] Pomodoros são salvos como study_sessions.
[ ] Bookmarks funcionam por material.
[ ] Leitura diária de PDF funciona.
[ ] Simulado por IA funciona usando exam_profile.
[ ] Histórico de simulados permite múltiplas sessões por dia.
[ ] Backup exporta leitura e exercícios.
[ ] Import restaura leitura e exercícios.
[ ] Pós-graduação aparece como programa do tipo course.
[ ] Vídeos podem ser marcados como concluídos.
[ ] UI usa Vue + PrimeVue + Pinia + Vue Router.
[ ] O visual escuro atual foi preservado.
```

---

## 18. Primeiro commit esperado

```txt
chore: prepare project structure and protect local data
```

Conteúdo:

```txt
- criar /server, /frontend, /data, /tools;
- mover extract.js para /tools;
- criar .env.example;
- atualizar .gitignore;
- criar rotina de backup do estudos.db;
- manter app antigo funcionando.
```

Não misturar esse commit com migração Vue, schema novo ou IA.
