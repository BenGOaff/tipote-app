-- 20260714_quiz_results_sio_tag_names.sql
--
-- Plusieurs tags Systeme.io par profil de reponse (demande Gwenn
-- 12 juillet 2026 : "plusieurs tags par profil de reponse. Je dois
-- separer une liste en deux, et certains iront dans les deux").
--
-- 100% ADDITIF : on ajoute une colonne tableau `sio_tag_names TEXT[]`
-- a cote de l'ancienne colonne single `sio_tag_name` (conservee pour
-- compat descendante). Les profils existants ne changent pas :
-- - lecture / application : on prend `sio_tag_names` si non vide,
--   sinon fallback sur `[sio_tag_name]` (rien a backfiller).
-- - ecriture : l'editeur ecrit `sio_tag_names` ET remet `sio_tag_name`
--   au premier element (ou NULL) pour que le code legacy qui lit encore
--   la colonne single continue de fonctionner.

ALTER TABLE public.quiz_results
  ADD COLUMN IF NOT EXISTS sio_tag_names TEXT[];

NOTIFY pgrst, 'reload schema';
