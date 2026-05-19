-- 20260519_meta_webhook_receipts.sql
-- Journal de TOUS les hits POST sur le callback webhook Meta (Instagram).
-- But : diagnostiquer pourquoi auto_comment_logs reste vide alors que le
-- test passe — savoir si Meta envoie vraiment des events, et si oui où on
-- les rejette (signature, object filter, account lookup, etc.).
--
-- L'INSERT se fait au tout début du handler POST, avant TOUTE validation,
-- pour qu'on capture même les hits qui finissent en 401 (signature KO).
--
-- Aucune RLS : table interne d'observabilité, écrite uniquement par
-- supabaseAdmin depuis la route /api/auth/instagram/callback.

create table if not exists meta_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  source text not null default 'instagram_callback',
  signature_present boolean not null,
  signature_valid boolean,
  payload_object text,
  payload_excerpt text,
  entry_count integer,
  processed_count integer,
  skipped_reason text,
  http_status integer,
  error_message text
);

create index if not exists idx_meta_webhook_receipts_received_at
  on meta_webhook_receipts (received_at desc);

create index if not exists idx_meta_webhook_receipts_payload_object
  on meta_webhook_receipts (payload_object);

alter table meta_webhook_receipts enable row level security;

drop policy if exists "meta_webhook_receipts owner read" on meta_webhook_receipts;
create policy "meta_webhook_receipts owner read"
  on meta_webhook_receipts for select
  to authenticated
  using (false); -- aucun accès via PostgREST utilisateur ; seul service_role lit

notify pgrst, 'reload schema';
