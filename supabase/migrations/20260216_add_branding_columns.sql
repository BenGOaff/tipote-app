-- Add branding columns to business_profiles
-- These store brand identity for reuse in funnels, templates, and AI-generated content.

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS brand_font        TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_color_base   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_color_accent TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_logo_url     TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_author_photo_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_tone_of_voice TEXT DEFAULT NULL;
