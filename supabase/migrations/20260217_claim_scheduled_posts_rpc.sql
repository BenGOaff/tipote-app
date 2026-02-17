-- Atomic claim of scheduled posts for n8n publishing.
-- Uses SELECT ... FOR UPDATE SKIP LOCKED to prevent race conditions
-- when multiple cron jobs overlap.
-- Returns the claimed posts (now marked as 'publishing').

CREATE OR REPLACE FUNCTION public.claim_scheduled_posts(
  p_today DATE,
  p_platform TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  project_id UUID,
  type TEXT,
  titre TEXT,
  contenu TEXT,
  statut TEXT,
  date_planifiee DATE,
  canal TEXT,
  meta JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT ci.id
    FROM public.content_item ci
    WHERE ci.statut = 'scheduled'
      AND ci.date_planifiee <= p_today
      AND ci.contenu IS NOT NULL
      AND (p_platform IS NULL OR ci.canal = p_platform)
    ORDER BY ci.date_planifiee ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.content_item ci
  SET statut = 'publishing'
  FROM claimed
  WHERE ci.id = claimed.id
  RETURNING ci.id, ci.user_id, ci.project_id, ci.type, ci.titre, ci.contenu, ci.statut, ci.date_planifiee, ci.canal, ci.meta;
END;
$$;
