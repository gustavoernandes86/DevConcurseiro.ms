-- Migration 009: Topic Summaries and Material Source

-- Resumos gerados por IA por tópico, combinando múltiplos materiais
CREATE TABLE IF NOT EXISTS topic_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id TEXT NOT NULL,
    content TEXT NOT NULL,
    source_material_ids TEXT NOT NULL, -- JSON array of material IDs
    generated_at INTEGER NOT NULL,
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

-- Coluna 'source' em materials (ex: "Gran Cursos", "Estratégia", "Edital")
-- Nullable para retrocompatibilidade com materiais existentes do Contest Loader
ALTER TABLE materials ADD COLUMN source TEXT;
