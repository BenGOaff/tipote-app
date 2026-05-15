-- ═══════════════════════════════════════════
-- TIPOTE — Optional "show full results breakdown" on quizzes
-- ═══════════════════════════════════════════
-- Gwenn's feedback (2026-05-14): some creators want to show the
-- respondent every profile score (not just the winning one) so they
-- can see their secondary traits. Opt-in per-quiz; default false so
-- existing quizzes keep their tighter single-profile result page.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS show_results_breakdown BOOLEAN NOT NULL DEFAULT false;
