-- ============================================================================
-- Webhook Logs for Systeme.io
-- Persists raw webhook payloads for debugging plan assignment issues.
-- Auto-cleanup: rows older than 30 days can be safely deleted.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'systeme_io',
  event_type TEXT,
  payload JSONB,
  received_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for querying recent logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_received ON public.webhook_logs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_source ON public.webhook_logs(source, received_at DESC);

-- No RLS: only accessible via supabaseAdmin (service_role)
COMMENT ON TABLE public.webhook_logs IS 'Raw Systeme.io webhook payloads for debugging plan assignment issues.';
