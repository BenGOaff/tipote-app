-- Module Compta — phase 1k : achats / charges + TVA déductible
--
-- Pour calculer la VRAIE TVA à payer (collectée - déductible) il
-- faut tracker les achats avec leur TVA. Pour MVP : saisie manuelle
-- uniquement (pas d'OCR), même pattern que `manual_transactions`
-- côté ventes. L'OCR sur facture uploadée arrivera en phase 1l.
--
-- Bonus inclus : colonne `ae_vat_regime` pour les auto-entrepreneurs
-- qui ont DÉPASSÉ le seuil de franchise TVA (ae_vat_franchise=false)
-- et basculent donc sur réel mensuel/trimestriel/simplifié. C'est ce
-- qui permet au calendrier fiscal d'afficher leurs CA3.

-- ─────────────────────────────────────────────────────────────────
-- 1. ae_vat_regime — pour les AE hors franchise
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS ae_vat_regime TEXT;

ALTER TABLE public.business_profiles
  ADD CONSTRAINT business_profiles_ae_vat_regime_check
    CHECK (
      ae_vat_regime IS NULL
      OR ae_vat_regime IN ('reel_mensuel', 'reel_trimestriel', 'simplifie')
    );

COMMENT ON COLUMN public.business_profiles.ae_vat_regime IS
  'Auto-entrepreneur ayant dépassé le seuil de franchise TVA : régime réel mensuel / trimestriel / simplifié. NULL si toujours en franchise (cas par défaut).';

-- ─────────────────────────────────────────────────────────────────
-- 2. expense_items — saisies des achats / charges pro
-- ─────────────────────────────────────────────────────────────────
-- Table miroir de manual_transactions mais côté charges :
--   • montant TTC stocké en cents
--   • taux TVA (0 / 2.1 / 5.5 / 10 / 20%) — les 5 taux français
--   • montant TVA déductible calculé côté app puis stocké pour
--     éviter les recalculs à l'agrégation
--   • catégorie = nature de la charge (sert à mapper vers le bon
--     compte 6XX dans le FEC)
CREATE TABLE IF NOT EXISTS public.expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  -- Montant TTC en cents (toujours positif).
  amount_ttc_cents INTEGER NOT NULL CHECK (amount_ttc_cents > 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  -- Taux TVA français (en %). 0 si exonéré / hors champ.
  vat_rate NUMERIC(4,2) NOT NULL DEFAULT 20.00
    CHECK (vat_rate IN (0, 2.1, 5.5, 10, 20)),
  -- TVA déductible en cents (calculé app-side : TTC * rate / (100 + rate)).
  -- Stocké pour que les requêtes d'agrégation soient simples.
  vat_deductible_cents INTEGER NOT NULL DEFAULT 0
    CHECK (vat_deductible_cents >= 0),
  vendor_name TEXT,
  description TEXT,
  -- Catégorie : 'achats' | 'services' | 'fournitures' | 'deplacements'
  -- | 'logiciels' | 'loyer' | 'communication' | 'marketing' | 'formation'
  -- | 'autre'. Pas d'ENUM pour rester souple, validation côté zod.
  category TEXT NOT NULL DEFAULT 'autre',
  paid_at DATE NOT NULL,
  -- URL du justificatif (PDF/image) — pas utilisé en phase 1k mais
  -- en place pour la phase 1l (OCR sur upload). Stockage prévu sur
  -- le bucket `compta-receipts` qui sera créé plus tard.
  receipt_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expense_items_user_paid_idx
  ON public.expense_items(user_id, paid_at DESC);

ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_items_self_all"
  ON public.expense_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.expense_items IS
  'Achats / charges saisis par l''user pour calculer la TVA déductible et nourrir le FEC. Phase 1k du module Compta. Saisie manuelle uniquement pour MVP (l''OCR PDF/image arrivera en phase 1l).';
