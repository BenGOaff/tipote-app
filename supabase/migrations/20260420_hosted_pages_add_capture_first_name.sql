-- Backfill capture_first_name on hosted_pages.
--
-- The column was declared in 20260301_hosted_pages.sql's CREATE TABLE, but that
-- statement is `CREATE TABLE IF NOT EXISTS` — so when the column was added to
-- the base file after the initial deploy, prod databases that had already run
-- 20260301 never picked it up. Any SELECT that named `capture_first_name` then
-- failed with "column does not exist", which in app/api/pages/public/[slug]/route.ts
-- triggered a fallback to a minimal SELECT that drops thank_you_title,
-- thank_you_message, brand_tokens, etc. — making every user's customized
-- thank-you page render the hardcoded i18n defaults.

ALTER TABLE public.hosted_pages
  ADD COLUMN IF NOT EXISTS capture_first_name BOOLEAN NOT NULL DEFAULT false;
