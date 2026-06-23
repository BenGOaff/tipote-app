-- 20260623b_intro_image_width.sql
--
-- Largeur d'affichage (en %) de l'image / GIF d'intro. Permet d'agrandir
-- ou retrecir l'image sur la page publique (pas seulement de la recadrer).
-- NULL = pleine largeur (comportement actuel, 100%). Vaut pour quiz ET
-- sondages (meme colonne quizzes.intro_image_url).
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS intro_image_width SMALLINT;
NOTIFY pgrst, 'reload schema';
