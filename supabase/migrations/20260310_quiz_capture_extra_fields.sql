-- Add optional capture fields to quizzes (phone, country, last_name)
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS capture_phone BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS capture_country BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS capture_last_name BOOLEAN NOT NULL DEFAULT false;

-- Add corresponding columns to quiz_leads
ALTER TABLE public.quiz_leads ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.quiz_leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.quiz_leads ADD COLUMN IF NOT EXISTS country TEXT;
