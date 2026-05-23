-- 20260526_affiliate_trial.sql
--
-- Trial Tipote 1 mois pour les affiliés. Permet à un affilié de
-- débloquer son compte Tipote en Elite GRATUITEMENT pendant 30 jours,
-- pour qu'il puisse tester l'outil, créer du contenu de démo et
-- mieux le vendre à son audience.
--
-- Mécanique :
--   - 1 trial par affilié, ONE-SHOT (activated_at se set une fois).
--   - L'affilié choisit QUAND activer (pas auto à l'inscription).
--   - À l'activation, son profile Tipote passe en plan='elite' avec
--     plan_source='affiliate_trial' et trial_expires_at = now() + 30j.
--   - Un cron quotidien downgrade les profiles dont
--     trial_expires_at < now() ET plan_source = 'affiliate_trial'.
--   - Bandeau dans Tipote app indique les jours restants.
--   - Emails de rappel à J-3 et J-1 avant expiration.
--
-- Edge cases gérés :
--   - Affilié déjà sur un plan payant (beta/basic/pro/elite) : le trial
--     est refusé côté API (on ne downgrade pas un client payant).
--   - Affilié sur plan free : on bump en Elite, on stocke l'ancien
--     plan dans plan_change_log pour rollback en fin de trial.

-- ─── affiliates : tracking de l'activation du trial ──────────────────
alter table affiliates
  add column if not exists trial_activated_at timestamptz,
  add column if not exists trial_expires_at timestamptz;

create index if not exists idx_affiliates_trial_expires
  on affiliates (trial_expires_at)
  where trial_expires_at is not null;

-- ─── profiles : flag d'expiration pour le cron de downgrade ─────────
-- Stocke l'expiration sur le profile aussi (joint avec affiliates.sa
-- pour le cron). Permet une requête simple sur profiles uniquement,
-- sans avoir à JOIN affiliates à chaque tick du cron.
alter table profiles
  add column if not exists trial_expires_at timestamptz;

create index if not exists idx_profiles_trial_expires
  on profiles (trial_expires_at)
  where trial_expires_at is not null;

-- Comment column pour que c'est clair côté DB studio
comment on column affiliates.trial_activated_at is
  'Date d''activation du trial Tipote 1 mois. NULL = jamais activé. '
  'Une seule activation par affilié (vérifié côté API).';

comment on column affiliates.trial_expires_at is
  'Date de fin du trial Tipote (= trial_activated_at + 30 jours). '
  'NULL si jamais activé. Conservé même après expiration pour audit.';

comment on column profiles.trial_expires_at is
  'Si NOT NULL et > now() : profile en trial actif (Elite gratuit). '
  'Le cron sio-trial-expiry tourne tous les jours pour downgrade les '
  'profiles dont trial_expires_at est passé.';

notify pgrst, 'reload schema';
