-- Enforce global uniqueness of hosted_pages.slug among published rows.
--
-- WHY THIS EXISTS
-- ---------------
-- 20260301 declared the slug index as `(user_id, slug)`. The public route
-- `/p/[slug]` resolves slugs globally and serves the most-recently-created
-- published row, so two users publishing the same slug means one silently
-- hijacks the other's URL — including the OG metadata. The application now
-- guards this at the API level (see lib/hostedPageSlug.ts) and a DB-level
-- partial unique index closes the loop in case the runtime check ever races.
--
-- This migration is conservative: if duplicate published slugs already exist
-- in this database it logs a NOTICE and skips index creation rather than
-- failing the migration. The runtime guard remains the active defense in
-- that case until the duplicates are manually resolved. Re-run after
-- cleanup to actually create the index.

DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT slug
    FROM public.hosted_pages
    WHERE status = 'published'
    GROUP BY slug
    HAVING COUNT(*) > 1
  ) AS dups;

  IF dup_count = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS hosted_pages_published_slug_uniq
      ON public.hosted_pages (slug)
      WHERE status = 'published';
    RAISE NOTICE 'hosted_pages_published_slug_uniq created (or already present).';
  ELSE
    RAISE NOTICE 'Skipping hosted_pages_published_slug_uniq: % duplicate published slug(s) found. Resolve them and re-run this migration.', dup_count;
  END IF;
END $$;
