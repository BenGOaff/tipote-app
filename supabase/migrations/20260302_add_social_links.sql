-- Add additional social network links and custom links to business_profiles
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS pinterest_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS threads_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS facebook_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS custom_links JSONB DEFAULT '[]'::jsonb;

-- custom_links structure: [{ "label": "Mon podcast", "url": "https://..." }, ...]
