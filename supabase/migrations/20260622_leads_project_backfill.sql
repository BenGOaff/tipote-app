-- 20260622_leads_project_backfill.sql
--
-- INCIDENT : la capture de leads quiz (app/api/quiz/[quizId]/public) n'a
-- jamais ecrit `project_id`. Tous les leads quiz avaient donc project_id
-- NULL. Des qu'un projet par defaut existe, "Mes leads" filtre par projet
-- (.eq project_id) et MASQUAIT ces leads (ils n'etaient PAS perdus, juste
-- filtres). Ce backfill reattribue les leads orphelins a leur projet.
--
-- Data-only, idempotent (ne touche que project_id IS NULL).

-- 1) Leads issus d'un quiz -> projet du quiz source.
UPDATE leads l
SET project_id = q.project_id
FROM quizzes q
WHERE l.project_id IS NULL
  AND l.source = 'quiz'
  AND l.source_id = q.id::text
  AND q.project_id IS NOT NULL;

-- 2) Tout lead encore sans projet -> projet par defaut de son proprietaire.
UPDATE leads l
SET project_id = p.id
FROM projects p
WHERE l.project_id IS NULL
  AND p.user_id = l.user_id
  AND p.is_default = true;
