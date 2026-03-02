-- Add thank-you page customization columns to hosted_pages
-- Allows users to configure a custom title, message, and CTA button
-- on the post-capture confirmation screen.

ALTER TABLE public.hosted_pages
  ADD COLUMN IF NOT EXISTS thank_you_title TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS thank_you_message TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS thank_you_cta_text TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS thank_you_cta_url TEXT DEFAULT '';
