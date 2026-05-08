-- Module Compta — étape 1g : table de configuration des seuils fiscaux
--
-- Pourquoi cette table : les seuils TVA / taux IS / cotisations
-- changent (en général au 1er janvier, parfois en cours d'année).
-- Hardcoder les valeurs dans le code = oublier de les mettre à jour
-- = afficher des chiffres faux à des users qui prennent des
-- décisions fiscales basées dessus. La table est lue par le dashboard
-- compta et alimentée par :
--   1. Le seed initial (2026 FR — cette migration)
--   2. Une page admin (/admin/compta/fiscal-thresholds) où Béné peut
--      éditer les valeurs manuellement
--   3. Un cron quotidien (/api/cron/check-fiscal-thresholds) qui va
--      voir si les valeurs hardcodées sont toujours présentes dans
--      les pages officielles et alerte par email sinon
--
-- Versionnement par année fiscale : on garde l'historique pour
-- pouvoir afficher "le seuil de 2025 était de 36 800 €" si besoin
-- pour un user qui consulte ses ventes N-1.

CREATE TABLE IF NOT EXISTS public.fiscal_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Pays — FR au lancement, on étendra avec BE/CH/CA/etc
  country TEXT NOT NULL DEFAULT 'FR',
  -- Année fiscale d'application (ex: 2026 pour les seuils valables
  -- du 1er jan au 31 déc 2026)
  fiscal_year INTEGER NOT NULL,
  -- Code de la catégorie. Convention :
  --   'vat_franchise_vente'         = franchise TVA, vente de marchandises
  --   'vat_franchise_services_bic' = franchise TVA, prestations BIC
  --   'vat_franchise_services_bnc' = franchise TVA, prestations BNC
  -- (extensible : 'is_rate_low', 'is_rate_normal', 'urssaf_*', etc.)
  category TEXT NOT NULL,
  -- Valeurs en euros (pas en cents — les seuils officiels sont
  -- exprimés en euros pleins)
  base_value NUMERIC NOT NULL,
  -- Seuil majoré (= "tolérance N+1" pour la franchise TVA). Optionnel
  -- car certaines catégories n'en ont pas (ex: taux IS).
  major_value NUMERIC,
  -- URL officielle de référence — utilisée par le cron pour vérifier
  -- la valeur, et affichée dans la UI admin pour cliquer dessus
  source_url TEXT,
  -- Date à partir de laquelle la valeur est applicable
  effective_from DATE NOT NULL,
  -- Notes libres (ex: "Loi de finances 2026 — vote du 28/12/2025")
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Une seule ligne par (country, year, category)
  UNIQUE (country, fiscal_year, category)
);

CREATE INDEX IF NOT EXISTS fiscal_thresholds_country_year_idx
  ON public.fiscal_thresholds(country, fiscal_year);

ALTER TABLE public.fiscal_thresholds ENABLE ROW LEVEL SECURITY;

-- Lecture autorisée à tous les users authentifiés (les seuils sont
-- des données publiques)
CREATE POLICY "fiscal_thresholds_read_all"
  ON public.fiscal_thresholds FOR SELECT
  USING (auth.role() = 'authenticated');

-- Écriture : uniquement via supabaseAdmin (server-side admin).
-- Pas de policy INSERT/UPDATE/DELETE = tout client est bloqué par RLS.

COMMENT ON TABLE public.fiscal_thresholds IS
  'Seuils et taux fiscaux applicables par pays + année. Source de vérité du dashboard compta. Édité via /admin/compta/fiscal-thresholds, vérifié par cron /api/cron/check-fiscal-thresholds.';

-- ─────────────────────────────────────────────────────────────────
-- Seed 2026 FR
-- ─────────────────────────────────────────────────────────────────
INSERT INTO public.fiscal_thresholds
  (country, fiscal_year, category, base_value, major_value, source_url, effective_from, notes)
VALUES
  (
    'FR', 2026, 'vat_franchise_vente',
    85000, 93500,
    'https://www.service-public.fr/professionnels-entreprises/vosdroits/F32353',
    '2026-01-01',
    'Vente de marchandises, vente à consommer sur place, fourniture de logement (BIC). Source : service-public.fr.'
  ),
  (
    'FR', 2026, 'vat_franchise_services_bic',
    37500, 41250,
    'https://www.service-public.fr/professionnels-entreprises/vosdroits/F32353',
    '2026-01-01',
    'Prestations de services artisanales / commerciales (BIC). Source : service-public.fr.'
  ),
  (
    'FR', 2026, 'vat_franchise_services_bnc',
    37500, 41250,
    'https://www.service-public.fr/professionnels-entreprises/vosdroits/F32353',
    '2026-01-01',
    'Prestations libérales / intellectuelles (BNC). Source : service-public.fr.'
  )
ON CONFLICT (country, fiscal_year, category) DO NOTHING;
