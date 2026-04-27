-- Add address_form to quizzes (per-quiz tu/vous override)
--
-- Why: app/api/quiz/route.ts (commit 3661471 "claude uprgade quiz gender 1")
-- writes `quizzes.address_form` on every create/update, but the column was
-- never added to public.quizzes — only to public.business_profiles via
-- 20260226_add_address_form.sql. Without this column, every quiz insert
-- fails with a Postgres "column does not exist" error → POST /api/quiz
-- returns 400 → AI generation appears to "spin in the void".
--
-- NULL means: fall back to the user's profile address_form (existing
-- public-page logic in app/api/quiz/[quizId]/public/route.ts already
-- handles this fallback).

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS address_form TEXT DEFAULT NULL
    CHECK (address_form IS NULL OR address_form IN ('tu', 'vous'));

COMMENT ON COLUMN public.quizzes.address_form IS
  'Per-quiz formality override: ''tu'' (informal) or ''vous'' (formal). NULL = use profile default.';
