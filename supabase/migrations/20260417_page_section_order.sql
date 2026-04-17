-- hosted_pages: add section_order for independent mobile vs desktop section ordering.
-- Shape: { "mobile": ["section-id-1", "section-id-2", ...], "desktop": [...] }
-- Each array lists section DOM ids in the desired visual order for that viewport.
-- Empty object ({}) means "follow DOM order" (backward compatible with existing pages).
--
-- The editor renders these arrays as CSS `order` rules inside media queries,
-- so one HTML tree serves both viewports with different visual orders.

ALTER TABLE public.hosted_pages
  ADD COLUMN IF NOT EXISTS section_order JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.hosted_pages.section_order IS
  'Per-viewport section order: { mobile: [id...], desktop: [id...] }. Empty = DOM order.';
