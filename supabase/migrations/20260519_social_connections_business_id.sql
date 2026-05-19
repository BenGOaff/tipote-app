-- 20260519_social_connections_business_id.sql
-- L'IG Business Account ID (entry.id des webhooks Meta, format 17841…)
-- est DIFFÉRENT de l'IG-scoped User ID retourné par /me (format 26…/35…)
-- qu'on stockait dans platform_user_id. Conséquence : aucune connexion
-- existante ne match les events webhook → auto_comment_logs reste vide.
--
-- On ajoute une colonne dédiée pour le Business Account ID, gardée à
-- jour à chaque OAuth callback. Le webhook handler lookup d'abord par
-- platform_business_id ; si miss, self-heal via /me?fields=user_id pour
-- backfill les connexions existantes (aucun reconnect requis).

alter table social_connections
  add column if not exists platform_business_id text;

create index if not exists idx_social_connections_business_id
  on social_connections (platform, platform_business_id)
  where platform_business_id is not null;

notify pgrst, 'reload schema';
