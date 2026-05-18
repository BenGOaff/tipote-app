-- Toggle "téléphone obligatoire" pour les quiz et sondages
-- (demande utilisateur Hugo, mai 2026).
--
-- Avant : la case "demander le téléphone" affichait toujours la
-- mention "(optionnel)" à côté du label, et le champ n'avait jamais
-- d'attribut `required`. Pas moyen pour le créateur de rendre le
-- téléphone obligatoire si son cas d'usage l'exigeait.
--
-- Après : nouveau flag `phone_required` (default FALSE → on
-- préserve TOUT le comportement existant). Le créateur peut le
-- basculer dans l'éditeur de capture, la public-form retire alors
-- la mention "(optionnel)" et pose `required` sur le champ.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS phone_required BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.quizzes.phone_required IS
  'Si TRUE, le champ téléphone est obligatoire dans le formulaire de capture (et la mention "(optionnel)" disparaît). Default FALSE = comportement historique préservé.';
