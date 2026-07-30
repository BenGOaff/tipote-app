-- 20260730_quiz_scoring_axes.sql
--
-- Scoring multi-axes + affichage visuel du score (Véronique, 30 juillet
-- 2026 ; porté depuis Tiquiz, module quiz jumeau). Un quiz en mode
-- "scoring" peut définir 1 à 6 axes (sommeil, alimentation, émotions...).
-- Chaque question pèse sur un ou plusieurs axes via son config JSONB
-- (`axes: {"<axisId>": <poids>}`), aucune colonne sur quiz_questions.
--
-- 100% additif : tout est désactivé par défaut, les quiz en ligne ne
-- changent pas d'un pixel.

-- Axes définis par le créateur : [{"id": "...", "label": "Sommeil"}, ...]
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS scoring_axes JSONB;

-- Jauge du score global sur la page de résultat (opt-in : les quiz
-- scoring existants gardent leur affichage "X / Y" texte inchangé).
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS show_score_gauge BOOLEAN NOT NULL DEFAULT false;

-- 'percent' (ex. "62%") ou 'label' (ex. "moyen"). Le libellé évite
-- l'effet "diagnostic chiffré" sur les sujets santé/finance/juridique.
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS score_display_mode TEXT NOT NULL DEFAULT 'percent';

-- Libellés des 3 tranches, personnalisables : {"low": "...", "mid": "...",
-- "high": "..."}. NULL = défauts localisés (bas / moyen / élevé).
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS score_labels JSONB;

-- Tags Systeme.io par tranche à la capture (ex. "sommeil-bas",
-- "score-eleve") pour segmenter l'emailing. Opt-in.
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS sio_score_tags BOOLEAN NOT NULL DEFAULT false;

-- Snapshot des scores au moment de la capture. Toujours des triplets
-- points/min/max (jamais un nombre nu). Forme :
-- {"global": {"points": 12, "min": 0, "max": 24},
--  "axes": {"<axisId>": {"points": ..., "min": ..., "max": ...}}}
ALTER TABLE public.quiz_leads ADD COLUMN IF NOT EXISTS scores JSONB;

NOTIFY pgrst, 'reload schema';
