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

-- Funnel par question : views (MONOTONE, sessions ayant ATTEINT la
-- question = max index vu >= N) + answers (sessions distinctes ayant
-- répondu). Aligné sur Tiquiz (Béné 29 juin 2026 : "aligne tipote sur
-- tiquiz, toujours") : un visiteur arrivé à Q5 a forcément passé Q1-Q4,
-- la courbe ne remonte jamais. quiz_question_events est clé sur quiz_id.
CREATE OR REPLACE FUNCTION quiz_question_funnel_detail(
  p_quiz_id UUID,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(question_index INT, views BIGINT, answers BIGINT)
LANGUAGE sql
STABLE
AS $$
  WITH evs AS (
    SELECT question_index, session_id, event
    FROM quiz_question_events
    WHERE quiz_id = p_quiz_id
      AND event IN ('view', 'answer')
      AND (p_since IS NULL OR created_at >= p_since)
  ),
  -- Par session : la question la PLUS LOIN atteinte (max index vu).
  session_max AS (
    SELECT session_id, max(question_index) AS max_q
    FROM evs WHERE event = 'view' GROUP BY session_id
  ),
  -- Sessions regroupées par leur max_q (au plus ~200 lignes) : permet de
  -- calculer views(N) = SUM(c WHERE max_q >= N) sans rescanner les events.
  maxdist AS (
    SELECT max_q, count(*) AS c FROM session_max GROUP BY max_q
  ),
  ans AS (
    SELECT question_index, count(DISTINCT session_id) AS a
    FROM evs WHERE event = 'answer' GROUP BY question_index
  ),
  qs AS (
    SELECT DISTINCT question_index FROM evs
  )
  SELECT
    qs.question_index,
    COALESCE((SELECT sum(c) FROM maxdist m WHERE m.max_q >= qs.question_index), 0)::bigint AS views,
    COALESCE((SELECT a FROM ans WHERE ans.question_index = qs.question_index), 0)::bigint AS answers
  FROM qs
  ORDER BY qs.question_index;
$$;

NOTIFY pgrst, 'reload schema';
