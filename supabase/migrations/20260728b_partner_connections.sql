-- 20260728b_partner_connections.sql
-- Pont cross-app : permet a L'Atelier du Quiz (formaquiz) de lire, en
-- lecture seule, les metriques agregees d'un compte Tipote, apres
-- consentement explicite de l'utilisateur (flux OAuth-leger). Miroir du
-- pont deja en prod cote Tiquiz (migration 20260617 la-bas) : les eleves
-- de l'Atelier dont le quiz vit sur Tipote (retour Maurice, 28 juillet
-- 2026) beneficient du meme suivi que ceux sur Tiquiz.
--
-- Deux tables internes, accessibles UNIQUEMENT via la service_role
-- (RLS activee, aucune policy) :
--   partner_auth_codes  : codes a usage unique (echange contre un token)
--   partner_connections : tokens durables (lecture des metriques)
--
-- Aucune donnee perso ici : juste des hash de jetons + le user_id Tipote.

create table if not exists partner_auth_codes (
  id          uuid primary key default gen_random_uuid(),
  code_hash   text not null unique,
  user_id     uuid not null references auth.users(id) on delete cascade,
  partner     text not null default 'formaquiz',
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists partner_connections (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,
  user_id      uuid not null references auth.users(id) on delete cascade,
  partner      text not null default 'formaquiz',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists idx_partner_connections_user on partner_connections (user_id);

alter table partner_auth_codes enable row level security;
alter table partner_connections enable row level security;
-- Pas de policy : tables internes, accessibles seulement via service_role.

-- Comptage des leads par quiz agrege DANS la base (sans plafond de 1000
-- lignes cote client). Meme forme que stats_leads_counts cote Tiquiz.
create or replace function partner_leads_counts(
  p_quiz_ids uuid[]
)
returns table(quiz_id uuid, n bigint)
language sql
stable
as $$
  select quiz_id, count(*)::bigint as n
  from quiz_leads
  where quiz_id = any(p_quiz_ids)
  group by 1;
$$;

notify pgrst, 'reload schema';
