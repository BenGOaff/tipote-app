-- Add customizable capture page fields to quizzes
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS capture_heading TEXT;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS capture_subtitle TEXT;
