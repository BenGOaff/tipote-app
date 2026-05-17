-- Autosave columns for the popquiz editor — port from Tiquiz
-- (migration 20260515_palettes_and_autosave.sql).
--
-- The Tipote popquiz repo / page have been SELECT-ing these columns
-- since the autosave feature shipped, but the schema migration that
-- adds them never landed on the Tipote DB. The PostgREST select would
-- error silently ("column draft_state does not exist") and the JS
-- client returned {data: null, error: ...} — which fetchOwnedPopquiz
-- normalises to `return null`, ending in a hard 404 on every popquiz
-- edit screen.
--
-- Adding the columns idempotently restores the page. The autosave
-- hook will start populating draft_state immediately; nothing else
-- relies on these being NULL.

ALTER TABLE public.popquizzes
  ADD COLUMN IF NOT EXISTS draft_state JSONB,
  ADD COLUMN IF NOT EXISTS draft_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.popquizzes.draft_state IS
  'Opaque JSON snapshot of the editor''s last autosave. NULL = no pending draft.';
COMMENT ON COLUMN public.popquizzes.draft_updated_at IS
  'Timestamp of the last autosave. Compared against updated_at to decide if the editor should offer a restore-draft dialog on reopen.';
