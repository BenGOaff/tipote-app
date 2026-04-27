-- ═══════════════════════════════════════════
-- TIPOTE — Optional consent checkbox on quizzes
-- ═══════════════════════════════════════════
-- Mirrors Tiquiz migration 020_optional_consent_checkbox.sql. Some
-- creators (Bénédicte's first user, on Tipote) want to drop the
-- GDPR-style consent checkbox below the email capture form because
-- their CRM handles consent upstream. Default stays true so existing
-- quizzes keep the safer behaviour.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS show_consent_checkbox BOOLEAN NOT NULL DEFAULT true;
