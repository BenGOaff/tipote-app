-- 20260718_quizzes_hide_response_counts.sql
--
-- Toggle par quiz/sondage : masquer le NOMBRE brut de reponses dans les
-- vues de synthese (donut de distribution, barres par question, tendances
-- sondage) pour ne montrer QUE les pourcentages. Permet a un createur de
-- publier des resultats sans devoiler ses volumes absolus.
-- NULL/false = comportement actuel (compteurs visibles). N'affecte que
-- l'affichage a l'ecran : les exports CSV / PDF gardent les nombres.
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS hide_response_counts BOOLEAN NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';
