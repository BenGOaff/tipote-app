-- Toast notification widgets (social proof)
-- Supports 3 sources: real-time visitor tracking (via script ping),
-- pixel events (signup/purchase on thank-you pages), and custom messages.

CREATE TABLE IF NOT EXISTS toast_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Mon widget',
  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Display config
  position TEXT NOT NULL DEFAULT 'bottom-left' CHECK (position IN ('bottom-left','bottom-right','top-left','top-right')),
  display_duration INTEGER NOT NULL DEFAULT 5000,   -- ms per toast
  delay_between INTEGER NOT NULL DEFAULT 8000,      -- ms between toasts
  max_per_session INTEGER NOT NULL DEFAULT 10,       -- max toasts shown per visitor session

  -- Style
  style JSONB NOT NULL DEFAULT '{"theme":"light","accent":"#2563eb","rounded":true}',

  -- Custom messages (promo, urgency, scarcity, etc.)
  -- Array of { text, icon?, enabled }
  custom_messages JSONB NOT NULL DEFAULT '[]',

  -- Settings for real events
  show_recent_signups BOOLEAN NOT NULL DEFAULT true,
  show_recent_purchases BOOLEAN NOT NULL DEFAULT true,
  show_visitor_count BOOLEAN NOT NULL DEFAULT true,
  visitor_count_label TEXT NOT NULL DEFAULT '{count} personnes consultent cette page',
  signup_label TEXT NOT NULL DEFAULT '{name} vient de s''inscrire',
  purchase_label TEXT NOT NULL DEFAULT '{name} vient d''acheter',
  anonymize_after INTEGER NOT NULL DEFAULT 0, -- trim name to first letter + "." after N chars (0 = no)

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Events recorded by the embeddable script (pixel on thank-you pages)
CREATE TABLE IF NOT EXISTS toast_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id UUID NOT NULL REFERENCES toast_widgets(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('signup','purchase','custom')),
  visitor_name TEXT,           -- first name (optional)
  page_url TEXT,               -- page where the event happened
  metadata JSONB DEFAULT '{}', -- extra data (amount, product name, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Visitor pings for "X people viewing this page" (ephemeral, cleaned up by cron)
CREATE TABLE IF NOT EXISTS toast_pings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id UUID NOT NULL REFERENCES toast_widgets(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,    -- random ID stored in sessionStorage
  page_url TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_toast_widgets_user ON toast_widgets(user_id);
CREATE INDEX idx_toast_events_widget ON toast_events(widget_id, created_at DESC);
CREATE INDEX idx_toast_pings_widget ON toast_pings(widget_id, last_seen);
CREATE UNIQUE INDEX idx_toast_pings_unique ON toast_pings(widget_id, visitor_id);

-- RLS
ALTER TABLE toast_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE toast_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE toast_pings ENABLE ROW LEVEL SECURITY;

-- Owner can CRUD their widgets
CREATE POLICY toast_widgets_owner ON toast_widgets
  FOR ALL USING (auth.uid() = user_id);
-- Service role can do anything (for public API endpoints)
CREATE POLICY toast_widgets_service ON toast_widgets
  FOR ALL USING (true) WITH CHECK (true);

-- Events: owner can read, service role can insert (from public endpoint)
CREATE POLICY toast_events_owner ON toast_events
  FOR SELECT USING (
    widget_id IN (SELECT id FROM toast_widgets WHERE user_id = auth.uid())
  );
CREATE POLICY toast_events_service ON toast_events
  FOR ALL USING (true) WITH CHECK (true);

-- Pings: public insert/update (upsert), service role read
CREATE POLICY toast_pings_service ON toast_pings
  FOR ALL USING (true) WITH CHECK (true);

-- RPC to count active visitors for a widget+page (last 60 seconds)
CREATE OR REPLACE FUNCTION count_active_visitors(p_widget_id UUID, p_page_url TEXT DEFAULT NULL)
RETURNS INTEGER AS $$
  SELECT COUNT(DISTINCT visitor_id)::INTEGER
  FROM toast_pings
  WHERE widget_id = p_widget_id
    AND last_seen > now() - INTERVAL '60 seconds'
    AND (p_page_url IS NULL OR page_url = p_page_url);
$$ LANGUAGE sql STABLE;
