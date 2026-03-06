-- Add clicks_count to hosted_pages + RPC to increment it

ALTER TABLE public.hosted_pages
  ADD COLUMN IF NOT EXISTS clicks_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_page_clicks(p_page_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.hosted_pages
  SET clicks_count = clicks_count + 1
  WHERE id = p_page_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
