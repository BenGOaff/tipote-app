-- ============================================================================
-- Enable RLS on admin-only tables
-- Tables plan_change_log and plan_assignments are internal audit/admin tables.
-- All access goes through supabaseAdmin (service_role key) which bypasses RLS
-- automatically, so enabling RLS with no user-level policies is the correct
-- security posture: regular users have zero access, service_role is unaffected.
-- ============================================================================

-- plan_change_log: audit log for admin plan changes and bonus credit grants.
-- Created ad-hoc in Supabase; recreate here so the migration is idempotent.
CREATE TABLE IF NOT EXISTS public.plan_change_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email   TEXT,
  old_plan       TEXT,
  new_plan       TEXT,
  reason         TEXT,
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.plan_change_log IS
  'Admin audit log for plan changes and bonus credit grants. Write-only via service_role.';

ALTER TABLE public.plan_change_log ENABLE ROW LEVEL SECURITY;

-- plan_assignments: currently unused in the codebase; secure it proactively.
CREATE TABLE IF NOT EXISTS public.plan_assignments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.plan_assignments IS
  'Reserved admin table. No user-level access; managed exclusively via service_role.';

ALTER TABLE public.plan_assignments ENABLE ROW LEVEL SECURITY;

-- No SELECT / INSERT / UPDATE / DELETE policies are added intentionally.
-- service_role bypasses RLS and retains full access.
-- Regular authenticated users are denied all access by default (RLS default-deny).
