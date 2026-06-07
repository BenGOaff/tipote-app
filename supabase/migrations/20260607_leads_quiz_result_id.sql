-- 20260607_leads_quiz_result_id.sql (Tipote)
--
-- Ajoute leads.quiz_result_id pour permettre la resolution LIVE du titre
-- du resultat (vs le snapshot quiz_result_title fige a la capture). Sans
-- ca, quand un user renomme un resultat ("Le Tsunami Creatif" → "Le
-- Tourbillon"), le donut stats affiche 2 entrees distinctes (l'ancien
-- nom pour les vieux leads, le nouveau pour les recents) au lieu d'une
-- seule entree avec le nom courant. Drame Gwenn 7 juin 2026.
--
-- Mecanique apres migration :
--   - Capture (route /api/quiz/[id]/public) ecrit ET quiz_result_id ET
--     quiz_result_title (snapshot reste comme fallback si le resultat
--     est supprime depuis).
--   - Route /api/quiz/[id]/analytics groupe par quiz_result_id, resout
--     le titre depuis quiz_results.title (live) ou snapshot, puis MERGE
--     les entrees avec le meme titre resolu.
--
-- BACKFILL : pour les leads existants, on match snapshot title contre
-- les titres courants du quiz (probable mais pas certain — un user peut
-- avoir renomme un resultat entre-temps). Best-effort, le snapshot reste
-- en fallback pour les leads sans match.
--
-- ON DELETE SET NULL : si l'user supprime un resultat plus tard, les
-- leads gardent leur snapshot title et ne planten pas. Pareil que
-- migration 030 cote Tiquiz.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS quiz_result_id UUID
    REFERENCES public.quiz_results(id) ON DELETE SET NULL;

-- Backfill best-effort : pour chaque lead avec un snapshot title, on
-- cherche LE result du quiz qui a actuellement le meme title. Si zero
-- match ou plusieurs matches (cas rename + 2 results avec meme titre),
-- on laisse NULL (snapshot reste en fallback).
WITH matched AS (
  SELECT
    l.id AS lead_id,
    (
      SELECT qr.id
      FROM public.quiz_results qr
      WHERE qr.quiz_id::text = l.source_id
        AND trim(qr.title) = trim(l.quiz_result_title)
      LIMIT 1
    ) AS resolved_result_id
  FROM public.leads l
  WHERE l.source = 'quiz'
    AND l.quiz_result_id IS NULL
    AND l.quiz_result_title IS NOT NULL
    AND trim(l.quiz_result_title) <> ''
)
UPDATE public.leads l
SET quiz_result_id = m.resolved_result_id
FROM matched m
WHERE l.id = m.lead_id
  AND m.resolved_result_id IS NOT NULL;

-- Index pour lookups en analytics (group by + count par result).
CREATE INDEX IF NOT EXISTS idx_leads_quiz_result_id
  ON public.leads (quiz_result_id)
  WHERE quiz_result_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
