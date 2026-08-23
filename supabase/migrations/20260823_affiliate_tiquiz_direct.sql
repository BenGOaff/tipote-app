-- Le bon de commande Tiquiz sur NOTRE domaine, comme destination
-- d'affiliation (23 août 2026).
--
-- POURQUOI : jusqu'ici toutes les destinations pointaient vers des
-- tunnels Systeme.io (/part-tiquiz, /part-tiquiz-mensuel...). Ces
-- tunnels commissionnent très bien, mais tout ce qu'on ajoute à l'URL
-- meurt chez Systeme.io : leur page ne nous transmet rien.
--
-- Or le mois offert (Béné, 23 août : "passe par mon lien et reçois un
-- mois offert") repose sur un marqueur `mo=1` ajouté par
-- `buildAffiliateLink()`. Il ne peut être lu que si le visiteur
-- atterrit sur un de NOS domaines. D'où cette destination, et d'où le
-- fait qu'elle soit la SEULE à ouvrir le cadeau.
--
-- Les anciennes destinations restent en place et restent valides :
-- c'est le cadeau qui est réservé, pas la vente.

INSERT INTO public.affiliate_link_destinations (slug, path, sort_order, enabled)
VALUES ('tiquiz_direct', 'https://tiquiz.fr/', 8, true)
ON CONFLICT (slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';
