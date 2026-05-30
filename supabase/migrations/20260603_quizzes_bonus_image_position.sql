-- Adeline (30 mai 2026, suite suite) : "L'image pour le bonus de partage
-- ça doit être exactement pareil que les autres : upload OU IA OU GIF,
-- redimensionnement, drag-and-drop pour placer où on veut."
--
-- L'image bonus existait déjà (quizzes.bonus_image_url) mais sans
-- positionnement libre. On ajoute la colonne de position, miroir exact
-- de intro_image_position : "top" / "after_heading" / "after_intro" /
-- "bottom" (sur le step bonus / partage).
--
-- Default NULL → côté visiteur on retombe sur "top" (rétrocompatible :
-- les quiz existants gardent le rendu actuel, image au-dessus).

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS bonus_image_position TEXT;

ALTER TABLE public.quizzes
  ADD CONSTRAINT quizzes_bonus_image_position_check
  CHECK (bonus_image_position IS NULL OR bonus_image_position IN ('top', 'after_heading', 'after_intro', 'bottom'));

COMMENT ON COLUMN public.quizzes.bonus_image_position IS
  'Position de l''image bonus sur l''écran de partage : top | after_heading | after_intro | bottom. NULL = "top" par défaut (compat quiz existants).';

NOTIFY pgrst, 'reload schema';
