-- Add 'linkinbio' page type + linkinbio_links table for link-in-bio pages

-- 1. Extend page_type constraint to include 'linkinbio'
ALTER TABLE public.hosted_pages
  DROP CONSTRAINT IF EXISTS hosted_pages_page_type_check;

ALTER TABLE public.hosted_pages
  ADD CONSTRAINT hosted_pages_page_type_check
  CHECK (page_type IN ('capture', 'sales', 'showcase', 'linkinbio'));

-- 2. linkinbio_links: ordered blocks for link-in-bio pages
CREATE TABLE IF NOT EXISTS public.linkinbio_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.hosted_pages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Block type
  block_type TEXT NOT NULL DEFAULT 'link'
    CHECK (block_type IN ('link', 'header', 'social_icons', 'capture_form')),

  -- Link fields
  title TEXT NOT NULL DEFAULT '',
  url TEXT DEFAULT '',
  icon_url TEXT DEFAULT '',

  -- Social icons block: array of {platform, url}
  social_links JSONB DEFAULT '[]'::jsonb,

  -- Visibility toggle
  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Ordering
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Per-link click tracking
  clicks_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS linkinbio_links_page_idx
  ON public.linkinbio_links (page_id, sort_order);

CREATE INDEX IF NOT EXISTS linkinbio_links_user_idx
  ON public.linkinbio_links (user_id);

-- RLS
ALTER TABLE public.linkinbio_links ENABLE ROW LEVEL SECURITY;

-- Owner can CRUD
CREATE POLICY linkinbio_links_owner_select ON public.linkinbio_links
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY linkinbio_links_owner_insert ON public.linkinbio_links
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY linkinbio_links_owner_update ON public.linkinbio_links
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY linkinbio_links_owner_delete ON public.linkinbio_links
  FOR DELETE USING (auth.uid() = user_id);

-- Public can read links of published pages
CREATE POLICY linkinbio_links_public_read ON public.linkinbio_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.hosted_pages
      WHERE id = linkinbio_links.page_id AND status = 'published'
    )
  );

-- RPC to increment link clicks (avoids full row lock)
CREATE OR REPLACE FUNCTION public.increment_linkinbio_clicks(p_link_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.linkinbio_links
  SET clicks_count = clicks_count + 1
  WHERE id = p_link_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update trigger
CREATE OR REPLACE FUNCTION public.update_linkinbio_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER linkinbio_links_updated_at_trigger
  BEFORE UPDATE ON public.linkinbio_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_linkinbio_links_updated_at();
