-- Social share button widgets (ShareThis-like)
-- Configurable sharing buttons for hosted pages & external embed.

CREATE TABLE IF NOT EXISTS social_share_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Boutons de partage',
  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Which platforms to show (order matters)
  platforms JSONB NOT NULL DEFAULT '["facebook","twitter","linkedin","whatsapp","email"]',

  -- Display style
  display_mode TEXT NOT NULL DEFAULT 'inline'
    CHECK (display_mode IN ('inline','floating-left','floating-right','bottom-bar')),
  button_style TEXT NOT NULL DEFAULT 'rounded'
    CHECK (button_style IN ('rounded','square','circle','pill')),
  button_size TEXT NOT NULL DEFAULT 'md'
    CHECK (button_size IN ('sm','md','lg')),
  show_labels BOOLEAN NOT NULL DEFAULT false,
  show_counts BOOLEAN NOT NULL DEFAULT false,

  -- Custom share content (overrides page meta)
  share_url TEXT,        -- URL to share (if set, overrides current page URL)
  share_text TEXT,       -- default share text (if set, overrides page title)
  share_hashtags TEXT,   -- comma-separated hashtags (for Twitter/X)

  -- Colors
  color_mode TEXT NOT NULL DEFAULT 'brand'
    CHECK (color_mode IN ('brand','mono-light','mono-dark','custom')),
  custom_color TEXT,     -- hex color when color_mode='custom'

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_social_share_widgets_user ON social_share_widgets(user_id);

-- RLS
ALTER TABLE social_share_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY social_share_widgets_owner ON social_share_widgets
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY social_share_widgets_service ON social_share_widgets
  FOR ALL USING (true) WITH CHECK (true);
