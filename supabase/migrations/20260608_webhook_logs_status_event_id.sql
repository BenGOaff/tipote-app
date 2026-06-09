-- 20260608_webhook_logs_status_event_id.sql
--
-- Drame Bene 8 juin 2026 : la table webhook_logs (creee 7 mars 2026)
-- n'avait que id / source / event_type / payload / received_at. Le
-- code metier (a la fois /api/systeme-io/webhook et le nouveau
-- /api/affiliate/sio-conversion) tentait d'inserer aussi `status` et
-- `event_id` -> l'insert echouait silencieusement (catch vide) ->
-- aucun log ecrit. Resultat : (1) idempotence des webhooks SIO cassee
-- depuis le 7 mars (chaque retry retraite l'event), (2) impossible de
-- debugger les webhooks affiliate (table vide alors qu'on espere des
-- logs apres chaque test d'inscription).
--
-- Fix : ajout des 2 colonnes manquantes. Idempotent (IF NOT EXISTS),
-- aucune coupure des inserts existants.

ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT;

-- Index utilises par alreadyProcessed() dans /api/systeme-io/webhook
-- pour deduper les retries SIO. Partial index (WHERE event_id IS NOT
-- NULL) parce que la majorite des logs historiques ont event_id NULL.
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_id
  ON public.webhook_logs(event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_status
  ON public.webhook_logs(event_id, status)
  WHERE event_id IS NOT NULL AND status IS NOT NULL;

NOTIFY pgrst, 'reload schema';
