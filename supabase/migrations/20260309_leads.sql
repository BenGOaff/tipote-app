-- Unified leads table (quiz, landing page, website, manual…)
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  source TEXT NOT NULL DEFAULT 'quiz',          -- quiz | landing_page | website | manual
  source_id TEXT,                                -- quiz_id or page_id reference
  source_name TEXT,                              -- human-readable (quiz title, page name…)
  quiz_answers JSONB,                            -- [{question_text, answer_text}]
  quiz_result_title TEXT,
  exported_sio BOOLEAN NOT NULL DEFAULT FALSE,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(user_id, email);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_select_own" ON leads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "leads_insert_own" ON leads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "leads_update_own" ON leads FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "leads_delete_own" ON leads FOR DELETE
  USING (auth.uid() = user_id);

-- Allow service role full access (for API routes / webhooks)
CREATE POLICY "leads_service_all" ON leads FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
