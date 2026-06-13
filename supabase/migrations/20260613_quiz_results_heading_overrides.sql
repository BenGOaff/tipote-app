-- 20260613_quiz_results_heading_overrides.sql (Tipote)
--
-- Titres de blocs résultat personnalisables PAR PROFIL (retour Gwenn
-- 13 juin 2026, miroir Tiquiz). Override nullable par résultat : NULL =
-- titre commun du quiz (quizzes.result_insight_heading /
-- result_projection_heading), renseigné = titre propre à ce profil.
-- Mode "identique vs personnalisé" dérivé côté éditeur, pas de flag.

ALTER TABLE public.quiz_results
  ADD COLUMN IF NOT EXISTS insight_heading TEXT,
  ADD COLUMN IF NOT EXISTS projection_heading TEXT;

COMMENT ON COLUMN public.quiz_results.insight_heading IS
'Override du titre du bloc insight pour CE profil. NULL/vide = titre commun du quiz.';
COMMENT ON COLUMN public.quiz_results.projection_heading IS
'Override du titre du bloc projection (Et si...) pour CE profil. NULL/vide = titre commun du quiz.';

NOTIFY pgrst, 'reload schema';
