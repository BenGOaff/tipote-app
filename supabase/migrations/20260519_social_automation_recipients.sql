-- 20260519_social_automation_recipients.sql
-- Dédup des DMs auto-envoyés par les automatisations sociales (Béné,
-- 19 mai 2026 : "je reçois trop souvent le DM auto instagram, il ne
-- doit être envoyé qu'une fois").
--
-- Principe : 1 row par (automation, plateforme, sender). UNIQUE index
-- garantit l'unicité même en cas de webhooks concurrents (Meta retries).
-- Le handler webhook fait un INSERT … ON CONFLICT DO NOTHING avant
-- d'appeler l'API DM. Si le row était déjà présent → on skip.
--
-- Le comment-reply n'est pas dédupé ici (Instagram dédupe déjà côté
-- serveur). On garde une colonne reply_sent_at au cas où on en aurait
-- besoin plus tard sans nouvelle migration.

create table if not exists social_automation_recipients (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references social_automations(id) on delete cascade,
  platform text not null,
  sender_id text not null,
  first_comment_id text,
  first_seen_at timestamptz not null default now(),
  dm_sent_at timestamptz,
  reply_sent_at timestamptz
);

create unique index if not exists uniq_social_automation_recipients
  on social_automation_recipients (automation_id, sender_id);

create index if not exists idx_social_automation_recipients_automation
  on social_automation_recipients (automation_id);

alter table social_automation_recipients enable row level security;

drop policy if exists "social_automation_recipients owner read" on social_automation_recipients;
create policy "social_automation_recipients owner read"
  on social_automation_recipients for select
  to authenticated
  using (
    automation_id in (
      select id from social_automations where user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
