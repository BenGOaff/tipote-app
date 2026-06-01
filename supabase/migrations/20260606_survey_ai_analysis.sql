-- 20260606_survey_ai_analysis.sql
--
-- Stocke l'analyse IA d'un sondage (mode='survey') directement sur la
-- ligne quizzes. Permet :
--   - de re-servir l'analyse sans re-générer (re-runs gratuits — Béné :
--     "gratuit pour les mises à jour" → on ne débite 1 crédit qu'à la
--     PREMIÈRE génération, détectée par survey_ai_first_charged_at NULL).
--   - de savoir quand elle a été générée (fraîcheur vs nouvelles réponses).
--
-- survey_ai_analysis : JSONB { summary, takeaways[], actions[],
--   responses_at_generation, model, generated_at }.
-- survey_ai_analysis_at : timestamp de la dernière génération.
-- survey_ai_first_charged_at : timestamp du 1er débit crédit (NULL =
--   jamais débité → la prochaine génération coûte 1 crédit).
--
-- Conventions : IF NOT EXISTS + NOTIFY pgrst (cf. PITFALLS A).

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS survey_ai_analysis JSONB,
  ADD COLUMN IF NOT EXISTS survey_ai_analysis_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS survey_ai_first_charged_at TIMESTAMPTZ;

COMMENT ON COLUMN public.quizzes.survey_ai_analysis IS
  'Analyse IA du sondage : { summary, takeaways[], actions[], responses_at_generation, model, generated_at }. NULL = jamais générée.';
COMMENT ON COLUMN public.quizzes.survey_ai_analysis_at IS
  'Timestamp de la dernière génération de l''analyse IA.';
COMMENT ON COLUMN public.quizzes.survey_ai_first_charged_at IS
  'Timestamp du 1er débit de crédit pour l''analyse IA. NULL = pas encore débité → la prochaine génération coûte 1 crédit (les suivantes sont gratuites).';

NOTIFY pgrst, 'reload schema';
