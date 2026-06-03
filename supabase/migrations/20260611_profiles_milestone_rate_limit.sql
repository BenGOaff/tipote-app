-- 20260611_profiles_milestone_rate_limit.sql (Tipote)
--
-- Rate-limit des toasts milestones : 1×/semaine max par user.
--
-- Contexte : les toasts milestones (composant MilestoneToastListener)
-- se déclenchaient à chaque chargement du dashboard. Beaucoup trop
-- intrusif (retour Béné 3 juin 2026 — Gwenn s'est plainte de notif
-- récurrente, Béné confirme le ressenti).
--
-- Mécanique : la route /api/milestones/unseen retournera 0 milestones
-- tant que profiles.next_milestone_toast_at est dans le futur. La route
-- /api/milestones/seen programme next_milestone_toast_at = now() + 7d
-- après un batch affiché. Donc max 1 batch par semaine.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS next_milestone_toast_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
