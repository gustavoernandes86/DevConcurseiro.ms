-- Migration 008: Contest Status and Exam Date Fields
-- Adds status (pre_edital | pos_edital) and exam_date (Unix timestamp) to contests.
-- Both are nullable/defaulted so the Contest Loader (upsert idempotente) continues to work unchanged.

ALTER TABLE contests ADD COLUMN status TEXT NOT NULL DEFAULT 'pos_edital'
    CHECK(status IN ('pre_edital', 'pos_edital'));

ALTER TABLE contests ADD COLUMN exam_date INTEGER;
