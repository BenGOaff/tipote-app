-- 20260804_quiz_structure_changed_at.sql
--
-- QUAND LA STRUCTURE DU QUIZ A CHANGÉ POUR LA DERNIÈRE FOIS.
--
-- Drame Jocelyne, 4 août 2026, dernière couche. Prouvé sur ses données :
-- dans une SEULE semaine et sur un seul quiz, 9 sessions ont atteint la
-- 9e question et 8 ont plafonné à la 8e. Les secondes n'ont pas
-- abandonné : la question n'existait plus quand elles sont passées. Le
-- funnel affichait pourtant une marche à cet endroit.
--
-- Généralisation : toute modification de structure fabrique une fausse
-- chute à l'endroit modifié, et elle persiste tant que les anciennes
-- sessions n'ont pas vieilli. Celui qui améliore son quiz voit donc une
-- chute apparaître là où il vient de travailler, ce qui l'envoie corriger
-- encore. Jocelyne a tourné trois semaines dans cette boucle.
--
-- POURQUOI UNE COLONNE ET PAS UN CALCUL. On aurait pu prendre
-- max(quiz_questions.created_at). Ça ne marche pas : une SUPPRESSION ne
-- change aucune date existante, et c'est justement ce que Jocelyne a fait.
-- Un déplacement non plus. Il faut donc un repère écrit au moment du
-- changement, par celui qui le fait.
--
-- NULL = inconnu, et c'est le défaut assumé. Un quiz jamais modifié depuis
-- ce déploiement garde NULL, la lecture retombe sur "depuis toujours",
-- donc exactement le comportement d'avant. Aucun écran ne se vide.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS structure_changed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.quizzes.structure_changed_at IS
  'Derniere modification de la LISTE des questions (ajout, suppression, deplacement). Reecrire un texte ne compte pas. Sert a ne pas melanger, dans un meme funnel, des sessions qui ont repondu a des versions differentes du quiz. NULL = inconnu, lecture depuis toujours.';

NOTIFY pgrst, 'reload schema';
