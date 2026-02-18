-- Add ui_locale to business_profiles
-- Controls the app interface language (separate from content_locale which drives AI output).
-- Supported values: fr, en, es, it, ar  (validated in application layer)
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS ui_locale TEXT DEFAULT 'fr';
