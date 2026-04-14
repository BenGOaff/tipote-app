-- Upgrade thank-you page: support multiple CTAs + subtitle
-- Backward-compatible: existing thank_you_cta_text / thank_you_cta_url columns remain,
-- but the new thank_you_ctas JSONB array takes precedence when populated.
-- Format: [{"text": "...", "url": "...", "style": "primary|outline|secondary"}]

ALTER TABLE public.hosted_pages
  ADD COLUMN IF NOT EXISTS thank_you_subtitle TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS thank_you_ctas JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS thank_you_show_email_hint BOOLEAN NOT NULL DEFAULT true;

-- Migrate existing single CTA into the new array (non-destructive)
UPDATE public.hosted_pages
SET thank_you_ctas = jsonb_build_array(
  jsonb_build_object(
    'text', COALESCE(thank_you_cta_text, ''),
    'url', COALESCE(thank_you_cta_url, ''),
    'style', 'primary'
  )
)
WHERE thank_you_cta_url IS NOT NULL
  AND thank_you_cta_url != ''
  AND (thank_you_ctas IS NULL OR thank_you_ctas = '[]'::jsonb);
