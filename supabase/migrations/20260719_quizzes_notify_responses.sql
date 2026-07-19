-- 20260719_quizzes_notify_responses.sql (Tipote)
--
-- Opt-out des notifications email PAR QUIZ / SONDAGE (portage Tiquiz, demande
-- Gwenn 19 juil 2026). S'ajoute au réglage projet business_profiles.
-- notify_responses : une notification part seulement si le projet ET le quiz
-- sont activés. Défaut = activé.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS notify_responses BOOLEAN NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
