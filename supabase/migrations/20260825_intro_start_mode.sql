-- 20260825_intro_start_mode.sql
--
-- PAR QUOI LE VISITEUR COMMENCE (demande Béné, 25 août 2026).
--
-- "J'aimerais proposer de commencer le quiz direct par une question, au
-- lieu du CTA commencer le quiz. Par exemple : demander le prénom ou
-- poser une question OUI NON : un truc qui engage vraiment dès le
-- départ, en dessous du titre et de la description."
--
-- RÈGLE ABSOLUE : AUCUN QUIZ EXISTANT NE BOUGE.
--
-- Le défaut est 'button', qui rend l'écran d'accueil exactement comme
-- aujourd'hui. Et côté code, `resolveIntroStart()` ne renvoie autre
-- chose que 'button' que sur une valeur EXPLICITEMENT reconnue : colonne
-- absente, valeur nulle, mot inconnu, tout retombe sur le bouton. Tant
-- que cette migration n'est pas appliquée, la colonne arrive `undefined`
-- pour tous les quiz du monde, et c'est un cas testé.
--
-- ET LE SELECT PUBLIC NE PEUT PAS CASSER. `intro_start_mode` est ajouté
-- à QUIZ_COLS_NEW, la liste que la route publique tente d'abord et
-- ABANDONNE si PostgREST la refuse. Sans ce repli, un déploiement en
-- avance sur la migration ferait répondre 404 à TOUS les quiz publics :
-- c'est exactement ce qui est arrivé le 2 juin avec survey_thanks_*, et
-- l'app est restée offline deux heures.
--
-- LES TROIS VALEURS :
--   'button'      le bouton "Commencer le quiz" (défaut, comportement actuel)
--   'personalize' le champ prénom (et le genre s'il est demandé)
--   'question'    la première question, l'accueil et la question 1 ne
--                 font plus qu'un seul écran
--
-- Pas de contrainte CHECK, et c'est volontaire : une valeur inattendue
-- doit dégrader vers le bouton, pas faire échouer la sauvegarde d'une
-- créatrice. La validation vit dans `resolveIntroStart()`, qui est testé.

alter table public.quizzes
  add column if not exists intro_start_mode text not null default 'button';

comment on column public.quizzes.intro_start_mode is
  'Ce qui remplace le bouton Commencer sous le titre : button (defaut) | personalize | question. Lu par lib/quiz/introStart.ts, qui degrade vers button sur toute valeur inconnue.';

notify pgrst, 'reload schema';
