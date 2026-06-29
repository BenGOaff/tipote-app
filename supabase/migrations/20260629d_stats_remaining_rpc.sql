-- ═══════════════════════════════════════════
-- TIPOTE — RPCs d'agrégation pour les surfaces stats restantes
-- ═══════════════════════════════════════════
--
-- Audit fiabilité 29 juin 2026 : le dashboard "métriques par offre"
-- comptait les leads du mois en tirant les lignes (plafond 1000). On
-- agrège en SQL, par page et par quiz, sur la fenêtre du mois.

-- Leads de page comptés par page_id sur [p_since, p_until).
CREATE OR REPLACE FUNCTION page_leads_count_by_page(
  p_page_ids UUID[],
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(page_id UUID, n BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT page_id, count(*)::bigint AS n
  FROM page_leads
  WHERE page_id = ANY(p_page_ids)
    AND (p_since IS NULL OR created_at >= p_since)
    AND (p_until IS NULL OR created_at < p_until)
  GROUP BY page_id;
$$;

-- Leads de quiz comptés par quiz_id sur [p_since, p_until).
CREATE OR REPLACE FUNCTION quiz_leads_count_by_quiz(
  p_quiz_ids UUID[],
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(quiz_id UUID, n BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT quiz_id, count(*)::bigint AS n
  FROM quiz_leads
  WHERE quiz_id = ANY(p_quiz_ids)
    AND (p_since IS NULL OR created_at >= p_since)
    AND (p_until IS NULL OR created_at < p_until)
  GROUP BY quiz_id;
$$;

-- Stats de tâches (dashboard) : total + done, comptés en SQL au lieu de
-- tirer toutes les lignes project_tasks (plafond 1000). done = même
-- définition que isDone() côté Node (insensible à la casse).
CREATE OR REPLACE FUNCTION task_stats(
  p_user_id UUID,
  p_project_id UUID DEFAULT NULL
)
RETURNS TABLE(total BIGINT, done BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    count(*)::bigint AS total,
    count(*) FILTER (
      WHERE lower(status) IN ('done', 'completed', 'fait', 'terminé')
    )::bigint AS done
  FROM project_tasks
  WHERE user_id = p_user_id
    AND deleted_at IS NULL
    AND (p_project_id IS NULL OR project_id = p_project_id);
$$;

NOTIFY pgrst, 'reload schema';
