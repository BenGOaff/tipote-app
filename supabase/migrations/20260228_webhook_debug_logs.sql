-- ============================================================================
-- Webhook Debug Logs
-- Stocke les événements webhook reçus pour diagnostiquer les problèmes.
-- Table légère avec auto-nettoyage (les logs > 7 jours sont supprimables).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_debug_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,          -- 'received', 'signature_ok', 'signature_fail', 'processed', 'no_token', 'no_match', 'matched', 'error'
  page_id TEXT,                       -- Facebook/Instagram page ID
  user_id UUID,                       -- Tipote user ID (si trouvé)
  source TEXT DEFAULT 'meta',         -- 'meta', 'n8n', 'simulate'
  payload_summary JSONB,              -- Résumé du payload (pas le payload complet pour GDPR)
  result JSONB,                       -- Résultat du traitement
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_debug_logs_created ON public.webhook_debug_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_debug_logs_page ON public.webhook_debug_logs(page_id, created_at DESC);

-- Pas de RLS : accessible uniquement via supabaseAdmin (service_role)
-- Les endpoints API vérifient l'authentification manuellement.

COMMENT ON TABLE public.webhook_debug_logs IS 'Logs de debug des webhooks Meta pour diagnostiquer les problèmes de déclenchement.';
