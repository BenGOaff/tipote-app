-- ═══════════════════════════════════════════
-- TIPOTE — Survey mode (sondages)
-- ═══════════════════════════════════════════
-- Adds the "survey" mode alongside "quiz" so the same engine drives
-- both products. Surveys reuse quizzes / quiz_questions / quiz_leads
-- and skip quiz_results entirely — survey analytics aggregate raw
-- answers instead. Mirrors Tiquiz migration 019_survey_mode.sql so
-- the two apps share the same on-disk shape.

-- 1. quizzes.mode — 'quiz' (default) or 'survey'
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'quiz'
    CHECK (mode IN ('quiz', 'survey'));

CREATE INDEX IF NOT EXISTS idx_quizzes_mode ON public.quizzes(mode);

-- 2. quiz_questions.question_type — defaults to multiple_choice so all
--    existing rows keep working unchanged.
ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'multiple_choice'
    CHECK (question_type IN (
      'multiple_choice',
      'rating_scale',
      'star_rating',
      'free_text',
      'image_choice',
      'yes_no'
    ));

-- 3. quiz_questions.config — flexible per-type config
--    (e.g. rating scale min/max/labels, free_text maxLength,
--    image_choice image URLs). Kept as JSONB for forward-compat.
ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;
