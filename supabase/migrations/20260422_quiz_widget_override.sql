-- ═══════════════════════════════════════════════════════════════════════════
-- TIPOTE — Per-quiz widget override
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Lets a creator pick a specific toast_widget / social_share_widget for a
-- given quiz, overriding the default "first enabled widget of the user"
-- behavior used when these columns are NULL.
--
-- ── Guarantees ──
-- * Fully additive: ADD COLUMN IF NOT EXISTS, both NULLable.
-- * Legacy quizzes: both columns NULL → public GET falls back to the
--   existing first-enabled logic. No behavior change for pre-existing data.
-- * ON DELETE SET NULL: deleting a widget nullifies the reference on any
--   quiz that still pointed to it, which transparently reverts that quiz
--   to the fallback path. No cascade-breakage.
-- * No RLS/trigger changes — these columns piggyback on the quizzes table's
--   existing owner_id RLS policies.
--
-- Re-runnable.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS toast_widget_id uuid
    REFERENCES public.toast_widgets(id) ON DELETE SET NULL;

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS share_widget_id uuid
    REFERENCES public.social_share_widgets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quizzes_toast_widget_id_idx
  ON public.quizzes (toast_widget_id)
  WHERE toast_widget_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS quizzes_share_widget_id_idx
  ON public.quizzes (share_widget_id)
  WHERE share_widget_id IS NOT NULL;
