-- 20260523_brand_favicon.sql
-- Favicon custom par projet (Gwenn via Béné, 23 mai 2026) — sur les
-- pages publiques servies via un custom domain vérifié, le favicon
-- affiché dans l'onglet navigateur doit être celui du user, pas celui
-- de Tipote. Sans custom domain, on garde le favicon Tipote.
--
-- Niveau brand_profile (per-project) parce que Tipote sépare l'identité
-- par projet (un user peut avoir plusieurs projets avec des marques
-- différentes), contrairement à Tiquiz où c'est par user.

alter table public.business_profiles
  add column if not exists brand_favicon_url text;

comment on column public.business_profiles.brand_favicon_url is
  'Favicon affiché dans l''onglet navigateur sur les pages publiques servies via un custom domain vérifié de ce projet. Image carrée recommandée, idéalement 256x256 PNG ou ICO.';

notify pgrst, 'reload schema';
