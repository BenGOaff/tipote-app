-- ============================================================================
-- Enable RLS on webhook_debug_logs
-- La table était exposée sans RLS dans le schema public.
-- Comme elle est uniquement accédée via supabaseAdmin (service_role),
-- activer RLS sans policies = seul service_role peut y accéder (bypass RLS).
-- ============================================================================

ALTER TABLE public.webhook_debug_logs ENABLE ROW LEVEL SECURITY;
