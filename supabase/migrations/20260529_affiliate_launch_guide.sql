-- 20260529_affiliate_launch_guide.sql
--
-- Guide de lancement 6 étapes pour les nouveaux affiliés.
-- Chaque clé = step_key, valeur = timestamp ISO de completion (texte).
-- 4 steps sont auto-détectées depuis d'autres colonnes (profil,
-- paiement, trial, lien copié) ; 2 sont self-attestées (1er email,
-- 1er post). On stocke ici uniquement les self-attestations + le
-- timestamp du link copy (qui n'a pas d'autre source).
--
-- Schéma : { "link_copied": "2026-05-29T10:00:00Z",
--            "first_email": "...", "first_post": "..." }
--
-- La carte du guide est masquée quand les 6 steps sont done.

alter table public.affiliates
  add column if not exists launch_guide_completed jsonb not null default '{}'::jsonb;

comment on column public.affiliates.launch_guide_completed is
  'Map des steps complétés du guide de lancement 6 étapes. Clé = '
  'step_key (link_copied, first_email, first_post), valeur = '
  'timestamp ISO de completion. Les 3 autres steps (profile, '
  'payment, trial) sont auto-détectées depuis les colonnes natives.';

notify pgrst, 'reload schema';
