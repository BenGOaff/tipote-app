-- ═══════════════════════════════════════════
-- TIPOTE — Hosted pages: full version history
-- ═══════════════════════════════════════════
--
-- Why this exists:
-- The /api/pages/generate route creates a NEW row each time the user
-- regenerates content (3-attempt INSERT with auto-suffixed slugs).
-- The "Régénérer" button felt like an in-place update from the user's
-- side; that mismatch caused at least one paying customer to think
-- she had "lost everything" when in fact her older version had been
-- archived to make room for the new generation.
--
-- This migration adds a side-table that keeps a snapshot every time
-- the editor mutates a page's content_data / brand_tokens / images /
-- layout. Snapshots are append-only and never deleted (except via
-- the FK CASCADE when the parent page itself is deleted), so a
-- support intervention can always restore an earlier state with a
-- single UPDATE.
--
-- Storage cost: 3-5 KB JSON per snapshot, ~10-30 saves per active
-- page ⇒ <200 KB per page. A 5k-user base with 5 pages each =
-- ~5 GB of audit data over a year. Cheap insurance against the kind
-- of "j'ai tout perdu" tickets that erode trust.

CREATE TABLE IF NOT EXISTS public.hosted_pages_history (
  id BIGSERIAL PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES public.hosted_pages(id) ON DELETE CASCADE,
  -- Denormalized for forensic queries: even if the page row is
  -- later transferred between users (it shouldn't, but defence in
  -- depth), the history still tells us who owned it at the time
  -- of the snapshot.
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Full editor-state payload at snapshot time. Each column is the
  -- pre-image of the corresponding hosted_pages column (i.e. the
  -- value JUST BEFORE the UPDATE that triggered the snapshot).
  content_data   JSONB NOT NULL,
  brand_tokens   JSONB,
  custom_images  JSONB,
  layout_config  JSONB,
  section_order  JSONB,
  html_snapshot  TEXT,
  -- Header / SEO bits also worth keeping — they're cheap.
  title          TEXT,
  meta_title     TEXT,
  meta_description TEXT,

  -- Optional context: "ai_regenerate", "manual_save", "publish",
  -- "template_apply", … Defaults to NULL when the trigger fires from
  -- a generic UPDATE without an app-level hint.
  change_reason  TEXT,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot path: "show me all snapshots of THIS page, newest first"
CREATE INDEX IF NOT EXISTS idx_hosted_pages_history_page
  ON public.hosted_pages_history (page_id, changed_at DESC);

-- Cross-page queries on a user's audit trail (eg. "all snapshots
-- across her account in the last 24h") for support investigations.
CREATE INDEX IF NOT EXISTS idx_hosted_pages_history_user
  ON public.hosted_pages_history (user_id, changed_at DESC);

ALTER TABLE public.hosted_pages_history ENABLE ROW LEVEL SECURITY;

-- The owner can read their own audit trail (useful if we ever
-- expose a "version history" UI). Writes happen exclusively via
-- the trigger below, which runs as the table owner and bypasses
-- RLS, so no INSERT policy is needed.
CREATE POLICY "Owner reads own page history" ON public.hosted_pages_history
  FOR SELECT USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════
-- Auto-snapshot trigger
-- ═══════════════════════════════════════════
--
-- BEFORE UPDATE: takes a snapshot of the OLD row whenever a real
-- content mutation lands. We deliberately DO NOT snapshot for cheap
-- bookkeeping changes (status flips, slug renames, view counters)
-- because those are recoverable from the parent row anyway and
-- would inflate the table 10x.
--
-- The change_reason is read from a per-transaction GUC, so an app
-- can opt-in by running:
--   SELECT set_config('app.change_reason', 'ai_regenerate', true);
-- right before the UPDATE. The 'true' makes it transaction-local so
-- it doesn't leak across connections in a pooled environment.

CREATE OR REPLACE FUNCTION public.snapshot_hosted_page() RETURNS TRIGGER AS $$
DECLARE
  reason TEXT;
  content_changed BOOLEAN;
BEGIN
  -- Only snapshot when something the user actually edited has changed.
  content_changed :=
       OLD.content_data   IS DISTINCT FROM NEW.content_data
    OR OLD.brand_tokens   IS DISTINCT FROM NEW.brand_tokens
    OR OLD.custom_images  IS DISTINCT FROM NEW.custom_images
    OR OLD.layout_config  IS DISTINCT FROM NEW.layout_config
    OR OLD.section_order  IS DISTINCT FROM NEW.section_order
    OR OLD.html_snapshot  IS DISTINCT FROM NEW.html_snapshot;

  IF NOT content_changed THEN
    RETURN NEW;
  END IF;

  -- Read the optional change-reason hint set by the calling app.
  -- current_setting(missing_ok => true) returns NULL when unset so
  -- we never raise here.
  reason := NULLIF(current_setting('app.change_reason', true), '');

  INSERT INTO public.hosted_pages_history (
    page_id, user_id,
    content_data, brand_tokens, custom_images,
    layout_config, section_order, html_snapshot,
    title, meta_title, meta_description,
    change_reason
  ) VALUES (
    OLD.id, OLD.user_id,
    OLD.content_data, OLD.brand_tokens, OLD.custom_images,
    OLD.layout_config, OLD.section_order, OLD.html_snapshot,
    OLD.title, OLD.meta_title, OLD.meta_description,
    reason
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_hosted_pages_snapshot ON public.hosted_pages;
CREATE TRIGGER trg_hosted_pages_snapshot
  BEFORE UPDATE ON public.hosted_pages
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_hosted_page();

-- ═══════════════════════════════════════════
-- Operator helpers
-- ═══════════════════════════════════════════
-- Quick "diff between two snapshots" for support work:
--
--   SELECT changed_at, change_reason,
--          (content_data->>'hero_title') AS hero_title,
--          (content_data->>'about_description') AS about
--   FROM hosted_pages_history
--   WHERE page_id = '…'
--   ORDER BY changed_at DESC LIMIT 20;
--
-- Restore the version from N saves ago into the live row:
--
--   UPDATE hosted_pages SET
--     content_data  = h.content_data,
--     brand_tokens  = h.brand_tokens,
--     custom_images = h.custom_images,
--     layout_config = h.layout_config,
--     section_order = h.section_order,
--     html_snapshot = h.html_snapshot
--   FROM (
--     SELECT * FROM hosted_pages_history
--     WHERE page_id = '…'
--     ORDER BY changed_at DESC OFFSET N LIMIT 1
--   ) h
--   WHERE hosted_pages.id = '…';
