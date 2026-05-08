-- Module Compta — étape 1c : connexions PSP + transactions normalisées
--
-- Architecture : on stocke une ligne par connexion PSP (Stripe pour
-- ce commit, Mollie/PayPal en 1d) et on dénormalise les transactions
-- de toutes les sources dans une table unique. Comme ça :
--   • Le dashboard CA et les jauges TVA queryent UNE table
--   • L'idempotence (provider, provider_transaction_id) fait que
--     ré-exécuter le sync 50 fois ne duplique pas les lignes
--   • Ajouter Mollie/PayPal plus tard ne touche pas au schéma
--
-- L'historique : à la première connexion d'un PSP, on déclenche un
-- sync initial qui remonte 24 mois en arrière. Pourquoi 24 mois et
-- pas seulement YTD ? Parce que les jauges franchise TVA tournent
-- sur 12 mois glissants, et qu'on veut afficher l'année N-1 pour
-- comparaison. Le sync delta quotidien ne re-tape ensuite que les
-- transactions depuis last_sync_at - 1h (overlap de sécurité).

-- ─────────────────────────────────────────────────────────────────
-- 1. payment_connections : 1 ligne par (user, project, provider)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  -- 'stripe' | 'mollie' | 'paypal' (extensible)
  provider TEXT NOT NULL,
  -- Clé API chiffrée via lib/crypto (AES-256-GCM, clé d'app)
  api_key_encrypted TEXT NOT NULL,
  -- Dernière sync réussie (NULL = jamais syncé)
  last_sync_at TIMESTAMPTZ,
  -- Sync initial (24 mois) terminé. Distingue "premier sync en cours"
  -- de "sync delta quotidien".
  initial_sync_done_at TIMESTAMPTZ,
  -- Erreur du dernier sync, pour afficher un état "déconnecté" dans la UI
  last_sync_error TEXT,
  -- Si l'user déconnecte, on garde la ligne pour l'historique mais
  -- on stoppe le cron. Soft-delete plutôt que DELETE pour pouvoir
  -- reconnecter en restaurant la même ligne.
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id, provider)
);

CREATE INDEX IF NOT EXISTS payment_connections_active_idx
  ON public.payment_connections(user_id, provider)
  WHERE disabled_at IS NULL;

ALTER TABLE public.payment_connections ENABLE ROW LEVEL SECURITY;

-- L'user voit uniquement ses propres connexions
CREATE POLICY "payment_connections_self_read"
  ON public.payment_connections FOR SELECT
  USING (auth.uid() = user_id);

-- Pas de write côté user — toujours via API server-side avec admin client.
-- (Les routes API utilisent supabaseAdmin pour bypass RLS sur les writes.)

-- ─────────────────────────────────────────────────────────────────
-- 2. transactions : ventes normalisées, toutes sources confondues
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  connection_id UUID REFERENCES public.payment_connections(id) ON DELETE SET NULL,
  -- Source de la ligne : 'stripe' | 'mollie' | 'paypal' | 'sio' |
  -- 'manual' (futur — pour les saisies hors PSP / virements)
  provider TEXT NOT NULL,
  -- ID natif chez le provider. Couplé à provider+user_id pour
  -- idempotence : on peut faire tourner le sync N fois sans dupliquer.
  provider_transaction_id TEXT NOT NULL,
  -- Montants en cents pour éviter les flottants. Currency en
  -- ISO 4217 (EUR, USD, GBP, …). Conversion EUR pour les jauges
  -- est faite à l'agrégation (taux du jour de paiement, phase 1f).
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  -- 'paid' | 'refunded' | 'partial_refund' | 'failed' | 'pending'
  status TEXT NOT NULL,
  -- Si remboursement, montant remboursé (peut être < amount = partiel)
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  -- Infos client si dispo — utile pour les exports comptables
  customer_email TEXT,
  customer_name TEXT,
  -- Description fournie par le provider ou nom du produit
  description TEXT,
  -- Date de paiement (pas de création — le statut paid_at vit avec
  -- la transaction, c'est la donnée comptable qui compte)
  paid_at TIMESTAMPTZ NOT NULL,
  refunded_at TIMESTAMPTZ,
  -- Métadonnées brutes du provider, au cas où on ait besoin de
  -- ré-extraire un champ plus tard sans re-sync.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Quand on a synchronisé cette ligne en dernier (utile pour debug)
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Idempotence : impossible d'insérer 2x la même charge Stripe
  UNIQUE (user_id, provider, provider_transaction_id)
);

CREATE INDEX IF NOT EXISTS transactions_user_paid_idx
  ON public.transactions(user_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS transactions_user_provider_paid_idx
  ON public.transactions(user_id, provider, paid_at DESC);
-- Note : pas d'index sur date_trunc('month', paid_at) — la fonction
-- n'est pas IMMUTABLE en Postgres. L'index (user_id, paid_at DESC)
-- couvre les agrégations par mois via range scan : un WHERE paid_at
-- BETWEEN '2026-01-01' AND '2026-02-01' utilise déjà l'index.

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions_self_read"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────
-- 3. manual_transactions : saisies hors PSP (virement / espèces / chèque)
-- ─────────────────────────────────────────────────────────────────
-- Table séparée parce que :
--   • Pas de sync à appliquer
--   • L'user les édite/supprime (vs les syncées qui sont read-only
--     pour la cohérence avec le PSP)
-- Le dashboard fait UNION transactions + manual_transactions pour
-- présenter une vue agrégée.
CREATE TABLE IF NOT EXISTS public.manual_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  -- 'virement' | 'especes' | 'cheque' | 'autre'
  source_label TEXT NOT NULL,
  customer_name TEXT,
  description TEXT,
  paid_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS manual_transactions_user_paid_idx
  ON public.manual_transactions(user_id, paid_at DESC);

ALTER TABLE public.manual_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_transactions_self_all"
  ON public.manual_transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────
-- Commentaires
-- ─────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.payment_connections IS
  'Connexions PSP de l''user (Stripe / Mollie / PayPal). Une ligne par (user, project, provider). Clé API chiffrée via lib/crypto.';
COMMENT ON TABLE public.transactions IS
  'Encaissements normalisés toutes sources. Idempotence via UNIQUE (user_id, provider, provider_transaction_id) — re-sync ne duplique pas.';
COMMENT ON TABLE public.manual_transactions IS
  'Saisies user pour les paiements hors PSP (virement, espèces, chèque). Éditables, contrairement aux transactions qui reflètent la source.';
