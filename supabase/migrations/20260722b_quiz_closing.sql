-- 20260722b_quiz_closing.sql
-- Fermeture d'un quiz : le createur peut fermer un quiz et, au choix,
-- rediriger les visiteurs vers une URL OU afficher un message avec un CTA
-- personnalise. Tout est nullable / desactive par defaut -> aucun quiz
-- existant n'est ferme ni modifie.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS close_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS close_action TEXT,
  ADD COLUMN IF NOT EXISTS close_redirect_url TEXT,
  ADD COLUMN IF NOT EXISTS close_message TEXT,
  ADD COLUMN IF NOT EXISTS close_cta_text TEXT,
  ADD COLUMN IF NOT EXISTS close_cta_url TEXT;

COMMENT ON COLUMN public.quizzes.close_enabled IS
  'Quiz ferme aux visiteurs. false (defaut) = ouvert, rendu inchange.';
COMMENT ON COLUMN public.quizzes.close_action IS
  'Comportement a la fermeture : redirect | message (defaut message).';

NOTIFY pgrst, 'reload schema';
