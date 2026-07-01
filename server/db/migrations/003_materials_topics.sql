-- Migration 003: Contest Sections, Disciplines, Topics & Materials Schema

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
