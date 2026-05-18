-- Étend le système "obligatoire/optionnel" à tous les champs de
-- capture (sauf email, toujours obligatoire). Suite au retour
-- Adeline (18 mai 2026) : "à part l'email, tous les éléments
-- demandés par l'user à son visiteur doivent pouvoir être rendus
-- optionnels. L'user choisit si son visiteur est obligé de le
-- laisser ou pas". Convention SaaS : asterisk sur les champs
-- obligatoires, rien sur les optionnels (plus de "(optionnel)"
-- en suffixe).
--
-- Tous les flags default FALSE → comportement historique préservé
-- pour les quiz existants (champs toujours optionnels comme avant).
-- L'éditeur ajoute une case à cocher "Rendre obligatoire" sous
-- chaque pill de capture activée.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS first_name_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_name_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS country_required BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.quizzes.first_name_required IS
  'Si TRUE, le prénom est obligatoire dans le formulaire de capture (asterisk côté visiteur + validation à la soumission). Default FALSE.';
COMMENT ON COLUMN public.quizzes.last_name_required IS
  'Si TRUE, le nom est obligatoire dans le formulaire de capture. Default FALSE.';
COMMENT ON COLUMN public.quizzes.country_required IS
  'Si TRUE, le pays est obligatoire dans le formulaire de capture. Default FALSE.';
