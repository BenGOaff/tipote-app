-- Liens d'affiliation gérés par l'admin (Béné). Avant cette migration,
-- les paths étaient codés en dur dans app/affiliate/promouvoir/page.tsx,
-- ce qui obligeait un commit + deploy pour corriger une URL de page de
-- vente. Drame 8 juin 2026 : le path /tiquiz/affiliation n'existe pas
-- côté Systeme.io, le bon est /part-tiquiz. Les affiliés qui copiaient
-- le "lien principal" perdaient leur commission.
--
-- Schéma minimal : 1 row par destination (slug stable utilisé en code),
-- l'admin édite uniquement le `path` (label + description restent en
-- i18n, scoped sur la langue d'interface de l'affilié).
-- Accès : service role uniquement, RLS bloquée publique.

CREATE TABLE IF NOT EXISTS public.affiliate_link_destinations (
  slug text PRIMARY KEY,
  path text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.affiliate_link_destinations ENABLE ROW LEVEL SECURITY;

-- Seed avec les paths officiels (validés par Béné 8 juin 2026).
-- Note: les "plus" ont l'ordre des segments INVERSÉ côté Systeme.io
-- (tiquiz-mensuel-plus-part au lieu de part-tiquiz-mensuel-plus). On
-- copie la convention exacte du back-office sales, sinon le tag ne
-- pointe pas et l'affilié perd sa commission.
--
-- Tipote n'est PAS en vente : AUCUN lien Tipote ici. On ne propose que
-- les destinations Tiquiz aux affiliés.
INSERT INTO public.affiliate_link_destinations (slug, path, sort_order, enabled)
VALUES
  ('tiquiz_main',         '/part-tiquiz',                10, true),
  ('tiquiz_free',         '/part-tiquiz-gratuit',        20, true),
  ('tiquiz_monthly',      '/part-tiquiz-mensuel',        30, true),
  ('tiquiz_monthly_plus', '/tiquiz-mensuel-plus-part',   40, true),
  ('tiquiz_yearly',       '/part-tiquiz-annuel',         50, true),
  ('tiquiz_yearly_plus',  '/tiquiz-annuel-plus-part',    60, true)
ON CONFLICT (slug) DO NOTHING;

-- Garde-fou : si une version anterieure de ce seed avait insere les
-- liens Tipote (tipote_main / tipote_order), on les retire. Tipote
-- n'est pas en vente, ces destinations ne doivent jamais apparaitre.
DELETE FROM public.affiliate_link_destinations
WHERE slug IN ('tipote_main', 'tipote_order');

NOTIFY pgrst, 'reload schema';
