-- Migration 010: Topic Flashcards (Anki cards)

CREATE TABLE IF NOT EXISTS topic_flashcards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id TEXT NOT NULL,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);
