-- Migration 006: Video Modules, Subjects & Progress Schema

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
