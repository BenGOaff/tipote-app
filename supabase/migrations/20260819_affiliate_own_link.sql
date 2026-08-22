-- 20260819_affiliate_own_link.sql
--
-- PHASE 0 DU PROGRAMME D'AFFILIATION MAISON : le lien nous appartient.
--
-- Aujourd'hui le lien affilié est `?sa=sa00168442b3f...`, illisible et
-- posé par un bout de JavaScript vivant sur les pages Systeme.io. Cette
-- migration installe de quoi servir le clic depuis NOTRE serveur :
--
--   1. `affiliates.ref`      : un code lisible, choisi par l'affilié
--   2. `affiliate_ref_aliases`: ses ANCIENS codes, valables pour toujours
--   3. `affiliate_links`     : un lien par destination et par canal,
--                              avec son code court
--   4. clics et conversions  : d'où vient le clic (canal + provenance)
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : elle ne retire pas `sa` comme clé
-- primaire de `affiliates`. Toutes les tables du programme y font
-- référence, et le rendre optionnel (pour accueillir un affilié qui n'a
-- aucun compte Systeme.io) est un chantier à part, avec sa propre
-- migration. `ref` est l'identité PUBLIQUE ; `sa` reste la clé interne.

-- 1. Le code public de l'affilié -----------------------------------------

alter table public.affiliates
  add column if not exists ref text;

-- Unicité insensible à la casse : "Jocelyne" et "jocelyne" sont le même
-- lien pour un humain, donc ils ne peuvent pas appartenir à deux
-- personnes. L'index porte sur lower(ref), le code étant toujours stocké
-- en minuscules par l'application.
create unique index if not exists affiliates_ref_unique_idx
  on public.affiliates (lower(ref))
  where ref is not null;

-- 2. Les anciens codes ne meurent JAMAIS ---------------------------------
--
-- Une affiliée a des liens dans des vidéos YouTube et des newsletters
-- déjà envoyées. Si elle change de code et qu'on libère l'ancien, le
-- suivant qui le prendrait hériterait de SON trafic. Un code retiré est
-- donc mort pour tout le monde sauf son propriétaire d'origine.

create table if not exists public.affiliate_ref_aliases (
  ref text primary key,
  sa text not null references public.affiliates(sa) on update cascade on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists affiliate_ref_aliases_sa_idx
  on public.affiliate_ref_aliases (sa);

-- 3. Les liens : une ligne par destination et par canal -------------------
--
-- Le lien long (`/go/jocelyne/atelier`) et le lien court (`/j/a7k`)
-- pointent sur CETTE ligne. Ce ne sont pas deux objets : c'est pour ça
-- qu'un lien court ne peut pas "casser le cookie", il ne rajoute aucune
-- étape. (Et c'est pour ça qu'un raccourcisseur externe est proscrit.)

create table if not exists public.affiliate_links (
  id uuid primary key default gen_random_uuid(),
  sa text not null references public.affiliates(sa) on update cascade on delete cascade,
  -- slug de `affiliate_link_destinations` (atelier, tiquiz_main, ...)
  destination text not null,
  -- étiquette libre posée par l'affilié : youtube, newsletter, story-mardi
  channel text,
  short_code text not null,
  clicks_count integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists affiliate_links_short_code_unique_idx
  on public.affiliate_links (lower(short_code));

-- Un seul lien par (affilié, destination, canal) : sinon deux liens
-- identiques se partageraient les statistiques du même trafic.
create unique index if not exists affiliate_links_sa_dest_channel_idx
  on public.affiliate_links (sa, destination, coalesce(channel, ''));

-- 4. D'où vient le clic ---------------------------------------------------
--
-- `channel`  : l'étiquette CHOISIE par l'affilié (il compare ce qui marche)
-- `source`   : la provenance DÉDUITE du referrer (youtube, instagram,
--              webmail, recherche...). Elle existe même quand il n'a rien
--              étiqueté, donc personne ne se retrouve devant un écran vide
--              parce qu'il n'y a pas pensé.

alter table public.affiliate_clicks
  add column if not exists ref text,
  add column if not exists channel text,
  add column if not exists source text,
  add column if not exists link_id uuid;

create index if not exists affiliate_clicks_link_idx
  on public.affiliate_clicks (link_id, created_at desc);

create index if not exists affiliate_clicks_sa_channel_idx
  on public.affiliate_clicks (sa, channel, created_at desc);

alter table public.affiliate_conversions
  add column if not exists ref text,
  add column if not exists channel text,
  add column if not exists source text,
  add column if not exists link_id uuid;

-- 5. Le taux négocié à la main -------------------------------------------
--
-- Demande Béné du 19 août : "moi manuellement je dois pouvoir gérer mes
-- affiliés, leur créer un code promo, augmenter ou diminuer manuellement
-- leur taux de commission (ex partenariat ou autre)."
--
-- Une ligne PAR (affilié, produit), et pas des colonnes sur `affiliates` :
-- le taux d'un partenariat sur l'Atelier n'a rien à voir avec celui sur
-- Tiquiz, et les paliers se comptent déjà produit par produit.
--
-- `note` n'est pas décorative : dans six mois, "pourquoi celle-là est à
-- 80%" doit avoir une réponse écrite à côté du chiffre, sinon personne
-- n'osera plus y toucher.

create table if not exists public.affiliate_rate_overrides (
  sa text not null references public.affiliates(sa) on update cascade on delete cascade,
  product text not null,
  rate numeric(5,4) not null check (rate > 0 and rate <= 1),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (sa, product)
);

notify pgrst, 'reload schema';
