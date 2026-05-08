-- Module Compta — étape 1b : config statut + sous-type
--
-- Tipote distingue 3 cas pour les users français au lancement :
--   • particulier (revenus accessoires à déclarer dans la 2042)
--   • auto-entrepreneur / micro-entreprise
--   • SASU avec IS et TVA (incluant TVA intra activable)
--
-- Toutes les colonnes vivent sur business_profiles (déjà projet-scopé)
-- pour que l'agrégation CA + alertes seuils s'aligne avec le projet
-- actif. Si un user a 2 projets de natures différentes (rare), il
-- peut configurer chaque projet indépendamment.
--
-- Les valeurs textes sont libres (pas d'ENUM) pour faciliter
-- l'évolution sans nouvelle migration ; la validation côté zod
-- (/api/profile/route.ts) garantit qu'on ne stocke que des valeurs
-- attendues.

ALTER TABLE public.business_profiles
  -- Statut principal : 'particulier' | 'auto_entrepreneur' | 'sasu'
  ADD COLUMN IF NOT EXISTS accounting_status TEXT,
  ADD COLUMN IF NOT EXISTS accounting_status_configured_at TIMESTAMPTZ,

  -- Particulier : nature des revenus accessoires
  --   'bnc_accessoire' = activités libérales accessoires (consulting,
  --     coaching, formation, prestations intellectuelles…)
  --   'bic_accessoire' = vente de produits ou services commerciaux
  --     accessoires
  --   'autre' = autres revenus à déclarer
  ADD COLUMN IF NOT EXISTS particulier_revenue_type TEXT,

  -- Auto-entrepreneur
  --   'vente'         = vente de marchandises (seuils élevés)
  --   'services_bic'  = prestations commerciales / artisanales
  --   'services_bnc'  = prestations libérales / intellectuelles
  --   'mixte'         = activités mixtes (les seuils s'appliquent
  --                     proportionnellement)
  ADD COLUMN IF NOT EXISTS ae_activity_type TEXT,
  ADD COLUMN IF NOT EXISTS ae_started_at DATE,
  -- ACRE = exonération partielle des cotisations la 1ère année
  ADD COLUMN IF NOT EXISTS ae_acre BOOLEAN NOT NULL DEFAULT FALSE,
  -- Versement libératoire = paiement de l'IR avec les cotisations
  ADD COLUMN IF NOT EXISTS ae_versement_liberatoire BOOLEAN NOT NULL DEFAULT FALSE,
  -- Franchise TVA = pas de TVA collectée tant qu'on est sous le seuil
  ADD COLUMN IF NOT EXISTS ae_vat_franchise BOOLEAN NOT NULL DEFAULT TRUE,

  -- SASU
  ADD COLUMN IF NOT EXISTS sasu_siren TEXT,
  -- TRUE = exercice 1er jan → 31 déc, FALSE = exercice décalé
  ADD COLUMN IF NOT EXISTS sasu_fiscal_year_calendar BOOLEAN NOT NULL DEFAULT TRUE,
  -- Mois de début d'exercice quand !calendar (1-12)
  ADD COLUMN IF NOT EXISTS sasu_fiscal_year_start_month SMALLINT,
  -- 'reel_mensuel' | 'reel_trimestriel' | 'simplifie'
  ADD COLUMN IF NOT EXISTS sasu_vat_regime TEXT,
  -- TVA intracommunautaire = facturation clients UE → DES obligatoire
  ADD COLUMN IF NOT EXISTS sasu_vat_intra_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- Le dirigeant se verse une rémunération → cotisations URSSAF
  -- assimilé salarié + DSN
  ADD COLUMN IF NOT EXISTS sasu_dirigeant_remunere BOOLEAN NOT NULL DEFAULT FALSE;

-- Garde-fou : si l'user dit qu'il a un exercice décalé, le mois de
-- début doit être renseigné et entre 1 et 12. Pas un check rigide
-- pour ne pas bloquer un user qui change d'avis en cours de saisie.
ALTER TABLE public.business_profiles
  ADD CONSTRAINT business_profiles_sasu_fiscal_month_range
    CHECK (
      sasu_fiscal_year_start_month IS NULL
      OR (sasu_fiscal_year_start_month BETWEEN 1 AND 12)
    );

COMMENT ON COLUMN public.business_profiles.accounting_status IS
  'Statut compta : particulier / auto_entrepreneur / sasu. NULL = non configuré.';
COMMENT ON COLUMN public.business_profiles.ae_activity_type IS
  'Pour auto_entrepreneur : vente / services_bic / services_bnc / mixte. Détermine les seuils TVA et taux URSSAF applicables.';
COMMENT ON COLUMN public.business_profiles.sasu_siren IS
  'SIREN à 9 chiffres de la SASU. Validation format côté zod, pas de check Luhn en DB.';
COMMENT ON COLUMN public.business_profiles.sasu_vat_regime IS
  'reel_mensuel (CA3 mensuelle) / reel_trimestriel (CA3 trimestrielle) / simplifie (CA12 annuelle + 2 acomptes).';
