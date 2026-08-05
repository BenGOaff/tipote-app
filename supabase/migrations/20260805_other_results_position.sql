-- 20260804_other_results_position.sql
--
-- Retour Gwenn, 4 août 2026 : "sur la page de résultat, 'Découvre les
-- autres profils' est placé au dessus du bouton d'achat. Ça offre une
-- porte de sortie juste avant la proposition."
--
-- Le bloc passe APRÈS le bouton, pour tout le monde, y compris les quiz
-- déjà en ligne (demande explicite de Béné). Le défaut de la colonne
-- porte donc le nouveau comportement, et la créatrice qui préférait
-- l'ancien le remet en un clic depuis l'éditeur.
--
-- Le code ne dépend PAS de cette migration pour fonctionner : une
-- position absente ou illisible donne déjà 'after_cta'
-- (lib/quiz/otherResults.ts), et la route publique lit cette colonne
-- dans son groupe "colonnes récentes", avec repli si elle manque. Rien
-- ne casse si elle est appliquée en retard, mais le réglage ne sera pas
-- enregistrable tant qu'elle ne l'est pas.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS other_results_position TEXT NOT NULL DEFAULT 'after_cta';

-- Une valeur inconnue serait traitée comme 'after_cta' côté code, mais
-- autant l'interdire à la source : c'est une colonne à deux valeurs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quizzes_other_results_position_check'
  ) THEN
    ALTER TABLE public.quizzes
      ADD CONSTRAINT quizzes_other_results_position_check
      CHECK (other_results_position IN ('after_cta', 'before_cta'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
