-- Webinars V1: campagnes webinaires avec suivi KPIs

CREATE TABLE IF NOT EXISTS webinars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT,
  offer_name TEXT,
  webinar_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'live', 'completed')),
  -- KPIs
  registrants INTEGER DEFAULT 0,
  attendees INTEGER DEFAULT 0,
  replay_viewers INTEGER DEFAULT 0,
  offers_presented INTEGER DEFAULT 0,
  sales_count INTEGER DEFAULT 0,
  revenue NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE webinars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own webinars"
  ON webinars FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_webinars_user_project
  ON webinars(user_id, project_id);
