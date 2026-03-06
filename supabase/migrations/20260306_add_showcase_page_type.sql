-- Add 'showcase' to the page_type check constraint on hosted_pages
-- Needed for vitrine/showcase pages

ALTER TABLE public.hosted_pages
  DROP CONSTRAINT IF EXISTS hosted_pages_page_type_check;

ALTER TABLE public.hosted_pages
  ADD CONSTRAINT hosted_pages_page_type_check
  CHECK (page_type IN ('capture', 'sales', 'showcase'));
