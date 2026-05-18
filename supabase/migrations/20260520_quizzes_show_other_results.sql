-- Adeline (19 mai 2026) : "Afficher les résultats c'est bien mais il
-- faudrait aussi mettre des liens vers les autres pages de résultats
-- pour que les visiteurs puissent voir les autres solutions proposées
-- s'il est curieux".
--
-- Toggle dédié pour rester cohérent avec `show_results_breakdown`
-- (déjà optionnel). Le créateur décide si la section "Découvre les
-- autres profils" est rendue côté visiteur — certains veulent garder
-- le mystère, d'autres veulent montrer la valeur des autres profils
-- pour augmenter l'engagement.
--
-- Default FALSE → comportement historique préservé pour les quiz
-- existants (rien ne s'affiche si l'auteur ne l'active pas).

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS show_other_results BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.quizzes.show_other_results IS
  'Si TRUE, la page de résultat visiteur affiche une section "Découvre les autres profils" avec accordéon cliquable vers chaque autre résultat (rendu non personnalisé). Default FALSE.';
