-- Migration 001: Initial Legacy Schema

CREATE TABLE IF NOT EXISTS completed_topics (
    topic_id TEXT PRIMARY KEY,
    completed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS study_notes (
    topic_id TEXT PRIMARY KEY,
    note TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS study_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    type TEXT NOT NULL,
    duration INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pdf_bookmarks (
    pdf_key TEXT PRIMARY KEY,
    current_page INTEGER NOT NULL DEFAULT 1,
    total_pages INTEGER NOT NULL DEFAULT 1,
    last_read_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pdf_reading_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pdf_key TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    date_str TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    UNIQUE(pdf_key, page_number, date_str)
);

CREATE TABLE IF NOT EXISTS exercises_session (
    date_str TEXT PRIMARY KEY,
    questions_json TEXT NOT NULL,
    answers_json TEXT,
    score INTEGER,
    created_at INTEGER NOT NULL
);
