-- Support tickets: escalation from chatbot to human support
-- Stores the full chatbot conversation + visitor email for admin follow-up

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  subject TEXT,
  conversation JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'replied', 'closed')),
  admin_reply TEXT,
  replied_at TIMESTAMPTZ,
  locale TEXT NOT NULL DEFAULT 'fr',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for admin queries
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_email ON support_tickets(email);

-- No RLS needed: public insert (no auth), admin read/update via service role
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert a ticket (public chatbot escalation)
CREATE POLICY "Anyone can create a ticket"
  ON support_tickets FOR INSERT
  WITH CHECK (true);

-- Only service role (admin) can read/update
-- (No SELECT/UPDATE policies = only service_role can access)
