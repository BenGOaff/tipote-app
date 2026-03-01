-- hosted_pages: user-generated landing/capture/sales pages
-- Stores the generated HTML + metadata for public hosting at /p/[slug]

CREATE TABLE IF NOT EXISTS public.hosted_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,

  -- Page identity
  title TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL,
  page_type TEXT NOT NULL DEFAULT 'capture' CHECK (page_type IN ('capture', 'sales')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),

  -- Template source
  template_kind TEXT NOT NULL DEFAULT 'capture',       -- 'capture' | 'vente'
  template_id TEXT NOT NULL DEFAULT '',                 -- e.g. 'capture-01', 'sale-03'

  -- Generated content
  content_data JSONB NOT NULL DEFAULT '{}'::jsonb,      -- The contentData JSON for the template
  brand_tokens JSONB DEFAULT '{}'::jsonb,               -- Brand overrides (colors, fonts)
  html_snapshot TEXT DEFAULT '',                         -- Pre-rendered HTML for fast serving

  -- User customizations
  custom_images JSONB DEFAULT '[]'::jsonb,              -- [{key, url, alt}] uploaded images
  video_embed_url TEXT DEFAULT '',                       -- YouTube/Vimeo embed URL
  payment_url TEXT DEFAULT '',                           -- Stripe/Systeme.io/PayPal link
  payment_button_text TEXT DEFAULT '',                   -- Custom CTA for payment

  -- SEO / sharing
  meta_title TEXT DEFAULT '',
  meta_description TEXT DEFAULT '',
  og_image_url TEXT DEFAULT '',

  -- Legal compliance
  legal_mentions_url TEXT DEFAULT '',
  legal_cgv_url TEXT DEFAULT '',
  legal_privacy_url TEXT DEFAULT '',

  -- Lead capture config
  capture_enabled BOOLEAN NOT NULL DEFAULT true,
  capture_heading TEXT DEFAULT '',
  capture_subtitle TEXT DEFAULT '',
  sio_capture_tag TEXT DEFAULT '',                      -- Systeme.io tag for captured leads

  -- Analytics
  views_count INTEGER NOT NULL DEFAULT 0,
  leads_count INTEGER NOT NULL DEFAULT 0,
  share_count INTEGER NOT NULL DEFAULT 0,

  -- Iteration history
  iteration_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique slug per user (allows different users same slug)
CREATE UNIQUE INDEX IF NOT EXISTS hosted_pages_user_slug_uniq
  ON public.hosted_pages (user_id, slug);

-- Fast lookup by slug for public serving
CREATE INDEX IF NOT EXISTS hosted_pages_slug_status_idx
  ON public.hosted_pages (slug, status);

-- User's pages list
CREATE INDEX IF NOT EXISTS hosted_pages_user_status_idx
  ON public.hosted_pages (user_id, status, created_at DESC);

-- page_leads: captured emails/data from hosted pages
CREATE TABLE IF NOT EXISTS public.page_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.hosted_pages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  email TEXT NOT NULL DEFAULT '',
  first_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  custom_fields JSONB DEFAULT '{}'::jsonb,

  -- Systeme.io sync
  sio_synced BOOLEAN NOT NULL DEFAULT false,
  sio_contact_id TEXT DEFAULT '',

  -- Source tracking
  utm_source TEXT DEFAULT '',
  utm_medium TEXT DEFAULT '',
  utm_campaign TEXT DEFAULT '',
  referrer TEXT DEFAULT '',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS page_leads_page_idx
  ON public.page_leads (page_id, created_at DESC);

CREATE INDEX IF NOT EXISTS page_leads_user_idx
  ON public.page_leads (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS page_leads_email_idx
  ON public.page_leads (page_id, email);

-- RLS policies
ALTER TABLE public.hosted_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_leads ENABLE ROW LEVEL SECURITY;

-- hosted_pages: owner can CRUD
CREATE POLICY hosted_pages_owner_select ON public.hosted_pages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY hosted_pages_owner_insert ON public.hosted_pages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY hosted_pages_owner_update ON public.hosted_pages
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY hosted_pages_owner_delete ON public.hosted_pages
  FOR DELETE USING (auth.uid() = user_id);

-- hosted_pages: public can read published pages (for /p/[slug])
CREATE POLICY hosted_pages_public_read ON public.hosted_pages
  FOR SELECT USING (status = 'published');

-- page_leads: owner can read their leads
CREATE POLICY page_leads_owner_select ON public.page_leads
  FOR SELECT USING (auth.uid() = user_id);

-- page_leads: anyone can insert (public form submission)
CREATE POLICY page_leads_public_insert ON public.page_leads
  FOR INSERT WITH CHECK (true);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_hosted_pages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hosted_pages_updated_at_trigger
  BEFORE UPDATE ON public.hosted_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_hosted_pages_updated_at();

-- RPC to increment views (avoids full row lock)
CREATE OR REPLACE FUNCTION public.increment_page_views(p_page_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.hosted_pages
  SET views_count = views_count + 1
  WHERE id = p_page_id AND status = 'published';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
