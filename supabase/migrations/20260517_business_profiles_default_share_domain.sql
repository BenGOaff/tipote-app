-- Per-(user, project) preferred share domain. NULL = let the UI pick
-- the default (first verified custom_domain of this project if any,
-- else app.tipote.com).
--
-- Stored on business_profiles (already keyed by user_id + project_id)
-- so each project gets its own preference — matches the per-project
-- isolation of custom_domains itself. A user managing two brands can
-- have project A default to brand-a.com and project B default to
-- brand-b.com.
--
-- Stored as a plain hostname (no scheme, no path). Validated against
-- the caller's own custom_domains rows (status='verified', SAME
-- project_id) OR the main app host inside the PATCH route — never
-- trust the client.

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS default_share_domain TEXT;

COMMENT ON COLUMN public.business_profiles.default_share_domain IS
  'Hostname preferred by this (user, project) for share links shown in the dashboard. NULL = computed default (verified custom domain of THIS project if any, else app.tipote.com). Validated server-side on update.';
