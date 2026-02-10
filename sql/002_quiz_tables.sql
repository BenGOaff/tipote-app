-- Migration: Quiz Lead Magnet feature
-- Creates quizzes, quiz_questions, quiz_results, quiz_leads tables
-- Adds legal URL columns to business_profiles

-- 1) Add legal URL columns + Systeme.io user API key to business_profiles
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS privacy_url text,
  ADD COLUMN IF NOT EXISTS terms_url text,
  ADD COLUMN IF NOT EXISTS cgv_url text,
  ADD COLUMN IF NOT EXISTS sio_user_api_key text;

-- 2) Quizzes table (main quiz entity)
CREATE TABLE IF NOT EXISTS public.quizzes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  introduction text,
  cta_text text,
  cta_url text,
  privacy_url text,
  consent_text text DEFAULT 'En renseignant ton email, tu acceptes notre politique de confidentialité.',
  virality_enabled boolean DEFAULT false,
  bonus_description text,
  share_message text,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  views_count integer DEFAULT 0,
  shares_count integer DEFAULT 0,
  config_objective text,
  config_target text,
  config_tone text,
  config_cta text,
  config_bonus text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quizzes"
  ON public.quizzes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own quizzes"
  ON public.quizzes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quizzes"
  ON public.quizzes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own quizzes"
  ON public.quizzes FOR DELETE
  USING (auth.uid() = user_id);

-- Public read for active quizzes (visitors taking the quiz)
CREATE POLICY "Anyone can read active quizzes"
  ON public.quizzes FOR SELECT
  USING (status = 'active');

CREATE INDEX IF NOT EXISTS idx_quizzes_user_id ON public.quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_status ON public.quizzes(status);

-- 3) Quiz questions table
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_text text NOT NULL DEFAULT '',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

-- Owner access via quiz ownership
CREATE POLICY "Users can manage own quiz questions"
  ON public.quiz_questions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.quizzes WHERE quizzes.id = quiz_questions.quiz_id AND quizzes.user_id = auth.uid()));

-- Public read for active quiz questions
CREATE POLICY "Anyone can read questions of active quizzes"
  ON public.quiz_questions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.quizzes WHERE quizzes.id = quiz_questions.quiz_id AND quizzes.status = 'active'));

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON public.quiz_questions(quiz_id);

-- 4) Quiz results (profiles)
CREATE TABLE IF NOT EXISTS public.quiz_results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text,
  insight text,
  projection text,
  cta_text text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own quiz results"
  ON public.quiz_results FOR ALL
  USING (EXISTS (SELECT 1 FROM public.quizzes WHERE quizzes.id = quiz_results.quiz_id AND quizzes.user_id = auth.uid()));

CREATE POLICY "Anyone can read results of active quizzes"
  ON public.quiz_results FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.quizzes WHERE quizzes.id = quiz_results.quiz_id AND quizzes.status = 'active'));

CREATE INDEX IF NOT EXISTS idx_quiz_results_quiz_id ON public.quiz_results(quiz_id);

-- 5) Quiz leads (email captures)
CREATE TABLE IF NOT EXISTS public.quiz_leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  email text NOT NULL,
  result_id uuid REFERENCES public.quiz_results(id) ON DELETE SET NULL,
  has_shared boolean DEFAULT false,
  bonus_unlocked boolean DEFAULT false,
  consent_given boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(quiz_id, email)
);

ALTER TABLE public.quiz_leads ENABLE ROW LEVEL SECURITY;

-- Owner can read/delete leads
CREATE POLICY "Users can view leads of own quizzes"
  ON public.quiz_leads FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.quizzes WHERE quizzes.id = quiz_leads.quiz_id AND quizzes.user_id = auth.uid()));

CREATE POLICY "Users can delete leads of own quizzes"
  ON public.quiz_leads FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.quizzes WHERE quizzes.id = quiz_leads.quiz_id AND quizzes.user_id = auth.uid()));

-- Public insert for quiz submissions (anyone can submit a lead)
CREATE POLICY "Anyone can submit quiz leads"
  ON public.quiz_leads FOR INSERT
  WITH CHECK (true);

-- Owner can update leads of own quizzes (share tracking done via supabaseAdmin in API routes)
CREATE POLICY "Users can update leads of own quizzes"
  ON public.quiz_leads FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.quizzes WHERE quizzes.id = quiz_leads.quiz_id AND quizzes.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_quiz_leads_quiz_id ON public.quiz_leads(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_leads_email ON public.quiz_leads(email);
