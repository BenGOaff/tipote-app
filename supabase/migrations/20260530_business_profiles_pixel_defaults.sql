-- 20260530_business_profiles_pixel_defaults.sql
--
-- FIX : la migration 20260522_tracking_pixels.sql avait ajouté les
-- colonnes default_* sur `profiles`, mais sur Tipote les défauts
-- business (dont les pixels) vivent dans `business_profiles`. Le
-- formulaire /settings + l'API /api/profile écrivent dans
-- business_profiles → "Could not find the 'default_ga4_measurement_id'
-- column of 'business_profiles' in the schema cache" au save
-- (remonté par Béné le 23/05).
--
-- On ajoute donc les 4 colonnes sur business_profiles (table réelle).

alter table public.business_profiles
  add column if not exists default_meta_pixel_id text,
  add column if not exists default_ga4_measurement_id text,
  add column if not exists default_google_ads_conversion_id text,
  add column if not exists default_google_ads_conversion_label text;

comment on column public.business_profiles.default_meta_pixel_id is
  'Pixel Meta par défaut, fallback sur les quiz/pages sans pixel '
  'explicite. Modifiable par quiz/page.';

notify pgrst, 'reload schema';
