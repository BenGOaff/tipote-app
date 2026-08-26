-- 20260826_destination_atelier.sql
--
-- LE LIEN ATELIER DE L'ESPACE AFFILIÉ, REPOINTÉ EN BASE.
--
-- Béné, 26 août 2026 : "je ne vois toujours rien des nouveaux liens ni
-- nouveau système ni rien sur affiliate."
--
-- Elle a raison, et la cause est dans `getAllLinkDestinations()` : le
-- seed du code ne sert QUE de complément, les lignes de la base gagnent
-- toujours. C'est voulu (l'admin peut éditer un chemin sans déploiement)
-- et ça veut dire qu'un changement de destination écrit dans le code
-- n'arrive JAMAIS en production pour une destination qui existe déjà.
--
-- Le lien Atelier pointait donc encore sur le tunnel Systeme.io, avec un
-- `?ref=` que ni eux ni nous ne savons lire : il ne payait personne.
--
-- On ne touche QUE la ligne concernée, et seulement si elle porte encore
-- l'ancien chemin : rejouer cette migration après une modification faite
-- à la main dans l'admin écraserait le choix de Béné.

update public.affiliate_link_destinations
   set path = 'https://atelierduquiz.fr/'
 where slug = 'atelier'
   and path in ('/atelier-du-quiz', 'atelier-du-quiz');

notify pgrst, 'reload schema';
