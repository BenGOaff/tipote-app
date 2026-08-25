-- 20260825_partage_quiz.sql
--
-- PARTAGER UN QUIZ ENTIER, COMME ON PARTAGE UN TUNNEL DANS SYSTEME.IO.
--
-- Béné, 25 août 2026 : "je voudrais pouvoir lui envoyer son quiz en mode
-- 'un clic et le quiz est installé chez moi' avec les textes, les images,
-- les points etc..."
--
-- Une ligne = un LIEN de partage. Le quiz n'est pas déplacé, il n'est pas
-- publié, il n'est pas modifié : le lien donne le droit d'en fabriquer
-- une COPIE dans un autre compte. Le quiz d'origine ne bouge jamais.
--
-- Pourquoi une table et pas un simple drapeau sur `quizzes` :
--   - on veut pouvoir RÉVOQUER un lien sans toucher au quiz ;
--   - on veut savoir COMBIEN de fois il a été installé (un lien envoyé à
--     un prospect qui n'installe jamais est une information) ;
--   - on veut pouvoir en avoir plusieurs, un par destinataire, et couper
--     celui d'un seul sans couper les autres.

create table if not exists public.quiz_shares (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  -- Le propriétaire au moment de la création. On le stocke pour que la
  -- révocation et la liste n'aient pas à re-joindre `quizzes`.
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- 32 caractères hexadécimaux tirés au hasard (lib/quiz/partage.ts).
  -- Ce jeton donne le droit d'installer : il ne se devine pas.
  token text not null unique,
  -- Le libellé que l'expéditeur se donne à lui même ("pour Sophie").
  -- Il n'est JAMAIS montré à celui qui reçoit le lien.
  label text,
  enabled boolean not null default true,
  expires_at timestamptz,
  -- NULL ou 0 = sans limite. Un lien envoyé à une seule personne se
  -- ferme tout seul à 1 : c'est la protection contre le lien qui
  -- circule plus loin que prévu.
  max_installs integer,
  installs_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_install_at timestamptz
);

create index if not exists quiz_shares_quiz_idx on public.quiz_shares(quiz_id);
create index if not exists quiz_shares_owner_idx on public.quiz_shares(owner_id);

alter table public.quiz_shares enable row level security;

-- Le propriétaire gère ses liens. La LECTURE par le destinataire ne
-- passe pas par ici : elle se fait côté serveur, avec la clé de service,
-- parce que celui qui reçoit le lien n'a aucun droit sur ce quiz et ne
-- doit surtout pas en gagner un.
drop policy if exists "quiz_shares: owner reads" on public.quiz_shares;
create policy "quiz_shares: owner reads"
  on public.quiz_shares for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "quiz_shares: owner writes" on public.quiz_shares;
create policy "quiz_shares: owner writes"
  on public.quiz_shares for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "quiz_shares: owner updates" on public.quiz_shares;
create policy "quiz_shares: owner updates"
  on public.quiz_shares for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "quiz_shares: owner deletes" on public.quiz_shares;
create policy "quiz_shares: owner deletes"
  on public.quiz_shares for delete
  to authenticated
  using (owner_id = auth.uid());

comment on table public.quiz_shares is
  'Liens de partage d''un quiz vers un autre compte. Le lien fabrique une COPIE ; le quiz d''origine n''est jamais modifie ni transfere.';

notify pgrst, 'reload schema';
