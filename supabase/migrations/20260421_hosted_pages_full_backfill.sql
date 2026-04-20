-- Defensive full-backfill for hosted_pages and page_leads.
--
-- WHY THIS EXISTS
-- ---------------
-- 20260301_hosted_pages.sql is `CREATE TABLE IF NOT EXISTS` for both tables.
-- That guard means ANY column added to the file *after* its initial deploy is
-- silently skipped on databases that already ran the original migration.
--
-- That mechanism produced the production bug where `capture_first_name` lived
-- in the CREATE TABLE block but had never been added in prod. SELECTs that
-- listed it failed with `column does not exist`, which collapsed the public
-- page route's cascade to a MINIMAL select that strips `thank_you_*` and
-- `brand_tokens` — making every customized thank-you page render the
-- hardcoded i18n defaults (Marie-Paule, Apr 2026).
--
-- This migration is a safety net: it idempotently `ADD COLUMN IF NOT EXISTS`
-- every column declared in the original CREATE TABLE so that any past, present
-- or future drift is silently corrected.
--
-- It is a no-op on databases that already match the schema. Safe to re-run.

-- ----- hosted_pages -----

ALTER TABLE public.hosted_pages
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS page_type TEXT NOT NULL DEFAULT 'capture',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS template_kind TEXT NOT NULL DEFAULT 'capture',
  ADD COLUMN IF NOT EXISTS template_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS brand_tokens JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS html_snapshot TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS custom_images JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS video_embed_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_button_text TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS meta_title TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS meta_description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS og_image_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS legal_mentions_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS legal_cgv_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS legal_privacy_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'fr',
  ADD COLUMN IF NOT EXISTS capture_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS capture_first_name BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS capture_heading TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS capture_subtitle TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS sio_capture_tag TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS thank_you_title TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS thank_you_message TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS thank_you_cta_text TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS thank_you_cta_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS views_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leads_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iteration_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Columns added by later migrations — re-asserted here so any prod DB that
-- skipped them (same drift mechanism) is healed.
ALTER TABLE public.hosted_pages
  ADD COLUMN IF NOT EXISTS thank_you_subtitle TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS thank_you_ctas JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS thank_you_show_email_hint BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS facebook_pixel_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS google_tag_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS layout_config JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS section_order JSONB DEFAULT '{}'::jsonb;

-- ----- page_leads -----

ALTER TABLE public.page_leads
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS first_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sio_synced BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sio_contact_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS utm_source TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS utm_medium TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS referrer TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
