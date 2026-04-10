-- ═══════════════════════════════════════════
-- TIQUIZ - Plan system + webhook logs
-- ═══════════════════════════════════════════

-- Add plan columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
  CHECK (plan IN ('free', 'lifetime', 'monthly', 'yearly'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sio_contact_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS responses_used_this_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS responses_reset_at TIMESTAMPTZ DEFAULT now();

-- Webhook logs for audit
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT,
  event_type TEXT,
  payload JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS on webhook_logs (admin only via service role)
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- RPC: reset monthly responses counter
CREATE OR REPLACE FUNCTION reset_monthly_responses(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET responses_used_this_month = 0,
      responses_reset_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- RPC: increment response counter and return whether limit reached
CREATE OR REPLACE FUNCTION increment_response_count(p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan TEXT;
  v_used INTEGER;
  v_reset_at TIMESTAMPTZ;
  v_limit INTEGER;
BEGIN
  SELECT plan, responses_used_this_month, responses_reset_at
  INTO v_plan, v_used, v_reset_at
  FROM profiles
  WHERE user_id = p_user_id;

  -- Free plan: 10 responses/month
  IF v_plan = 'free' THEN
    v_limit := 10;

    -- Auto-reset if more than 30 days since last reset
    IF v_reset_at IS NULL OR (now() - v_reset_at) > INTERVAL '30 days' THEN
      UPDATE profiles
      SET responses_used_this_month = 1, responses_reset_at = now()
      WHERE user_id = p_user_id;
      RETURN jsonb_build_object('allowed', true, 'used', 1, 'limit', v_limit);
    END IF;

    IF v_used >= v_limit THEN
      RETURN jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit);
    END IF;

    UPDATE profiles
    SET responses_used_this_month = responses_used_this_month + 1
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object('allowed', true, 'used', v_used + 1, 'limit', v_limit);
  END IF;

  -- Paid plans: unlimited
  RETURN jsonb_build_object('allowed', true, 'used', v_used + 1, 'limit', -1);
END;
$$;
