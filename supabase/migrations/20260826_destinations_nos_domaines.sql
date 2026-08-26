-- 20260826_destinations_nos_domaines.sql
--
-- TOUTES LES DESTINATIONS AFFILIÉES ATTERRISSENT CHEZ NOUS.
--
-- Béné, 26 août 2026, capture d'écran de son propre espace affilié à
-- l'appui : "tu me sors que affiliate est à jour alors que tu sers
-- encore l'url de systeme au lieu de NOTRE page avec NOTRE système
-- d'affiliation. Nos pages de vente elles servent à quoi ?"
--
-- Elle a raison, et j'avais tort de dire que c'était à jour.
--
-- -- POURQUOI LE CODE NE SUFFISAIT PAS ---------------------------------
--
-- `getAllLinkDestinations()` ne fait que COMPLÉTER la base avec les
-- slugs qu'elle ne contient pas : **les lignes de la base gagnent
-- toujours**. C'est voulu (l'admin peut corriger un chemin sans
-- déploiement), et ça veut dire qu'une destination déjà présente ne
-- bouge JAMAIS depuis le seed.
--
-- Les chemins de la base datent du 8 juin, quand tout passait par les
-- tunnels Systeme.io. Le seed a été réécrit le 25 août, la base non.
-- Chaque affilié copiait donc un lien vers `tipote.fr`, qui ne nous
-- transmet pas le `?ref=` : la vente partait, et personne n'était payé.
--
-- La migration précédente (`20260826_destination_atelier.sql`) ne
-- traitait que l'Atelier. C'était la moitié du problème : les six
-- autres avaient exactement le même défaut.
--
-- -- CE QU'ON NE TOUCHE PAS ---------------------------------------------
--
-- `tiquiz_free` reste chez Systeme.io, et c'est délibéré : son
-- formulaire crée le contact et pose le tag chez eux, et c'est le seul
-- événement qui porte une URL de tunnel, donc le seul qui sait d'où
-- vient l'inscrit. Le remplacer ferait disparaître ces inscrits des
-- séquences email.

update public.affiliate_link_destinations set path = 'https://atelierduquiz.fr/'                where slug = 'atelier'             and path not like 'https://%';
update public.affiliate_link_destinations set path = 'https://tiquiz.fr/'                       where slug = 'tiquiz_main'         and path not like 'https://%';
update public.affiliate_link_destinations set path = 'https://tiquiz.fr/'                       where slug = 'tiquiz_direct'       and path not like 'https://%';
update public.affiliate_link_destinations set path = 'https://tiquiz.fr/commande/mensuel'       where slug = 'tiquiz_monthly'      and path not like 'https://%';
update public.affiliate_link_destinations set path = 'https://tiquiz.fr/commande/mensuel-plus'  where slug = 'tiquiz_monthly_plus' and path not like 'https://%';
update public.affiliate_link_destinations set path = 'https://tiquiz.fr/commande/annuel'        where slug = 'tiquiz_yearly'       and path not like 'https://%';
update public.affiliate_link_destinations set path = 'https://tiquiz.fr/commande/annuel-plus'   where slug = 'tiquiz_yearly_plus'  and path not like 'https://%';

-- `path not like 'https://%'` : on ne touche QUE les chemins relatifs,
-- c'est à dire ceux qui partent sur le domaine de vente Systeme.io. Une
-- URL absolue déjà posée à la main dans l'admin est un choix de Béné, et
-- rejouer cette migration ne doit pas l'écraser.

notify pgrst, 'reload schema';
