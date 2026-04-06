-- =============================================================
-- SIO User Webhook Integration: tables for webhook registration + sales tracking
-- =============================================================

-- Tracks which webhooks are registered on each user's SIO account
CREATE TABLE IF NOT EXISTS sio_webhook_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  sio_webhook_id TEXT,              -- SIO's webhook ID (for deletion)
  event_type TEXT NOT NULL,         -- NEW_SALE, SALE_CANCELED, CONTACT_CREATED, etc.
  webhook_url TEXT NOT NULL,
  secret_token TEXT NOT NULL,       -- Per-user secret for URL verification
  status TEXT NOT NULL DEFAULT 'active', -- active, failed, deleted
  last_received_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, project_id, event_type)
);

ALTER TABLE sio_webhook_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sio webhooks" ON sio_webhook_registrations FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sio_webhook_reg_token ON sio_webhook_registrations(secret_token);
CREATE INDEX IF NOT EXISTS idx_sio_webhook_reg_user ON sio_webhook_registrations(user_id, project_id);

-- Records every sale from the user's SIO account (their business, not Tipote subscriptions)
CREATE TABLE IF NOT EXISTS sio_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  sio_order_id TEXT,
  sio_contact_id TEXT,
  customer_email TEXT,
  customer_first_name TEXT,
  customer_last_name TEXT,
  offer_name TEXT,
  offer_id TEXT,
  price_plan_name TEXT,
  price_plan_id TEXT,
  amount NUMERIC(12,2),
  currency TEXT DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'completed', -- completed, canceled
  canceled_at TIMESTAMPTZ,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, sio_order_id)
);

ALTER TABLE sio_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sio sales" ON sio_sales FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sio_sales_user ON sio_sales(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_sio_sales_created ON sio_sales(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sio_sales_offer ON sio_sales(user_id, offer_name, created_at DESC);
