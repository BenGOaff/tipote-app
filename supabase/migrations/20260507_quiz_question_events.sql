-- Per-question funnel events for quiz analytics drop-off.
--
-- Until now we only counted starts / completions on the quizzes table —
-- enough to compute "57 leads on 200 visits" but blind to which
-- question is leaking visitors. This table tracks one row per visited
-- question so the analytics endpoint can compute Q1 → Q2 → ... funnel
-- step-down rates.
--
-- Anonymous: no user_id (the quiz is public, no auth). session_id is
-- a uuid generated client-side so we can group events from the same
-- visitor without linking back to identity. Cascade on quiz_id so a
-- deleted quiz cleans up its events automatically.
--
-- Volume: one row per question per visitor. For a 5-question quiz
-- with 1k completers / month, that's 5k rows / month / quiz. Indexed
-- on (quiz_id, question_index, created_at) to keep the analytics
-- aggregation under 50ms even at 100k rows.

CREATE TABLE IF NOT EXISTS quiz_question_events (
  id BIGSERIAL PRIMARY KEY,
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL CHECK (question_index >= 0 AND question_index < 200),
  session_id TEXT NOT NULL CHECK (char_length(session_id) BETWEEN 8 AND 64),
  event TEXT NOT NULL CHECK (event IN ('view', 'answer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aggregation index : the analytics endpoint counts views per
-- question over a time window.
CREATE INDEX IF NOT EXISTS idx_qqe_quiz_question_ts
  ON quiz_question_events (quiz_id, question_index, created_at);

-- Session lookup index : useful when computing per-session paths
-- (used by the v2 cohort analysis if we ever need it).
CREATE INDEX IF NOT EXISTS idx_qqe_quiz_session
  ON quiz_question_events (quiz_id, session_id);

-- RLS: this is a write-mostly public table. The /api/quiz/[id]/track
-- endpoint inserts via supabaseAdmin, the analytics endpoint reads
-- via supabaseAdmin too — no end-user direct access.
ALTER TABLE quiz_question_events ENABLE ROW LEVEL SECURITY;
