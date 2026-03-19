-- Ensure the 'locale' column exists on hosted_pages.
-- The column was present in the initial migration (20260301_hosted_pages.sql),
-- but may be missing if the table was created manually before the migration ran.
-- Idempotent: safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hosted_pages'
      AND column_name = 'locale'
  ) THEN
    ALTER TABLE public.hosted_pages
      ADD COLUMN locale TEXT NOT NULL DEFAULT 'fr';
  END IF;
END
$$;

-- Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
