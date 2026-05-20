-- 20260519_quiz_intro_image.sql
-- Image dédiée à la PAGE D'INTRO du quiz et du sondage (Hugo via Béné,
-- 19 mai 2026 : "je ne peut pas upload d'image dans la sub headline
-- avant de démarrer le quiz"). Même pattern que `quiz_results.image_url`
-- + `image_position` (migration 20260519_quiz_results_image.sql) :
-- 2 colonnes dédiées pour positionner l'image en drag-and-drop entre
-- 4 slots logiques (top, after_title, after_intro, bottom).
--
-- Quizzes ET sondages partagent la même table `quizzes` (discriminés par
-- la colonne `mode`), donc la feature est dispo pour les deux d'un coup.
--
-- Stockage : bucket public-assets, path `quiz-intro/<auth.uid()>/…`
-- conformément à la convention `<topic>/<auth.uid()>/<file>`.

alter table public.quizzes
  add column if not exists intro_image_url text;

alter table public.quizzes
  add column if not exists intro_image_position text;

update public.quizzes
  set intro_image_position = 'top'
  where intro_image_url is not null and intro_image_position is null;

notify pgrst, 'reload schema';
