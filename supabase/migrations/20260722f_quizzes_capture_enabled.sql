-- 20260722f_quizzes_capture_enabled.sql
-- La colonne quizzes.capture_enabled existait cote Tiquiz (migration
-- 20260530_quizzes_capture_enabled) mais PAS cote Tipote (seul hosted_pages
-- l'avait). Le rendu public des quiz lit desormais cette colonne (capture
-- email optionnelle en mode quiz). On la cree en idempotent AVANT le code
-- pour eviter tout 404 sur les quiz publics si elle est absente en prod
-- (cf. drame survey_thanks du 2 juin : une colonne lue mais absente = 404).
-- DEFAULT true = la capture reste activee, les quiz existants ne changent pas.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS capture_enabled BOOLEAN NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
