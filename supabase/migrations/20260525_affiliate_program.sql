-- 20260525_affiliate_program.sql
--
-- Programme d'affiliation Tipote/Tiquiz : tracking côté serveur des clics,
-- conversions (email capturé au signup) et commissions (vente attribuée à
-- un affilié).
--
-- Pourquoi côté serveur et non via Systeme.io : leur API affilié n'expose
-- pas les ventes attribuées, leur webhook `customer.sale.completed`
-- n'inclut pas l'identifiant de l'affilié. On track nous-mêmes via le
-- paramètre `?sa=` dans les URLs des affiliés, et on attribue par email
-- au moment où la vente arrive chez nous.
--
-- Source de vérité unique : Supabase Tipote. Les ventes Tiquiz qui
-- arrivent sur Supabase Tiquiz appelleront notre endpoint
-- /api/affiliate/attribute-sale pour pousser les commissions ici.

-- Registre des affiliés approuvés (sa = identifiant Systeme.io de
-- l'affilié, ex: sa00168442b...). Le `sa` est la clé naturelle —
-- on ne crée pas de UUID interne pour éviter une couche de mapping.
create table if not exists affiliates (
  sa text primary key,
  email text not null unique,
  display_name text,
  locale text default 'fr',
  paypal_email text,
  iban_holder text,
  iban_number text,
  status text not null default 'active' check (status in ('active','paused','banned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_affiliates_email on affiliates (lower(email));

-- Clics tracés via le snippet JS sur tipote.fr/.com/.blog. Volume
-- potentiellement élevé → bigint identity, pas d'UUID, indexes minimaux.
create table if not exists affiliate_clicks (
  id bigint generated always as identity primary key,
  sa text not null,
  page_url text,
  referrer text,
  user_agent text,
  ip_hash text,                 -- SHA256 IP+secret, pour dedup sans stocker l'IP brute (RGPD)
  created_at timestamptz not null default now()
);

create index if not exists idx_aff_clicks_sa_time
  on affiliate_clicks (sa, created_at desc);

-- Conversions : moment où on capture l'email au submit d'un formulaire
-- (signup, lead capture) sur une page qui a un cookie tipote_sa actif.
-- C'est la pièce qui fait le pont entre "clic anonyme" et "vente future
-- attribuée par email".
create table if not exists affiliate_conversions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  sa text not null,
  page_url text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_aff_conv_email_time
  on affiliate_conversions (lower(email), created_at desc);

create index if not exists idx_aff_conv_sa_time
  on affiliate_conversions (sa, created_at desc);

-- Commissions effectives, créées à l'arrivée d'un webhook
-- customer.sale.completed (Tipote OU Tiquiz). On déduplique sur
-- sio_order_id pour pas double-compter sur les retries Systeme.io.
create table if not exists affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  sa text not null references affiliates(sa) on update cascade,
  sio_order_id text not null,
  source_app text not null check (source_app in ('tipote','tiquiz')),
  customer_email text not null,
  conversion_id uuid references affiliate_conversions(id) on delete set null,
  product_name text,
  sale_amount_cents integer not null,
  commission_rate numeric(5,4) not null,         -- 0.4 = 40%
  commission_cents integer not null,
  currency text not null default 'EUR',
  status text not null default 'pending'
    check (status in ('pending','approved','paid','cancelled','rejected')),
  sale_at timestamptz not null,
  approved_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  payout_id uuid,
  raw_payload jsonb,                              -- copie webhook source pour audit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_app, sio_order_id)               -- dedup par source × order
);

create index if not exists idx_aff_comm_sa_time
  on affiliate_commissions (sa, created_at desc);
create index if not exists idx_aff_comm_status
  on affiliate_commissions (status);

-- View des stats agrégées par affilié, pour le dashboard.
create or replace view affiliate_stats as
select
  a.sa,
  a.email,
  a.display_name,
  a.locale,
  a.status,
  coalesce(clicks.click_count, 0) as total_clicks,
  coalesce(convs.conversion_count, 0) as total_conversions,
  coalesce(comm.sales_count, 0) as total_sales,
  coalesce(comm.total_sale_cents, 0) as total_sale_cents,
  coalesce(comm.total_commission_cents, 0) as total_commission_cents,
  coalesce(comm.pending_commission_cents, 0) as pending_commission_cents,
  coalesce(comm.approved_commission_cents, 0) as approved_commission_cents,
  coalesce(comm.paid_commission_cents, 0) as paid_commission_cents
from affiliates a
left join (
  select sa, count(*) as click_count
  from affiliate_clicks
  group by sa
) clicks on clicks.sa = a.sa
left join (
  select sa, count(*) as conversion_count
  from affiliate_conversions
  group by sa
) convs on convs.sa = a.sa
left join (
  select
    sa,
    count(*) as sales_count,
    sum(sale_amount_cents) as total_sale_cents,
    sum(commission_cents) as total_commission_cents,
    sum(case when status = 'pending' then commission_cents else 0 end) as pending_commission_cents,
    sum(case when status = 'approved' then commission_cents else 0 end) as approved_commission_cents,
    sum(case when status = 'paid' then commission_cents else 0 end) as paid_commission_cents
  from affiliate_commissions
  group by sa
) comm on comm.sa = a.sa;

notify pgrst, 'reload schema';
