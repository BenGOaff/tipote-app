-- 20260524_custom_domain_favicon.sql
--
-- Per-domain favicon (Béné, 24 mai 2026).
--
-- Replaces business_profiles.brand_favicon_url as the source of truth
-- for the favicon shown in the browser tab on public routes. Rationale:
-- a single user/project can connect N custom domains (one per brand)
-- and each domain needs its own favicon. business_profiles.brand_favicon_url
-- is kept for backward-compat reads during the transition but the UI no
-- longer writes to it.
--
-- Backfill: copy the existing per-project favicon onto the user's first
-- verified domain of that project (best-effort — only when the row
-- hasn't been set per-domain yet).

alter table public.custom_domains
  add column if not exists favicon_url text;

update public.custom_domains cd
set favicon_url = bp.brand_favicon_url
from public.business_profiles bp
where cd.user_id = bp.user_id
  and cd.project_id = bp.project_id
  and cd.favicon_url is null
  and bp.brand_favicon_url is not null
  and cd.status = 'verified'
  and cd.id = (
    select id from public.custom_domains
    where user_id = cd.user_id
      and project_id = cd.project_id
      and status = 'verified'
    order by verified_at asc nulls last, created_at asc
    limit 1
  );

notify pgrst, 'reload schema';
