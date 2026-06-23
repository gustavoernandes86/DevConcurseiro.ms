-- Migration 002: Learning Programs & Contests Schema

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
