-- Migration 005: Exercises & Question Sources Schema

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
