-- Add answers JSONB column to quiz_leads to store per-question responses
-- Format: array of { question_index: number, option_index: number }
-- This allows exporting exactly what each lead answered for each question.

ALTER TABLE quiz_leads ADD COLUMN IF NOT EXISTS answers jsonb;
