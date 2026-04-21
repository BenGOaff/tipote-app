-- ═══════════════════════════════════════════════════════════════════════════
-- TIPOTE — Quiz parity with Tiquiz
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds every column needed to port the Tiquiz WYSIWYG editor, public page
-- and analytics rapport onto Tipote's existing quiz tables.
--
-- ── Guarantees ──
-- * Fully additive: no DROP, no RENAME, no NOT NULL without DEFAULT.
-- * Safe on every existing quiz: all new columns are NULL-able with
--   NULL meaning "fallback to business_profiles or translated default".
-- * Does not touch RLS, triggers, counters or any JSONB format already in use.
-- * Public URLs (/q/{quizId}) keep working: slug is optional and nullable.
-- * Systeme.io integrations are untouched (sio_* columns stay as-is, we only
--   add sio_capture_tag which currently lives on hosted_pages only).
--
-- Re-runnable: every ALTER uses IF NOT EXISTS.

-- ── quizzes: branding per-quiz, share surface, editable headings ──

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS start_button_text TEXT,
  ADD COLUMN IF NOT EXISTS bonus_image_url TEXT,
  ADD COLUMN IF NOT EXISTS og_description TEXT,
  ADD COLUMN IF NOT EXISTS share_networks JSONB,
  ADD COLUMN IF NOT EXISTS custom_footer_text TEXT,
  ADD COLUMN IF NOT EXISTS custom_footer_url TEXT,
  ADD COLUMN IF NOT EXISTS result_insight_heading TEXT,
  ADD COLUMN IF NOT EXISTS result_projection_heading TEXT,
  ADD COLUMN IF NOT EXISTS sio_capture_tag TEXT,
  ADD COLUMN IF NOT EXISTS brand_font TEXT,
  ADD COLUMN IF NOT EXISTS brand_color_primary TEXT,
  ADD COLUMN IF NOT EXISTS brand_color_background TEXT;

COMMENT ON COLUMN public.quizzes.slug IS 'Optional custom URL. NULL = reachable only by UUID. Case-insensitive unique.';
COMMENT ON COLUMN public.quizzes.start_button_text IS 'Custom intro CTA. NULL = translated default for quiz.locale.';
COMMENT ON COLUMN public.quizzes.bonus_image_url IS 'Image displayed on the share-to-unlock step. Uploaded to public-assets bucket.';
COMMENT ON COLUMN public.quizzes.og_description IS 'Social share description. Falls back to stripped introduction.';
COMMENT ON COLUMN public.quizzes.share_networks IS 'Array of enabled network keys for the result share surface.';
COMMENT ON COLUMN public.quizzes.custom_footer_text IS 'Branded footer label (paid plans).';
COMMENT ON COLUMN public.quizzes.custom_footer_url IS 'Branded footer link (paid plans).';
COMMENT ON COLUMN public.quizzes.result_insight_heading IS 'Override label above the result insight block. NULL = translated default.';
COMMENT ON COLUMN public.quizzes.result_projection_heading IS 'Override label above the result projection block. NULL = translated default.';
COMMENT ON COLUMN public.quizzes.sio_capture_tag IS 'Systeme.io tag applied to every captured lead (separate from per-result tags).';
COMMENT ON COLUMN public.quizzes.brand_font IS 'Google font for this quiz. NULL = business_profiles.brand_font fallback.';
COMMENT ON COLUMN public.quizzes.brand_color_primary IS 'Primary/CTA color for this quiz. NULL = business_profiles.brand_color_base fallback.';
COMMENT ON COLUMN public.quizzes.brand_color_background IS 'Page background color for this quiz. NULL = default neutral.';

-- Case-insensitive unique slug (only when set).
CREATE UNIQUE INDEX IF NOT EXISTS quizzes_slug_lower_idx
  ON public.quizzes (LOWER(slug))
  WHERE slug IS NOT NULL;

-- Fast lookup on slug for public page resolution.
CREATE INDEX IF NOT EXISTS quizzes_slug_idx
  ON public.quizzes (slug)
  WHERE slug IS NOT NULL;

-- ── quiz_leads: denormalized result title + sio sync tracking ──

ALTER TABLE public.quiz_leads
  ADD COLUMN IF NOT EXISTS result_title TEXT,
  ADD COLUMN IF NOT EXISTS sio_synced BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sio_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sio_tag_applied BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sio_last_error TEXT,
  ADD COLUMN IF NOT EXISTS sio_last_attempt_at TIMESTAMPTZ;

COMMENT ON COLUMN public.quiz_leads.result_title IS 'Snapshot of result title at capture time (survives result rename/delete).';
COMMENT ON COLUMN public.quiz_leads.sio_synced IS 'True once the contact has been upserted in Systeme.io.';
COMMENT ON COLUMN public.quiz_leads.sio_tag_applied IS 'True once the result tag has been applied (separate from contact upsert).';
