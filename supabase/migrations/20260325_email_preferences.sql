-- Email notification preferences per user
-- Defaults to true (opt-out model: users receive emails until they disable)
CREATE TABLE IF NOT EXISTS email_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  social_alerts BOOLEAN NOT NULL DEFAULT true,
  credits_alerts BOOLEAN NOT NULL DEFAULT true,
  weekly_digest BOOLEAN NOT NULL DEFAULT true,
  monthly_report BOOLEAN NOT NULL DEFAULT true,
  milestone_emails BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own preferences
CREATE POLICY "Users can view own email prefs"
  ON email_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own email prefs"
  ON email_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email prefs"
  ON email_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for cron jobs)
CREATE POLICY "Service role full access on email_preferences"
  ON email_preferences FOR ALL
  USING (auth.role() = 'service_role');
