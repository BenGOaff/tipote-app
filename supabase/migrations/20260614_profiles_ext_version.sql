-- 20260614_profiles_ext_version.sql (Tipote)
--
-- Télémétrie version extension (support Béné 14 juin 2026 : "ce user a
-- bien la dernière MAJ ?"). L'extension envoie X-Tipote-Ext-Version sur
-- chaque appel backend ; on stocke la dernière vue ici. Visible dans
-- l'admin users.
--
-- ⚠️ Rétroactif impossible : ne se remplit qu'à partir de la version
-- d'extension qui ENVOIE l'en-tête (v1.8.0+). NULL = jamais vu reporter
-- (vieille version OU n'utilise pas l'extension).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ext_version TEXT,
  ADD COLUMN IF NOT EXISTS ext_version_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.ext_version IS
'Derniere version d''extension Tipote vue pour ce user (en-tete X-Tipote-Ext-Version). NULL = jamais reportee.';

NOTIFY pgrst, 'reload schema';
