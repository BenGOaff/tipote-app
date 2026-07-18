-- 20260718_business_profiles_notify_responses.sql (Tipote)
--
-- Notification email du créateur à chaque nouvelle réponse / lead sur ses
-- quiz et sondages (portage de Tiquiz, demande Christelle 18 juil 2026).
-- Jusqu'ici Tipote n'envoyait aucune notification de réponse au créateur.
--
-- Stocké sur business_profiles (comme les autres réglages user de
-- l'espace Réglages, per-projet en multiprofils). Opt-out : true par
-- défaut, désactivable dans Réglages > Profil.

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS notify_responses BOOLEAN NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
