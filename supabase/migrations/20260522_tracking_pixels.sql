-- Tracking pixels Meta + Google (Adeline, 19 mai 2026, Phase B :
-- "intégrer Meta et Google pour que les users ajoutent leur pixel
-- et leurs balises meta pour un tracking précis").
--
-- Stratégie validée :
--   - Q2 : per-quiz + défaut user (l'utilisateur peut avoir un pixel
--     différent par campagne, et un défaut auto-rempli sur les
--     nouveaux quizzes)
--   - Q3 : strict — les scripts pixels ne se chargent qu'APRÈS le
--     visiteur a coché la case de consentement (si show_consent_checkbox
--     = true). Si la case n'est pas activée par le créateur, les
--     pixels chargent immédiatement.
--
-- 4 colonnes par scope :
--   - meta_pixel_id              : 13-16 digits typiquement (Meta Pixel ID)
--   - ga4_measurement_id         : "G-XXXXXXX" (Google Analytics 4)
--   - google_ads_conversion_id   : "AW-XXXXXXX" (compte Google Ads)
--   - google_ads_conversion_label: identifiant de l'événement de
--                                  conversion (suffixe après le `/`
--                                  dans l'URL Meta Ads, ex "abc123/XYZ")
--
-- TEXT pour tout (pas d'enum) — Meta peut changer le format demain.
-- La validation regex se fait côté éditeur, pas en DB.

-- ─── Per-quiz : 4 colonnes sur `quizzes` ──────────────────────────
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT,
  ADD COLUMN IF NOT EXISTS ga4_measurement_id TEXT,
  ADD COLUMN IF NOT EXISTS google_ads_conversion_id TEXT,
  ADD COLUMN IF NOT EXISTS google_ads_conversion_label TEXT;

COMMENT ON COLUMN public.quizzes.meta_pixel_id IS
  'Meta (Facebook) Pixel ID du créateur — chargé sur la page publique pour PageView / Lead / Share. NULL = pas de pixel.';
COMMENT ON COLUMN public.quizzes.ga4_measurement_id IS
  'Google Analytics 4 measurement ID au format G-XXXXXXX. NULL = pas de tracking GA.';
COMMENT ON COLUMN public.quizzes.google_ads_conversion_id IS
  'Google Ads conversion ID au format AW-XXXXXXX. Requis pour fire les conversions Lead vers Ads.';
COMMENT ON COLUMN public.quizzes.google_ads_conversion_label IS
  'Conversion label associé à l''ID (après le `/`). Sans label, pas de conversion fired.';

-- ─── User défauts : 4 colonnes sur `profiles` ─────────────────────
-- Ces valeurs sont pré-remplies à la création d'un nouveau quiz et
-- exposées dans /settings. L'utilisateur peut aussi appliquer ses
-- défauts à un quiz existant via un bouton dans l'éditeur.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_meta_pixel_id TEXT,
  ADD COLUMN IF NOT EXISTS default_ga4_measurement_id TEXT,
  ADD COLUMN IF NOT EXISTS default_google_ads_conversion_id TEXT,
  ADD COLUMN IF NOT EXISTS default_google_ads_conversion_label TEXT;

COMMENT ON COLUMN public.profiles.default_meta_pixel_id IS
  'Pixel Meta par défaut auto-rempli sur les nouveaux quizzes du créateur. Modifiable par quiz.';

-- ─── Notifier PostgREST ───────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
