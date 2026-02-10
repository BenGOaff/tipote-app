-- Migration: Add competitor_analyses table + business_profiles column
-- Run this in Supabase SQL editor BEFORE deploying the new code.

-- 1) Create competitor_analyses table
CREATE TABLE IF NOT EXISTS public.competitor_analyses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competitors jsonb DEFAULT '[]'::jsonb,
  competitor_details jsonb DEFAULT '{}'::jsonb,
  summary text DEFAULT '',
  strengths jsonb DEFAULT '[]'::jsonb,
  weaknesses jsonb DEFAULT '[]'::jsonb,
  opportunities jsonb DEFAULT '[]'::jsonb,
  positioning_matrix text DEFAULT '',
  uploaded_document_summary text DEFAULT '',
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT competitor_analyses_user_id_key UNIQUE (user_id)
);

-- 2) Enable RLS
ALTER TABLE public.competitor_analyses ENABLE ROW LEVEL SECURITY;

-- 3) RLS policies: users can only access their own data
CREATE POLICY "Users can read own competitor analyses"
  ON public.competitor_analyses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own competitor analyses"
  ON public.competitor_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own competitor analyses"
  ON public.competitor_analyses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own competitor analyses"
  ON public.competitor_analyses FOR DELETE
  USING (auth.uid() = user_id);

-- 4) Add competitor_analysis_summary column to business_profiles (best-effort context)
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS competitor_analysis_summary text DEFAULT '';

-- 5) Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_competitor_analyses_user_id
  ON public.competitor_analyses(user_id);
