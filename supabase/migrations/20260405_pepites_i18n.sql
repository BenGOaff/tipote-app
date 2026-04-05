-- =============================================================
-- Pepites i18n: add locale + group_key for multi-language support
-- =============================================================

-- locale: language of this pepite (fr, en, es, it, ar)
ALTER TABLE pepites ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'fr';

-- group_key: links translations of the same pepite together
-- All translations of one pepite share the same group_key (= id of the original FR pepite)
ALTER TABLE pepites ADD COLUMN IF NOT EXISTS group_key TEXT;

-- Backfill existing pepites: set group_key = id (they are the FR originals)
UPDATE pepites SET group_key = id::text WHERE group_key IS NULL;

-- Make group_key NOT NULL after backfill
ALTER TABLE pepites ALTER COLUMN group_key SET NOT NULL;

-- Unique constraint: one translation per language per group
ALTER TABLE pepites ADD CONSTRAINT pepites_group_locale_unique UNIQUE (group_key, locale);

-- Index for fast lookup by locale
CREATE INDEX IF NOT EXISTS idx_pepites_locale ON pepites(locale);

-- Drop the old title uniqueness if it exists (titles will differ per locale)
-- The import script uses onConflict: "title" but with i18n, same title could exist in different languages
-- We keep backward compat by not dropping it — the import script only handles FR anyway
