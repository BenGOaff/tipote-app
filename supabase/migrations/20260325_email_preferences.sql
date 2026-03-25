-- Email notification preferences per user
-- Idempotent: table + policies may already exist from initial deploy
-- This migration adds the 2 new columns (monthly_report, milestone_emails)

-- 1. Create table if not exists (safe re-run)
CREATE TABLE IF NOT EXISTS email_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  social_alerts BOOLEAN NOT NULL DEFAULT true,
  credits_alerts BOOLEAN NOT NULL DEFAULT true,
  weekly_digest BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

-- 2. Add new columns (safe: IF NOT EXISTS prevents error on re-run)
ALTER TABLE email_preferences ADD COLUMN IF NOT EXISTS monthly_report BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE email_preferences ADD COLUMN IF NOT EXISTS milestone_emails BOOLEAN NOT NULL DEFAULT true;

-- 3. Policies (use IF NOT EXISTS pattern via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_preferences' AND policyname = 'Users can view own email prefs') THEN
    CREATE POLICY "Users can view own email prefs"
      ON email_preferences FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_preferences' AND policyname = 'Users can update own email prefs') THEN
    CREATE POLICY "Users can update own email prefs"
      ON email_preferences FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_preferences' AND policyname = 'Users can insert own email prefs') THEN
    CREATE POLICY "Users can insert own email prefs"
      ON email_preferences FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_preferences' AND policyname = 'Service role full access on email_preferences') THEN
    CREATE POLICY "Service role full access on email_preferences"
      ON email_preferences FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;
