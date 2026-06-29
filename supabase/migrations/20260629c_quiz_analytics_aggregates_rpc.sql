-- ═══════════════════════════════════════════
-- TIPOTE — RPCs d'agrégation pour /api/quiz/[id]/analytics (par quiz)
-- ═══════════════════════════════════════════
--
-- Pourquoi : la page Analytics d'un quiz récupérait les leads (cap 5000)
-- et les events de question (cap 50000) ligne par ligne. Au-delà, le
-- graphe quotidien, la distribution par résultat et le funnel par
-- question étaient sous-comptés. On agrège tout en SQL → aucun plafond,
-- quel que soit le volume (pensé viral / SaaS premium).
--
-- Table leads (Tipote) = CRM générique, clé (user_id, source, source_id).
-- Pour un quiz : source = 'quiz', source_id = quiz_id::text. Colonnes
-- résultat : quiz_result_id / quiz_result_title, ré-exposées sous
-- result_id / result_title pour que le code Node soit symétrique avec
-- Tiquiz. Vues/jour = daily_quiz_views (migration 20260629). Bucketing
-- jour-local identique à lib/dateKeys.ts dateKeyForOffset.

-- Leads par jour LOCAL (un quiz).
CREATE OR REPLACE FUNCTION quiz_leads_daily(
  p_user_id UUID,
  p_quiz_id TEXT,
  p_tz_offset INT DEFAULT 0,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(day DATE, n BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ((created_at - make_interval(mins => p_tz_offset)) AT TIME ZONE 'UTC')::date AS day,
    count(*)::bigint AS n
  FROM leads
  WHERE user_id = p_user_id
    AND source = 'quiz'
    AND source_id = p_quiz_id
    AND (p_since IS NULL OR created_at >= p_since)
  GROUP BY 1;
$$;

-- Leads groupés par (result_id, result_title) — la logique de
-- réconciliation au profil LIVE (RÈGLE UNIQUE distribution) reste faite
-- côté Node sur ces lignes groupées (une poignée), à l'identique.
CREATE OR REPLACE FUNCTION quiz_leads_by_result(
  p_user_id UUID,
  p_quiz_id TEXT,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(result_id UUID, result_title TEXT, n BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT quiz_result_id AS result_id, quiz_result_title AS result_title, count(*)::bigint AS n
  FROM leads
  WHERE user_id = p_user_id
    AND source = 'quiz'
    AND source_id = p_quiz_id
    AND (p_since IS NULL OR created_at >= p_since)
  GROUP BY quiz_result_id, quiz_result_title;
$$;

-- Funnel par question : views + answers = sessions DISTINCTES par
-- question_index. On reproduit EXACTEMENT la logique JS actuelle de
-- Tipote (par-question, NON monotone), le seul changement étant la
-- suppression du plafond 50000. (Tiquiz utilise un calcul monotone
-- différent ; on ne change pas la sémantique Tipote sans demande.)
-- quiz_question_events est clé sur quiz_id (UUID).
CREATE OR REPLACE FUNCTION quiz_question_funnel_detail(
  p_quiz_id UUID,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(question_index INT, views BIGINT, answers BIGINT)
LANGUAGE sql
STABLE
AS $$
  -- Un seul passage : count(DISTINCT) filtré par type, groupé par question.
  SELECT
    question_index,
    count(DISTINCT session_id) FILTER (WHERE event = 'view')::bigint AS views,
    count(DISTINCT session_id) FILTER (WHERE event = 'answer')::bigint AS answers
  FROM quiz_question_events
  WHERE quiz_id = p_quiz_id
    AND event IN ('view', 'answer')
    AND (p_since IS NULL OR created_at >= p_since)
  GROUP BY question_index
  ORDER BY question_index;
$$;

NOTIFY pgrst, 'reload schema';
