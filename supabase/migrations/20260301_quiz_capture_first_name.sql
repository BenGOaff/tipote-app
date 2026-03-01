-- Add optional first name capture to quizzes
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS capture_first_name BOOLEAN NOT NULL DEFAULT false;

-- Add first_name column to quiz_leads
ALTER TABLE public.quiz_leads ADD COLUMN IF NOT EXISTS first_name TEXT;
