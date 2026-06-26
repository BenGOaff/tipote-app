-- 20260626_survey_lead_flagged.sql (Tipote)
--
-- Marquage des répondants de sondage ("bonne réponse" / "à récompenser").
-- Béné 26 juin 2026 : besoin de cocher des répondants dans le tableau
-- Réponses pour les retrouver vite (cas concret : offrir un cadeau aux
-- bonnes réponses d'un sondage-jeu). Miroir de Tiquiz.
--
-- Colonne partagée par quiz ET sondages (les deux vivent dans quiz_leads),
-- mais l'UI ne l'expose que dans le tableau Réponses des sondages pour
-- l'instant. NULL impossible (default false) → tri/filtre simples.

ALTER TABLE public.quiz_leads
  ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.quiz_leads.flagged IS
  'Répondant marqué par le créateur (étoile dans le tableau Réponses). Exporté en colonne "Marqué".';

NOTIFY pgrst, 'reload schema';
