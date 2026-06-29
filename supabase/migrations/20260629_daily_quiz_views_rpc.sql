-- ═══════════════════════════════════════════
-- TIPOTE — RPC daily_quiz_views (vues par jour, agrégées DANS la base)
-- ═══════════════════════════════════════════
--
-- Pourquoi : la page Analytics d'un quiz affiche une ligne "vues" + un
-- taux de conversion par jour (demande Gwenn 29 juin 2026). Compter les
-- vues en récupérant chaque event de quiz_events ligne par ligne ne
-- scale pas : un quiz viral à 1M de vues ferait transiter 1M de lignes
-- à chaque ouverture de la page. On agrège donc en SQL (GROUP BY jour),
-- ce qui renvoie une seule ligne par jour quel que soit le volume.
--
-- Bucketing : on reproduit EXACTEMENT lib/dateKeys.ts dateKeyForOffset.
-- Côté JS : shifted = instant - offsetMinutes, puis date UTC de shifted.
-- Côté SQL : (created_at - p_tz_offset minutes) AT TIME ZONE 'UTC' puis
-- ::date. Le AT TIME ZONE 'UTC' donne l'horloge murale UTC de l'instant
-- décalé, indépendamment du fuseau de session Postgres → résultat
-- identique au client. p_tz_offset suit la convention JS
-- getTimezoneOffset (positif = derrière UTC, Paris été = -120).
--
-- L'index idx_quiz_events_quiz_type_created (quiz_id, event_type,
-- created_at) existe déjà (20260521_tracking_foundation.sql) et couvre
-- exactement le WHERE + la borne de date.

CREATE OR REPLACE FUNCTION daily_quiz_views(
  p_quiz_id UUID,
  p_tz_offset INT DEFAULT 0,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(day DATE, views BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ((created_at - make_interval(mins => p_tz_offset)) AT TIME ZONE 'UTC')::date AS day,
    count(*)::bigint AS views
  FROM quiz_events
  WHERE quiz_id = p_quiz_id
    AND event_type = 'view'
    AND (p_since IS NULL OR created_at >= p_since)
  GROUP BY 1
  ORDER BY 1;
$$;

NOTIFY pgrst, 'reload schema';
