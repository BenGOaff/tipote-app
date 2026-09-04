-- 20260903_generateurs_reprise.sql
--
-- ON PEUT REPRENDRE UN CONTENU LÀ OÙ ON L'A LAISSÉ (Béné, 3 septembre).
--
-- "Au final je veux exactement la même chose sur l'atelier et sur
-- tiquiz. Pareil. Ni plus, ni moins." Puis, sur le seul écart qui
-- restait : "oui fais la migration."
--
-- -- CE QUI MANQUAIT, ET CE QUE ÇA COÛTAIT ----------------------------
--
-- `generateur_contenus` gardait les MORCEAUX depuis le 2 septembre, donc
-- plus rien n'était perdu à un rafraîchissement. Mais elle ne gardait
-- pas de quoi CONTINUER : ni le brief (le plan, le déclenchement, les
-- offres), ni les pistes proposées, ni celle qui a été choisie.
--
-- Conséquence : `/generateurs/mes-contenus` LISAIT le travail sans
-- pouvoir le reprendre. Corriger un email, en générer un sixième, ou
-- écrire le contenu du 3e profil demandait de tout resaisir et de
-- REPAYER les pistes. Le labo de l'Atelier rouvre un bonus depuis le
-- 6 août (`bonus_projects`), et c'est ce qu'on aligne ici.
--
-- -- POURQUOI ON ÉTEND LA TABLE AU LIEU D'EN AJOUTER UNE --------------
--
-- Une deuxième table donnerait DEUX bibliothèques pour la même chose,
-- et c'est exactement la divergence que ce dépôt paie en boucle depuis
-- juin (deux files de tickets, deux registres d'affiliés, deux rendus
-- markdown). La ligne EST le projet : elle porte déjà le générateur, le
-- quiz, son titre recopié et les morceaux.
--
-- -- FORMAT LIBRE, VOLONTAIREMENT -------------------------------------
--
-- Même choix que `bonus_projects` chez lui : ajouter un champ au brief
-- ne doit pas demander une migration. Le nettoyage et les bornes vivent
-- dans `lib/generateurs/projet.ts`, en fonctions pures et testées, parce
-- qu'un JSONB libre sans garde est une porte ouverte.
--
--   brief  : { plan, declencheur, offres[] }
--   pistes : les pistes proposées, telles qu'elles ont été montrées
--   piste  : celle qui a été choisie (titre, format, punchline, pieces)
--
-- -- AUCUNE LIGNE EXISTANTE NE BOUGE ----------------------------------
--
-- Les trois colonnes ont un défaut. Un contenu écrit avant aujourd'hui
-- se relit exactement comme avant, et il s'affiche dans la bibliothèque
-- comme avant : il ne se REPREND simplement pas, et l'écran le dit au
-- lieu de proposer un bouton qui échouerait.

alter table public.generateur_contenus
  add column if not exists brief  jsonb not null default '{}'::jsonb;

alter table public.generateur_contenus
  add column if not exists pistes jsonb not null default '[]'::jsonb;

alter table public.generateur_contenus
  add column if not exists piste  jsonb;

-- PostgREST garde son schéma en cache : sans ça, la première écriture
-- après le déploiement échoue sur une colonne "inconnue" alors qu'elle
-- existe (drame `quiz_events.meta`, 15 jours de statistiques perdues).
notify pgrst, 'reload schema';
