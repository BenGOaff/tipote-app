-- Ajoute L'Atelier du Quiz (formation, commission 70%) aux destinations
-- de liens d'affiliation. Tunnel affilié Systeme.io :
-- https://www.tipote.fr/atelier-du-quiz (path relatif au marché FR).
--
-- L'Atelier n'est vendu qu'en français : la page Promouvoir filtre ce
-- slug hors du marché FR (cf. app/affiliate/promouvoir/page.tsx). On
-- l'insère donc activé, le gating marché se fait côté app.
--
-- sort_order 5 = en tête de liste (c'est la commission la plus élevée).
-- Idempotent (ON CONFLICT DO NOTHING) : ne réécrit pas un path déjà
-- personnalisé par Béné depuis /affiliate/admin/links.

INSERT INTO public.affiliate_link_destinations (slug, path, sort_order, enabled)
VALUES
  ('atelier', '/atelier-du-quiz', 5, true)
ON CONFLICT (slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';
