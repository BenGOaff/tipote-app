-- Tracks DM conversations where Tipote is waiting for an email reply.
-- When a user comments a keyword and receives a DM, we store the link
-- so that when they reply with their email, we can sync to Systeme.io.

CREATE TABLE IF NOT EXISTS dm_email_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,           -- Facebook user/PSID who received the DM
  sender_name TEXT,
  automation_id UUID NOT NULL REFERENCES social_automations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'facebook',
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | captured | expired
  email TEXT,                         -- filled when email is detected
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_at TIMESTAMPTZ,
  UNIQUE(page_id, sender_id, automation_id)  -- one pending capture per sender per automation
);

-- Index for fast lookup when a messaging event arrives
CREATE INDEX IF NOT EXISTS idx_dm_email_captures_lookup
  ON dm_email_captures(page_id, sender_id, status);
