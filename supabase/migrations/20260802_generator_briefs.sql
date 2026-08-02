-- 20260802_generator_briefs.sql
--
-- Brief d'écriture retenu d'une génération à la suivante.
--
-- Demande Christelle (2 août 2026) : "je voudrais que les infos
-- complétées pour générer un contenu soient persistantes, pour ne pas
-- avoir à tout réécrire quand je veux rédiger un mail, un post et un
-- article sur le même thème."
--
-- Une ligne par (utilisateur, scope). Le scope isole les générateurs :
--   'content'           -> le générateur de contenu (app/create)
--   'affiliate:tiquiz'  -> l'atelier d'écriture affilié, dossier Tiquiz
--   'affiliate:atelier' -> idem, dossier Atelier du Quiz
-- Ils ne parlent pas de la même chose, ils ne partagent pas leur brief.
--
-- `brief` est un JSONB de champs texte (audience, subject, angle, tone,
-- goal, prompt, tags). Format libre côté base VOLONTAIREMENT : ajouter
-- un champ à un générateur ne doit pas demander une migration. Le
-- nettoyage et la liste des champs connus vivent dans
-- lib/generatorBrief.ts, testé.

create table if not exists public.generator_briefs (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  scope      text        not null,
  brief      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, scope)
);

alter table public.generator_briefs enable row level security;

-- Chacun ne voit et n'écrit que ses propres briefs.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'generator_briefs'
      and policyname = 'generator_briefs_own_select'
  ) then
    create policy generator_briefs_own_select on public.generator_briefs
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'generator_briefs'
      and policyname = 'generator_briefs_own_insert'
  ) then
    create policy generator_briefs_own_insert on public.generator_briefs
      for insert with check (auth.uid() = user_id);
  end if;

  -- L'UPDATE est indispensable : l'écriture est un upsert, et sans
  -- politique UPDATE le deuxième enregistrement échoue en silence.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'generator_briefs'
      and policyname = 'generator_briefs_own_update'
  ) then
    create policy generator_briefs_own_update on public.generator_briefs
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'generator_briefs'
      and policyname = 'generator_briefs_own_delete'
  ) then
    create policy generator_briefs_own_delete on public.generator_briefs
      for delete using (auth.uid() = user_id);
  end if;
end $$;

notify pgrst, 'reload schema';
