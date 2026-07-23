-- 20260722d_quiz_panel_media.sql
-- Visuel du panneau decoratif (disposition "colonnes" / split) enrichi et
-- configurable par page. Remplace le simple split_image_url (garde comme
-- fallback retro-compatible) par un objet JSON par page :
--   { perPage?: bool, global?: Item, pages?: { [pageKey]: Item } }
--   Item = { type: motif|color|gradient|image, color?, gradient?, motif?,
--            motifColor?, imageUrl? }
--   pageKey = "intro" | "capture" | "q:"+questionId | "r:"+resultId
-- NULL = aucune config -> les quiz existants sont rendus STRICTEMENT comme
-- avant (motif mesh sur la couleur de marque, ou l'ancienne image split si
-- elle etait renseignee). Additif, aucune regression.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS panel_media JSONB;

COMMENT ON COLUMN public.quizzes.panel_media IS
  'Visuel du panneau decoratif en disposition split, par page. JSON valide/sanitise cote app. NULL = fallback split_image_url puis motif mesh sur la couleur de marque.';

NOTIFY pgrst, 'reload schema';
