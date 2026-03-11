-- Enable RLS on webhook_logs (same pattern as webhook_debug_logs)
-- No policies = default-deny for authenticated users
-- service_role bypasses RLS automatically
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
