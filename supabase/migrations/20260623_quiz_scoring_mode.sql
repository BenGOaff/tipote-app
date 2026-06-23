-- 20260623_quiz_scoring_mode.sql
--
-- Nouveau mode de quiz "scoring" (vrai quiz note) a cote de 'quiz'
-- (par profil) et 'survey' (sondage). 100% additif : les quiz existants
-- (mode 'quiz'/'survey') ne changent pas.
--
-- Modele scoring :
-- - chaque option porte un `points` (dans le JSONB options ; pas de
--   colonne a ajouter). "Bonne reponse" = 1 pt par defaut, points
--   personnalises possibles.
-- - le score total est compare aux tranches definies sur quiz_results
--   (min_score / max_score, bornes incluses) pour choisir le message.

ALTER TABLE public.quizzes DROP CONSTRAINT IF EXISTS quizzes_mode_check;
ALTER TABLE public.quizzes
  ADD CONSTRAINT quizzes_mode_check CHECK (mode IN ('quiz', 'survey', 'scoring'));

ALTER TABLE public.quiz_results ADD COLUMN IF NOT EXISTS min_score INTEGER;
ALTER TABLE public.quiz_results ADD COLUMN IF NOT EXISTS max_score INTEGER;

NOTIFY pgrst, 'reload schema';
