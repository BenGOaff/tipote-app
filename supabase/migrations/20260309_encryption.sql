-- Per-user encryption keys (DEK wrapped with master key)
CREATE TABLE IF NOT EXISTS user_encryption_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wrapped_dek TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_encryption_keys ENABLE ROW LEVEL SECURITY;

-- Users can only read their own key
CREATE POLICY "Users read own key" ON user_encryption_keys
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything
CREATE POLICY "Service role full access to keys" ON user_encryption_keys
  FOR ALL USING (auth.role() = 'service_role');

-- Add encrypted columns to leads table
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS email_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS email_blind_idx TEXT,
  ADD COLUMN IF NOT EXISTS first_name_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS last_name_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS phone_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS quiz_answers_encrypted TEXT;

-- Index for blind index search on email
CREATE INDEX IF NOT EXISTS idx_leads_email_blind
  ON leads (user_id, email_blind_idx);
