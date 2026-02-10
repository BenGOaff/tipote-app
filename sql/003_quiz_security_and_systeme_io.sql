-- Migration 003: Fix quiz_leads UPDATE policy + add Systeme.io user API key
-- Run AFTER 002_quiz_tables.sql

-- 1) Add Systeme.io user API key column
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS sio_user_api_key text;

-- 2) Fix quiz_leads UPDATE policy: restrict to quiz owner only
-- The public route uses supabaseAdmin (service role) which bypasses RLS,
-- so we don't need a public UPDATE policy.
DROP POLICY IF EXISTS "Anyone can update share status on leads" ON public.quiz_leads;

CREATE POLICY "Users can update leads of own quizzes"
  ON public.quiz_leads FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.quizzes WHERE quizzes.id = quiz_leads.quiz_id AND quizzes.user_id = auth.uid()));
