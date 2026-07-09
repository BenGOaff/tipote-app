-- 20260710_ai_insights.sql (Tipote)
--
-- Analyse IA STRATÉGIQUE (au-dela de l'analyse de reponses de sondage
-- survey_ai_analysis). Aligne sur Tiquiz, mais gate par CREDITS (modele
-- Tipote) et non par plan.
--
-- 1) Par quiz OU sondage : diagnostic complet (visites, completion,
--    capture, profil des visiteurs, axes d'amelioration, actions ventes
--    et captures), stocke sur la ligne quizzes. 1 credit a la 1ere
--    generation (ai_insights_first_charged_at), mises a jour gratuites.
-- 2) Au niveau GLOBAL (tous les quiz/sondages d'un user) : compte-rendu
--    strategique, stocke dans user_insight_reports (1 credit la 1ere fois).
--
-- Conventions : IF NOT EXISTS + NOTIFY.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS ai_insights JSONB,
  ADD COLUMN IF NOT EXISTS ai_insights_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_insights_first_charged_at TIMESTAMPTZ;

COMMENT ON COLUMN public.quizzes.ai_insights IS
  'Analyse IA strategique du quiz/sondage : { summary, funnel, audience, improvements[], actions[], stats_at_generation, model, generated_at }. NULL = jamais generee.';
COMMENT ON COLUMN public.quizzes.ai_insights_at IS
  'Timestamp de la derniere generation de l''analyse IA strategique.';
COMMENT ON COLUMN public.quizzes.ai_insights_first_charged_at IS
  'Timestamp du 1er debit credit pour l''analyse strategique. NULL = jamais debitee (1er lancement payant, MAJ gratuites).';

-- Compte-rendu strategique GLOBAL, un par user. first_charged_at : la
-- 1ere generation coute 1 credit, les MAJ sont gratuites.
CREATE TABLE IF NOT EXISTS public.user_insight_reports (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  report            JSONB,
  generated_at      TIMESTAMPTZ,
  first_charged_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_insight_reports IS
  'Analyse IA strategique GLOBALE par user (tous ses quiz/sondages). report = { summary, whatWorks[], toFix[], nextMoves[], stats_at_generation, model, generated_at }. first_charged_at : 1er debit credit.';

ALTER TABLE public.user_insight_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own insight report" ON public.user_insight_reports;
CREATE POLICY "own insight report" ON public.user_insight_reports
  FOR SELECT USING (auth.uid() = user_id);
-- Ecriture uniquement via service role (routes serveur).

NOTIFY pgrst, 'reload schema';
