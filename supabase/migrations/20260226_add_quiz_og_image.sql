-- Add og_image_url column to quizzes for social media share image (og:image)
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS og_image_url TEXT;
