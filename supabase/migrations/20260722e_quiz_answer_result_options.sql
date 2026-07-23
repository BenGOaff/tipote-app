-- 20260722e_quiz_answer_result_options.sql
-- Ameliorations presentation quiz (atelier juillet 2026) :
--   - answer_layout : disposition des reponses (auto / colonnes / liste).
--     NULL/'auto' = comportement historique (multiple_choice >= 3 options
--     -> 2 colonnes, sinon 1). Aucun impact sur les quiz existants.
--   - show_result_insight / show_result_projection : masquer une des deux
--     cartes de la page resultat. Default TRUE -> les quiz existants gardent
--     insight + projection exactement comme avant.
--   - show_result_share : rendre le bouton "Partager mon resultat" optionnel.
--     Default TRUE -> comportement inchange (bouton present).
--
-- 100% additif : booleens NOT NULL DEFAULT true, answer_layout nullable.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS answer_layout TEXT,
  ADD COLUMN IF NOT EXISTS show_result_insight BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_result_projection BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_result_share BOOLEAN NOT NULL DEFAULT true;

-- Recharge le cache de schema PostgREST (sinon 500 "column not found").
NOTIFY pgrst, 'reload schema';
