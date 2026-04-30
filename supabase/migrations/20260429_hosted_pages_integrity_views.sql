-- ═══════════════════════════════════════════
-- TIPOTE — Data integrity views for hosted_pages
-- ═══════════════════════════════════════════
--
-- Why this exists:
-- After the section_order={} wipe incident (Marie-Paule, 2026-04-29)
-- we added defensive guards on the PATCH route AND a snapshot
-- trigger. These views close the loop on the OPERATIONAL side: a
-- support engineer can run a single SELECT and see EVERY user's
-- pages that look suspicious — empty section_order on a populated
-- snapshot, content_data drift between snapshot and structured
-- columns, etc. — without writing ad-hoc SQL each time.
--
-- All views are SELECT-only, no side effects. They sit on top of
-- public.hosted_pages and rely on the trigger-populated
-- hosted_pages_history for diff queries.

-- ── 1) Pages whose section_order LOOKS WIPED ──────────────────
-- A row is suspicious when:
--   - the page is published OR draft (not archived)
--   - section_order is {} (or null)
--   - AND the html_snapshot contains 3+ <section> tags (so the
--     user clearly has a real layout, not a freshly-generated row)
-- These are candidates for the recovery flow we used for MP.
CREATE OR REPLACE VIEW public.v_hosted_pages_suspicious_section_order AS
SELECT
  hp.id,
  hp.user_id,
  hp.slug,
  hp.status,
  hp.title,
  hp.updated_at,
  hp.section_order,
  -- count how many <section> tags the live snapshot has
  (length(coalesce(hp.html_snapshot, '')) -
   length(replace(coalesce(hp.html_snapshot, ''), '<section', ''))) / length('<section')
    AS section_tag_count
FROM public.hosted_pages hp
WHERE hp.status IN ('published', 'draft')
  AND (
    hp.section_order IS NULL
    OR hp.section_order::text = '{}'
    OR (
      coalesce(jsonb_array_length(hp.section_order->'mobile'), 0) = 0 AND
      coalesce(jsonb_array_length(hp.section_order->'desktop'), 0) = 0
    )
  )
  AND (length(coalesce(hp.html_snapshot, '')) -
       length(replace(coalesce(hp.html_snapshot, ''), '<section', ''))) / length('<section') >= 3;

-- ── 2) Pages whose latest snapshot diverges hard from html_snapshot ──
-- After a rebuild or a stale-cache write, content_data and
-- html_snapshot can drift. A simple (cheap) heuristic: pick a
-- short string from content_data.hero_title and check whether it
-- appears in html_snapshot. When it doesn't, the live page shows
-- something different from what the editor reads.
CREATE OR REPLACE VIEW public.v_hosted_pages_html_drift AS
SELECT
  hp.id,
  hp.user_id,
  hp.slug,
  hp.status,
  hp.updated_at,
  hp.content_data->>'hero_title'   AS expected_hero_title,
  -- 1 if the expected hero title fragment is found in the snapshot,
  -- 0 if not. A 0 means the visitor sees a different headline than
  -- the editor.
  CASE
    WHEN coalesce(hp.content_data->>'hero_title', '') = '' THEN NULL
    WHEN position(left(regexp_replace(hp.content_data->>'hero_title', '<[^>]*>', '', 'g'), 30) IN coalesce(hp.html_snapshot, '')) > 0 THEN 1
    ELSE 0
  END AS hero_in_snapshot,
  length(coalesce(hp.html_snapshot, '')) AS html_bytes
FROM public.hosted_pages hp
WHERE hp.status IN ('published', 'draft')
  AND coalesce(hp.content_data->>'hero_title', '') <> '';

-- ── 3) Per-user audit trail (last 50 changes) ────────────────
-- One-stop view to inspect any user's recent edits. Use:
--   SELECT * FROM v_hosted_pages_recent_changes
--   WHERE user_id = '...' ORDER BY changed_at DESC LIMIT 50;
CREATE OR REPLACE VIEW public.v_hosted_pages_recent_changes AS
SELECT
  h.changed_at,
  h.user_id,
  h.page_id,
  h.title,
  h.change_reason,
  pg_column_size(h.content_data)  AS content_bytes,
  pg_column_size(h.brand_tokens)  AS brand_bytes,
  pg_column_size(h.section_order) AS section_bytes,
  length(coalesce(h.html_snapshot, '')) AS html_bytes,
  -- Quick fingerprint so successive snapshots can be compared at
  -- a glance: same MD5 means content_data didn't actually change
  -- (the trigger only fires on real diffs but this confirms it).
  md5(coalesce(h.content_data::text, '')) AS content_fingerprint
FROM public.hosted_pages_history h;

-- ── 4) Health overview (single row) ──────────────────────────
-- Runbook helper: SELECT * FROM v_hosted_pages_health to see at
-- a glance how many rows look broken globally.
CREATE OR REPLACE VIEW public.v_hosted_pages_health AS
SELECT
  (SELECT COUNT(*) FROM public.hosted_pages WHERE status = 'published')                                AS published_total,
  (SELECT COUNT(*) FROM public.v_hosted_pages_suspicious_section_order)                                AS section_order_wiped,
  (SELECT COUNT(*) FROM public.v_hosted_pages_html_drift WHERE hero_in_snapshot = 0)                   AS html_drift_pages,
  (SELECT COUNT(*) FROM public.hosted_pages WHERE status = 'published' AND coalesce(html_snapshot, '') = '') AS empty_snapshot_published,
  (SELECT COUNT(*) FROM public.hosted_pages_history)                                                   AS history_rows;

COMMENT ON VIEW public.v_hosted_pages_suspicious_section_order IS
  'Published/draft pages with empty section_order but a multi-section html_snapshot — likely victims of the 2026-04-29 wipe pattern. Recovery: copy section_order from a recent archive of the same user, then call /api/admin/rebuild-page-snapshot.';

COMMENT ON VIEW public.v_hosted_pages_html_drift IS
  'Pages whose hero_title in content_data is NOT found in html_snapshot — visitor sees a different page than the creator edits. Trigger a rebuild via /api/admin/rebuild-page-snapshot.';

COMMENT ON VIEW public.v_hosted_pages_recent_changes IS
  'Audit trail across all users. Filter by user_id + sort by changed_at DESC for support investigations.';

COMMENT ON VIEW public.v_hosted_pages_health IS
  'Single-row dashboard counter. Run periodically (cron) and alert if section_order_wiped or html_drift_pages climbs above 0.';
