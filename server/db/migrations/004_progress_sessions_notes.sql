-- Migration 004: Topic Progress, Notes, Study Sessions, Bookmarks & Reading Log

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

-- Upgrade app_config table to track last update timestamp
ALTER TABLE app_config ADD COLUMN updated_at INTEGER;
