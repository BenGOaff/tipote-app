-- Masquer completement le pied de page "offert par Tipote" sur le quiz public
-- (plans payants). Le gate est cote serveur : app/api/quiz/[quizId]/public ne
-- renvoie hide_branding = true que si le plan du proprietaire n'est pas free.
alter table public.quizzes
  add column if not exists hide_branding boolean not null default false;

notify pgrst, 'reload schema';
