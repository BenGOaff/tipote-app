-- Quiz funnel counters: track where visitors drop off (intro → start → complete → email)
-- These are lightweight atomic counters on the quizzes table, incremented by a
-- fire-and-forget POST /api/quiz/[quizId]/track endpoint.

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS starts_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completions_count INTEGER NOT NULL DEFAULT 0;

-- Index not needed: these columns are only written, never filtered/searched.
