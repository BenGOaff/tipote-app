-- 20260714b_capture_before_questions.sql
--
-- Sondage : demander l'email (+ prenom, etc.) AVANT les questions plutot
-- qu'apres (demande Christelle 12 juillet 2026 : "je voudrais demander
-- emails + prenom avant les questions").
--
-- 100% ADDITIF et OFF par defaut : colonne booleenne. Les sondages
-- existants gardent la capture APRES les questions (comportement inchange).
-- Le public renderer ne change de flux QUE si ce flag est true ET
-- mode='survey' ET capture activee.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS capture_before_questions BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
