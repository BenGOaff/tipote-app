-- Add share_url column to social_share_widgets
-- Allows users to specify a custom URL to share (e.g. quiz page, capture page)
-- instead of defaulting to the current page URL (which may be a thank-you page).

ALTER TABLE social_share_widgets
  ADD COLUMN IF NOT EXISTS share_url TEXT;
