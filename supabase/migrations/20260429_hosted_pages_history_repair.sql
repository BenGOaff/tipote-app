-- ═══════════════════════════════════════════
-- TIPOTE — Repair hosted_pages_history schema
-- ═══════════════════════════════════════════
--
-- Why this exists:
-- 20260429_hosted_pages_history.sql created the table + a BEFORE
-- UPDATE trigger that snapshots the OLD row. In production, the
-- table ended up missing some columns referenced by the trigger
-- (layout_config and possibly section_order) — likely because an
-- earlier draft of the migration was applied first and the
-- subsequent CREATE TABLE IF NOT EXISTS skipped the table.
-- Result: every UPDATE on hosted_pages now raises
--   ERROR 42703: column "layout_config" of relation
--   "hosted_pages_history" does not exist
-- and the entire dashboard editor PATCH flow fails.
--
-- This migration is idempotent + defensive: ALTER TABLE ADD COLUMN
-- IF NOT EXISTS for every column the trigger writes, so no matter
-- what the table currently looks like, the trigger compiles cleanly
-- after this runs. Future migrations should never rely on a single
-- CREATE TABLE for the source-of-truth schema of an audit table —
-- always pair with explicit ALTER ADDs.

ALTER TABLE public.hosted_pages_history
  ADD COLUMN IF NOT EXISTS content_data    JSONB,
  ADD COLUMN IF NOT EXISTS brand_tokens    JSONB,
  ADD COLUMN IF NOT EXISTS custom_images   JSONB,
  ADD COLUMN IF NOT EXISTS layout_config   JSONB,
  ADD COLUMN IF NOT EXISTS section_order   JSONB,
  ADD COLUMN IF NOT EXISTS html_snapshot   TEXT,
  ADD COLUMN IF NOT EXISTS title           TEXT,
  ADD COLUMN IF NOT EXISTS meta_title      TEXT,
  ADD COLUMN IF NOT EXISTS meta_description TEXT,
  ADD COLUMN IF NOT EXISTS change_reason   TEXT;

-- The trigger function's INSERT references all the columns above.
-- A missing column here means every UPDATE on hosted_pages raises
-- 42703 — even an unrelated PATCH (e.g. status flip). The dashboard
-- becomes uneditable until this migration runs.

-- Re-create the trigger function in case it was lost or stale —
-- belt-and-suspenders. SECURITY DEFINER + plpgsql is needed so the
-- INSERT can target the audit table even if RLS is enforced for
-- the calling role.
CREATE OR REPLACE FUNCTION public.snapshot_hosted_page() RETURNS TRIGGER AS $$
DECLARE
  reason TEXT;
  content_changed BOOLEAN;
BEGIN
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
