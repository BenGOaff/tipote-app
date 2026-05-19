-- 20260519_business_profiles_share_site_name.sql
-- Adeline (19 mai 2026) : sur les quiz / hosted_pages servis via un
-- custom domain, l'aperçu iMessage / WhatsApp affichait "Tipote" sous
-- le titre (via og:site_name + template global du <title>). Quand l'user
-- a son propre domain vérifié, plus AUCUNE trace de Tipote ne doit
-- apparaître.
--
-- Cette colonne est l'override par projet (= business_profile) du
-- `og:site_name` + suffix du `<title>`. Quand elle est vide :
--   - main host (app.tipote.com) → on garde "Tipote" (comportement
--     historique préservé pour les non-payants)
--   - custom domain vérifié → fallback sur le hostname vérifié (ex:
--     adelinecirade.com) — déjà sans "Tipote"
-- Quand elle est remplie → on l'utilise telle quelle (ex: "Adeline
-- Cirade", "Le studio de Marie").

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS share_site_name TEXT;

COMMENT ON COLUMN public.business_profiles.share_site_name IS
  'Nom de marque affiché dans og:site_name + suffix du <title> sur les routes publiques du créateur. Override de "Tipote". Per-project (= per business_profile). S''applique uniquement aux quiz/popquiz/hosted_pages servis via un custom domain vérifié rattaché au même project_id.';

-- Schema cache reload pour PostgREST.
NOTIFY pgrst, 'reload schema';