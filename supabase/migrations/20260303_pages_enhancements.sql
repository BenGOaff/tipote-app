-- Pages enhancements: leads increment RPC, tracking pixels, testimonials table

-- 1. RPC to safely increment leads_count (avoids race conditions)
CREATE OR REPLACE FUNCTION public.increment_page_leads(p_page_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.hosted_pages
  SET leads_count = leads_count + 1
  WHERE id = p_page_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Tracking pixel fields on hosted_pages
ALTER TABLE public.hosted_pages
  ADD COLUMN IF NOT EXISTS facebook_pixel_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS google_tag_id TEXT DEFAULT '';

-- 3. Testimonials table (reusable across pages)
CREATE TABLE IF NOT EXISTS public.testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  author_name TEXT NOT NULL DEFAULT '',
  author_role TEXT DEFAULT '',
  author_photo_url TEXT DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  rating INTEGER DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  source TEXT DEFAULT '',             -- e.g. 'manual', 'import', 'collected'
  offer_id TEXT DEFAULT '',           -- optional link to an offer

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS testimonials_user_idx
  ON public.testimonials (user_id, created_at DESC);

-- RLS for testimonials
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY testimonials_owner_select ON public.testimonials
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY testimonials_owner_insert ON public.testimonials
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY testimonials_owner_update ON public.testimonials
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY testimonials_owner_delete ON public.testimonials
  FOR DELETE USING (auth.uid() = user_id);

-- Update trigger for testimonials.updated_at
CREATE OR REPLACE FUNCTION public.update_testimonials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER testimonials_updated_at_trigger
  BEFORE UPDATE ON public.testimonials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_testimonials_updated_at();

-- 4. Unique constraint on page_leads (page_id, email) for upsert
CREATE UNIQUE INDEX IF NOT EXISTS page_leads_page_email_uniq
  ON public.page_leads (page_id, email);
