-- ============================================================================
-- 20260604_business_events_foundation.sql
--
-- Phase 0 de ROADMAP_RETENTION.md (audit Béné du 1er juin 2026).
--
-- Trois tables socle consommées par 4 chantiers rétention :
--   1. Wall of Wins (phase 2)            → lit business_events agrégés
--   2. Milestones + notifs wins (phase 1) → lit business_events, écrit
--                                           user_milestones + user_notifications
--   3. Email réengagement (phase 3)       → lit business_events pour détecter
--                                           inactivité, écrit user_notifications
--   4. Coach IA proactif hebdo (phase 4)  → lit business_events + écrit
--                                           user_notifications
--
-- Conventions respectées :
--   - IF NOT EXISTS partout (idempotence migrations, cf. pitfalls I).
--   - DROP POLICY IF EXISTS avant CREATE POLICY (cf. pitfalls section A).
--   - NOTIFY pgrst en fin (cf. pitfalls A — sans ça Supabase API 500
--     "Could not find column in schema cache").
--   - project_id = UUID fonctionnel du projet (matche business_profiles.project_id,
--     PAS business_profiles.id qui est juste la PK technique).
--   - dedupe_key UNIQUE partiel pour idempotence des syncs externes
--     (cf. pitfalls AS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. business_events
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  amount_cents INTEGER,
  currency TEXT,
  source TEXT NOT NULL DEFAULT 'internal',
  dedupe_key TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.business_events IS
'Log unique des événements business par user. Source de vérité consommée par Wall of Wins, milestones, réengagement, coach proactif. Cf. ROADMAP_RETENTION.md phase 0.';

COMMENT ON COLUMN public.business_events.kind IS
'Type d''event : sale, refund, lead_captured, post_published, post_failed, quiz_view, quiz_start, quiz_complete, quiz_share, quiz_published, popquiz_published, page_published, account_connected, account_disconnected, strategy_recalculated, strategy_drift, milestone_unlocked.';

COMMENT ON COLUMN public.business_events.source IS
'Origine de l''event : internal, stripe, paypal, mollie, systemeio, manual, linkedin, facebook, instagram, threads, x, tiktok, pinterest.';

COMMENT ON COLUMN public.business_events.project_id IS
'UUID fonctionnel du projet Tipote (matche business_profiles.project_id, multi-projet Elite). NULL pour les events globaux user.';

COMMENT ON COLUMN public.business_events.dedupe_key IS
'Clé d''idempotence pour les syncs externes (ex stripe:ch_xxx, systemeio:order_yyy, quiz_lead:<quizId>:<emailHash>). UNIQUE par (user_id, dedupe_key) quand non NULL.';

COMMENT ON COLUMN public.business_events.amount_cents IS
'Montant en centimes pour les events monétaires (sale, refund). NULL sinon. Toujours en monnaie originale, currency dans la colonne dédiée. La conversion EUR se fait au moment de l''affichage.';

CREATE INDEX IF NOT EXISTS idx_business_events_user_occurred
  ON public.business_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_events_user_kind_occurred
  ON public.business_events (user_id, kind, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_events_user_project_occurred
  ON public.business_events (user_id, project_id, occurred_at DESC)
  WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_events_user_dedupe
  ON public.business_events (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE public.business_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_events_select_own ON public.business_events;
CREATE POLICY business_events_select_own ON public.business_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Pas de policy INSERT/UPDATE pour les users : l'INSERT passe TOUJOURS
-- par lib/businessEvents.ts → logBusinessEvent() qui utilise le client
-- service-role. Garantit qu'aucun user ne peut forger un event sale
-- pour gonfler ses milestones.

-- ----------------------------------------------------------------------------
-- 2. user_milestones
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_milestones (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID,
  milestone_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at TIMESTAMPTZ,
  shared_at TIMESTAMPTZ
);

COMMENT ON TABLE public.user_milestones IS
'Jalons débloqués par user. Insertion automatique par l''engine de milestones (phase 1 ROADMAP_RETENTION) à partir des business_events. Une ligne = un milestone atteint.';

COMMENT ON COLUMN public.user_milestones.milestone_key IS
'Identifiant stable du milestone (ex first_lead, leads_10, first_sale, sales_first_1k, streak_7days, first_quiz_published). Voir lib/milestones/catalog.ts (phase 1).';

COMMENT ON COLUMN public.user_milestones.seen_at IS
'Timestamp où le user a VU le toast / dialog célébrant le milestone. NULL = pas encore vu (à afficher au prochain login).';

COMMENT ON COLUMN public.user_milestones.shared_at IS
'Timestamp où le user a partagé le milestone (social / copy-link). Utilisé pour mesurer le bouche-à-oreille milestone.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_milestones_user_project_key
  ON public.user_milestones (
    user_id,
    milestone_key,
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_user_milestones_user_unseen
  ON public.user_milestones (user_id, unlocked_at DESC)
  WHERE seen_at IS NULL;

ALTER TABLE public.user_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_milestones_select_own ON public.user_milestones;
CREATE POLICY user_milestones_select_own ON public.user_milestones
  FOR SELECT
  USING (auth.uid() = user_id);

-- Le user peut UPDATE seen_at / shared_at sur ses propres milestones
-- (pour marquer "vu" depuis le client). Les autres colonnes sont write-once
-- par le service-role.
DROP POLICY IF EXISTS user_milestones_update_own_seen ON public.user_milestones;
CREATE POLICY user_milestones_update_own_seen ON public.user_milestones
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3. user_notifications
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID,
  kind TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  title TEXT,
  body TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  cta_label TEXT,
  cta_href TEXT,
  emoji TEXT,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  email_dedupe_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_notifications IS
'Notifications in-app pour le NotificationCenter (bell header). Une notif peut aussi avoir été envoyée par email (email_sent_at). Catégories indépendamment opt-out via settings.';

COMMENT ON COLUMN public.user_notifications.category IS
'Catégorie pour l''opt-out fin par type : general, milestone, wins (récap mensuel), reengagement, coach, sales, security, social.';

COMMENT ON COLUMN public.user_notifications.email_dedupe_key IS
'Clé d''idempotence pour éviter d''envoyer 2x le même email. Format typique : <category>:<period>:<hash payload>.';

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
  ON public.user_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL AND dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON public.user_notifications (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_notifications_email_dedupe
  ON public.user_notifications (user_id, email_dedupe_key)
  WHERE email_dedupe_key IS NOT NULL;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notifications_select_own ON public.user_notifications;
CREATE POLICY user_notifications_select_own ON public.user_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_notifications_update_own ON public.user_notifications;
CREATE POLICY user_notifications_update_own ON public.user_notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
NOTIFY pgrst, 'reload schema';
-- ============================================================================
