-- hosted_pages: add layout_config for responsive photo/form positioning
-- Versioned JSON so future presets/fields are additive without migrations.
-- Shape: { "version": 1, "mobile": { "preset": "photo-top", ... }, "desktop": { "preset": "split-form-left", ... } }
-- Empty object ({}) means "legacy" (existing hardcoded behavior preserved).

ALTER TABLE public.hosted_pages
  ADD COLUMN IF NOT EXISTS layout_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.hosted_pages.layout_config IS
  'Responsive layout for capture hero (photo vs form positioning). Versioned JSON. Empty = legacy.';
