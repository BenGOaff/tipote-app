-- 20260803_quiz_tie_break.sql
--
-- COMMENT UN QUIZ DE PROFILS TRANCHE UNE ÉGALITÉ.
--
-- Béné, 3 août 2026 : "le scoring du quiz par profil me parait assez
-- aléatoire (...) faudrait vraiment pouvoir supprimer cette histoire
-- d'ex-æquo, c'est chiant à mourir."
--
-- Jusqu'ici, une égalité se tranchait par l'ORDRE D'AFFICHAGE des
-- profils : le viewer comparait en `>` strict, donc le premier profil de
-- la liste gagnait toujours. Ce n'était pas un choix de conception,
-- c'était un effet de bord de la boucle. Vu du visiteur : il répond
-- autrement et obtient le même profil. Vu de la créatrice : un bandeau
-- rouge permanent, et aucune façon de le faire taire.
--
-- 'answers' fait dépendre le départage des RÉPONSES du visiteur : le
-- profil choisi le plus souvent, puis le plus franchement, puis le plus
-- récemment. Cf. lib/quiz/profileWinner.ts pour la chaîne complète et
-- pour la raison mathématique qui interdit de "supprimer" les ex-æquo
-- en redistribuant les points.
--
-- CE QUI GARANTIT QUE RIEN NE BOUGE POUR LES QUIZ EXISTANTS :
-- le défaut est 'first', et le code ne bascule que sur la valeur
-- EXPLICITE 'answers'. Colonne absente, valeur inconnue, migration pas
-- encore passée : comportement d'avant, au caractère près. Les quiz
-- créés à partir d'aujourd'hui naissent en 'answers', et l'éditeur
-- propose la bascule aux autres, réversible.

alter table public.quizzes
  add column if not exists tie_break text not null default 'first';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quizzes_tie_break_check'
  ) then
    alter table public.quizzes
      add constraint quizzes_tie_break_check
      check (tie_break in ('first', 'answers'));
  end if;
end $$;

comment on column public.quizzes.tie_break is
  'Mode profils : comment departager une egalite. first = ordre des profils (historique), answers = a partir des reponses du visiteur.';

notify pgrst, 'reload schema';
