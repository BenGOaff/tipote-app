-- ============================================================================
-- 20260605_consolidate_notifications.sql
--
-- Fix : la migration 20260604_business_events_foundation a créé une table
-- `user_notifications` qui DOUBLE la table `notifications` existante (créée
-- en 20260309_notifications.sql). Sans ce fix, on aurait deux systèmes de
-- notif en parallèle avec deux helpers (lib/notifications.ts ET
-- lib/userNotifications.ts) → bugs garantis (notifs perdues selon le
-- helper appelé, UI qui lit une table, cron qui écrit dans l'autre, etc.).
--
-- Décision (1er juin 2026, à chaud) : on garde la table `notifications`
-- d'origine et on lui ajoute les 2 features qui manquaient pour les
-- chantiers rétention (email_dedupe_key pour l'idempotence des emails
-- de wins / réengagement / récap mensuel).
--
-- Conséquence côté code :
--   - Drop la table user_notifications (vide, aucune ligne en prod).
--   - lib/userNotifications.ts pivoté en wrapper de lib/notifications.ts
--     (helper unique createNotification + sendEmail associé).
--   - lib/businessEvents.ts inchangé (business_events reste).
--   - lib/milestones/* (phase 1) écrit dans `notifications` via le helper
--     unique.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DROP la table doublon (idempotent — IF EXISTS protège un rejeu)
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS public.user_notifications;

-- ----------------------------------------------------------------------------
-- 2. Étendre `notifications` avec email_dedupe_key
--
-- Sert pour les emails idempotents :
--   - "Tu viens d'atteindre les 100 leads !" → 1 seul email même si le
--     trigger se déclenche deux fois.
--   - "Récap mensuel décembre 2026" → 1 seul envoi par mois (clé
--     "wins_recap:2026-12").
--   - "Tu nous manques depuis 7 jours" → 1 envoi par fenêtre 7j (clé
--     "reengagement_7d:2026-W23").
-- ----------------------------------------------------------------------------

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS email_dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.notifications.email_dedupe_key IS
  'Clé d''idempotence pour ne pas envoyer 2x le même email. Format typique : <category>:<period>:<entity>. NULL si la notif n''a pas de pendant email.';

COMMENT ON COLUMN public.notifications.email_sent_at IS
  'Timestamp où l''email associé a été envoyé via Resend. NULL = pas d''email ou échec d''envoi.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_email_dedupe
  ON public.notifications (user_id, email_dedupe_key)
  WHERE email_dedupe_key IS NOT NULL;

-- ============================================================================
NOTIFY pgrst, 'reload schema';
-- ============================================================================
