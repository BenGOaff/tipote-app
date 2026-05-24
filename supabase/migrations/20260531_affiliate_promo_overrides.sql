-- 20260531_affiliate_promo_overrides.sql
--
-- Permet aux affiliés d'éditer et sauvegarder LEURS propres versions
-- des textes promo (emails, posts réseaux). Stocké en JSONB par
-- affilié — clé = "<kind>:<id>:<field>", valeur = texte personnalisé.
-- Absence de clé = on retombe sur le modèle d'origine (reset = delete).
--
-- Exemples de clés :
--   email:01-ouverture:subject
--   email:01-ouverture:body
--   post:j1-annonce:instagram

alter table public.affiliates
  add column if not exists promo_overrides jsonb not null default '{}'::jsonb;

comment on column public.affiliates.promo_overrides is
  'Versions personnalisées par l''affilié des textes promo (emails/'
  'posts). Clé "<kind>:<id>:<field>" → texte. Vide = modèle d''origine.';

notify pgrst, 'reload schema';
