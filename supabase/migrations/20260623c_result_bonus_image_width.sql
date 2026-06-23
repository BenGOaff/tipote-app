-- 20260623c_result_bonus_image_width.sql
--
-- Largeur d'affichage (%) pour l'image de RESULTAT et l'image BONUS, comme
-- pour l'intro. NULL = pleine largeur (comportement actuel). Permet
-- d'agrandir/retrecir ces images sans les recadrer.
ALTER TABLE public.quiz_results ADD COLUMN IF NOT EXISTS image_width SMALLINT;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS bonus_image_width SMALLINT;
NOTIFY pgrst, 'reload schema';
