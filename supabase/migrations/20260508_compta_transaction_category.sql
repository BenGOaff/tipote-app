-- Module Compta — étape 1h : catégorisation ventes vs commissions affiliation
--
-- Pour distinguer les revenus business par nature :
--   • 'sale'      = vente directe d'une offre (par défaut)
--   • 'affiliate' = commission d'affiliation (paiement reçu d'une plateforme
--                   d'affiliation comme Systeme.io)
--   • 'other'     = autre revenu (frais, remboursement entrant, etc.)
--
-- Ça reste comptable comme du CA dans la jauge TVA (toutes les sommes
-- sont à déclarer pareil), mais le pilotage business est très différent —
-- on veut savoir "j'ai fait 3 000 € de ventes + 2 000 € de commissions"
-- pour comprendre ses leviers réels.
--
-- Détection auto au moment du sync via heuristique sur la description
-- (mots-clés "affiliation", "commission affilié", "systeme.io affiliate"…).
-- L'user peut surcharger manuellement via le form de saisie manuelle.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'sale';

ALTER TABLE public.manual_transactions
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'sale';

-- Index partiel pour les requêtes "trouve mes commissions" qui sont
-- une minorité — pas la peine d'indexer 'sale' qui est le défaut.
CREATE INDEX IF NOT EXISTS transactions_user_affiliate_idx
  ON public.transactions(user_id, paid_at DESC)
  WHERE category = 'affiliate';

CREATE INDEX IF NOT EXISTS manual_transactions_user_affiliate_idx
  ON public.manual_transactions(user_id, paid_at DESC)
  WHERE category = 'affiliate';

COMMENT ON COLUMN public.transactions.category IS
  'Nature du revenu : sale (vente directe — défaut), affiliate (commission affiliation), other.';
COMMENT ON COLUMN public.manual_transactions.category IS
  'Nature du revenu : sale (vente directe — défaut), affiliate (commission affiliation), other.';
