-- ═══════════════════════════════════════════
-- TIQUIZ - Initial Schema
-- ═══════════════════════════════════════════

-- 1. Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  ui_locale TEXT DEFAULT 'fr',
  address_form TEXT DEFAULT 'tu' CHECK (address_form IN ('tu', 'vous')),
  privacy_url TEXT,
  sio_user_api_key TEXT,
  sio_api_key_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- 2. Quizzes
CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  introduction TEXT,
  cta_text TEXT,
  cta_url TEXT,
  privacy_url TEXT,
  consent_text TEXT,
  virality_enabled BOOLEAN NOT NULL DEFAULT false,
  bonus_description TEXT,
  share_message TEXT,
  locale TEXT DEFAULT 'fr',
  og_image_url TEXT,
  capture_heading TEXT,
  capture_subtitle TEXT,
  capture_first_name BOOLEAN NOT NULL DEFAULT false,
  capture_last_name BOOLEAN NOT NULL DEFAULT false,
  capture_phone BOOLEAN NOT NULL DEFAULT false,
  capture_country BOOLEAN NOT NULL DEFAULT false,
  sio_share_tag_name TEXT,
  views_count INTEGER NOT NULL DEFAULT 0,
  starts_count INTEGER NOT NULL DEFAULT 0,
  completions_count INTEGER NOT NULL DEFAULT 0,
  shares_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Quiz Questions
CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Quiz Results
CREATE TABLE IF NOT EXISTS quiz_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  insight TEXT,
  projection TEXT,
  cta_text TEXT,
  cta_url TEXT,
  sio_tag_name TEXT,
  sio_course_id TEXT,
  sio_community_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Quiz Leads
CREATE TABLE IF NOT EXISTS quiz_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  country TEXT,
  result_id UUID REFERENCES quiz_results(id),
  result_title TEXT,
  consent_given BOOLEAN NOT NULL DEFAULT false,
  has_shared BOOLEAN NOT NULL DEFAULT false,
  bonus_unlocked BOOLEAN NOT NULL DEFAULT false,
  answers JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(quiz_id, email)
);

-- ═══════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_quizzes_user_id ON quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_status ON quizzes(status);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_quiz_id ON quiz_results(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_leads_quiz_id ON quiz_leads(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_leads_email ON quiz_leads(email);

-- ═══════════════════════════════════════════
-- RLS (Row Level Security)
-- ═══════════════════════════════════════════
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_leads ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users manage own profile" ON profiles FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Quizzes
CREATE POLICY "Users manage own quizzes" ON quizzes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Questions
CREATE POLICY "Users manage own quiz questions" ON quiz_questions FOR ALL
  USING (quiz_id IN (SELECT id FROM quizzes WHERE user_id = auth.uid()))
  WITH CHECK (quiz_id IN (SELECT id FROM quizzes WHERE user_id = auth.uid()));

-- Results
CREATE POLICY "Users manage own quiz results" ON quiz_results FOR ALL
  USING (quiz_id IN (SELECT id FROM quizzes WHERE user_id = auth.uid()))
  WITH CHECK (quiz_id IN (SELECT id FROM quizzes WHERE user_id = auth.uid()));

-- Leads
CREATE POLICY "Users view own quiz leads" ON quiz_leads FOR ALL
  USING (quiz_id IN (SELECT id FROM quizzes WHERE user_id = auth.uid()))
  WITH CHECK (quiz_id IN (SELECT id FROM quizzes WHERE user_id = auth.uid()));

-- ═══════════════════════════════════════════
-- RPC: Atomic counter increment
-- ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION increment_quiz_counter(
  quiz_id_input UUID,
  counter_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF counter_name = 'starts_count' THEN
    UPDATE quizzes SET starts_count = starts_count + 1 WHERE id = quiz_id_input;
  ELSIF counter_name = 'completions_count' THEN
    UPDATE quizzes SET completions_count = completions_count + 1 WHERE id = quiz_id_input;
  ELSIF counter_name = 'views_count' THEN
    UPDATE quizzes SET views_count = views_count + 1 WHERE id = quiz_id_input;
  ELSIF counter_name = 'shares_count' THEN
    UPDATE quizzes SET shares_count = shares_count + 1 WHERE id = quiz_id_input;
  END IF;
END;
$$;
