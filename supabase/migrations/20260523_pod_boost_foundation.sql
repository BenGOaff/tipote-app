-- 20260523_pod_boost_foundation.sql
-- Tipote Boost (Béné, 19 mai 2026) — foundation des "pods d'engagement"
-- type Kawaak pour LinkedIn d'abord, étendu à Meta/X plus tard (R&D).
--
-- Principe : les membres opt-in à un pod, leurs publications déclenchent
-- des tâches d'engagement (like + commentaire IA validé en 1-click) chez
-- les autres pod-mates. Auto-like + validation du commentaire dans l'ex-
-- tension Chrome — pas de spam aux users via notifs externes.
--
-- Cette migration pose les 6 tables + 1 pod public FR seed. Pas encore
-- de logique côté API ni d'extension — c'est juste le schéma.

-- 1. Pods (groupes thématiques + global FR pour v1)
create table if not exists pods (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  -- Code ISO 639-1, sert au matching auteur/engageur quand l'extension
  -- détecte la langue d'un post.
  language text not null,
  -- Tags thématiques (marketing, saas, coaching, …) pour le matching v2.
  -- Tableau vide = pod généraliste (pod FR seed).
  domain_tags text[] not null default '{}',
  is_public boolean not null default true,
  member_count int not null default 0,
  created_at timestamptz not null default now()
);

-- Pod FR seed pour le v1. Tous les nouveaux users connectant leur Linked-
-- In avec une langue 'fr' sont auto-joinés ici.
insert into pods (slug, name, description, language, is_public)
values ('fr-global', 'Pod FR — Tous domaines',
        'Pod francophone par défaut. Sera segmenté par thématique quand le volume le permettra.',
        'fr', true)
on conflict (slug) do nothing;

-- 2. Profil LinkedIn lié au compte Tipote (matching Tipote ↔ LinkedIn).
-- L'extension envoie le URN LinkedIn du user authentifié au backend après
-- onboarding, pour qu'on sache à qui appartient chaque post détecté.
create table if not exists pod_linkedin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- URN au format LinkedIn (`urn:li:person:abc123`). Unique : un compte
  -- LinkedIn ne peut être rattaché qu'à un seul user Tipote.
  linkedin_urn text unique not null,
  full_name text,
  headline text,
  profile_url text,
  -- Langue déduite du profil (heuristique côté extension : langue de
  -- l'interface LinkedIn + langue des 10 derniers posts).
  language_detected text,
  domain_tags text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

-- 3. Membres de pods (M2M)
create table if not exists pod_memberships (
  id uuid primary key default gen_random_uuid(),
  pod_id uuid not null references pods(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  -- 'paused' = ne reçoit/ne donne plus de boosts, mais reste dans le pod.
  -- 'kicked' = exclu par un admin (freeloader chronique, abus…).
  status text not null default 'active' check (status in ('active', 'paused', 'kicked')),
  joined_at timestamptz not null default now(),
  unique (pod_id, user_id)
);

create index if not exists idx_pod_memberships_user on pod_memberships (user_id);
create index if not exists idx_pod_memberships_pod_active
  on pod_memberships (pod_id) where status = 'active';

-- 4. Publications détectées par l'extension de l'auteur.
-- L'auteur publie sur LinkedIn → son extension détecte (DOM event +
-- confirmation Voyager) → POST /api/pod/posts → row inséré ici → fan-out
-- vers les pod-mates.
create table if not exists pod_posts (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  -- URN LinkedIn du post (urn:li:activity:xxx ou urn:li:share:xxx).
  linkedin_post_urn text not null,
  post_url text,
  -- Premier ~500 chars du contenu, suffisant pour la génération IA des
  -- commentaires sans stocker tout le post.
  content_excerpt text,
  language text,
  detected_at timestamptz not null default now(),
  -- Au-delà de 6h, l'algo LinkedIn a déjà décidé du sort du post —
  -- inutile de le booster. Les tâches restantes passent en 'expired'.
  eligible_until timestamptz not null default now() + interval '6 hours',
  unique (linkedin_post_urn)
);

create index if not exists idx_pod_posts_author on pod_posts (author_user_id);
-- Index sur eligible_until pour le scan rapide "tâches encore actives".
-- On NE met PAS de WHERE eligible_until > now() ici : now() n'est pas
-- IMMUTABLE et Postgres rejette les fonctions non-IMMUTABLE dans le
-- predicate d'un index partiel (erreur 42P17). Le filtre temporel se
-- fait au niveau requête (cf. /api/pod/tasks/pending). Coût négligeable
-- vu le volume attendu de pod_posts.
create index if not exists idx_pod_posts_eligible
  on pod_posts (eligible_until);

-- 5. Tâches d'engagement assignées à des pod-mates.
-- Une row = un (post auteur, engageur). Le backend en crée N par post
-- selon les règles de matching + throttling.
create table if not exists pod_engagement_tasks (
  id uuid primary key default gen_random_uuid(),
  pod_post_id uuid not null references pod_posts(id) on delete cascade,
  pod_id uuid not null references pods(id) on delete cascade,
  assigned_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in (
    'pending',   -- en attente d'action côté extension
    'liked',     -- like ok, commentaire en attente de validation
    'commented', -- commentaire posté, en attente de re-check Voyager
    'completed', -- like + commentaire confirmés par re-check
    'expired',   -- passé eligible_until sans action
    'declined',  -- user a cliqué "pas pertinent"
    'failed'     -- erreur API Voyager (429, captcha, etc.)
  )),
  -- 4 propositions de commentaires pré-générées par l'IA, indexées par
  -- ton : { agree, disagree, add_value, ask_question }. User en choisit
  -- une dans l'extension, peut éditer avant envoi.
  ai_comment_suggestions jsonb,
  selected_tone text check (selected_tone in (
    'agree', 'disagree', 'add_value', 'ask_question'
  )),
  posted_comment_text text, -- texte FINAL envoyé (après édition éventuelle)
  liked_at timestamptz,
  commented_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_tasks_assigned_pending
  on pod_engagement_tasks (assigned_user_id, status) where status = 'pending';
create index if not exists idx_tasks_post on pod_engagement_tasks (pod_post_id);

-- 6. Karma — ratio donné/reçu pour anti-freeloader. Quota hebdo qui dé-
-- gringole si on ne rend pas ses boosts, pour rester dans un système
-- mutuel équilibré.
create table if not exists pod_karma (
  user_id uuid primary key references auth.users(id) on delete cascade,
  boosts_given int not null default 0,
  boosts_received int not null default 0,
  weekly_quota int not null default 50,
  current_week_given int not null default 0,
  current_week_received int not null default 0,
  week_start date not null default current_date,
  updated_at timestamptz not null default now()
);

-- ─── RLS ─────────────────────────────────────────────────────────────
-- Toutes les écritures passent par les API routes (service role),
-- donc les policies sont read-only et restreintes au propriétaire.

alter table pods enable row level security;
alter table pod_linkedin_profiles enable row level security;
alter table pod_memberships enable row level security;
alter table pod_posts enable row level security;
alter table pod_engagement_tasks enable row level security;
alter table pod_karma enable row level security;

drop policy if exists "pods_read_public" on pods;
create policy "pods_read_public" on pods for select to authenticated using (is_public = true);

drop policy if exists "linkedin_profiles_own" on pod_linkedin_profiles;
create policy "linkedin_profiles_own" on pod_linkedin_profiles for select to authenticated using (auth.uid() = user_id);

drop policy if exists "memberships_own" on pod_memberships;
create policy "memberships_own" on pod_memberships for select to authenticated using (auth.uid() = user_id);

drop policy if exists "posts_own" on pod_posts;
create policy "posts_own" on pod_posts for select to authenticated using (auth.uid() = author_user_id);

-- Tâches : visibles à l'engageur ET à l'auteur du post sous-jacent
-- (l'auteur voit qui l'a boosté dans son dashboard).
drop policy if exists "tasks_own" on pod_engagement_tasks;
create policy "tasks_own" on pod_engagement_tasks for select to authenticated using (
  auth.uid() = assigned_user_id
  or auth.uid() in (select author_user_id from pod_posts where id = pod_post_id)
);

drop policy if exists "karma_own" on pod_karma;
create policy "karma_own" on pod_karma for select to authenticated using (auth.uid() = user_id);

notify pgrst, 'reload schema';
