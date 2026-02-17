-- Add per-result CTA URL to quiz_results
ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS cta_url TEXT;
