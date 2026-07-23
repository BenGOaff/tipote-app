-- 20260722c_quiz_layout.sql
-- Dispositions de question facon Tally : centre (historique) / aligne a
-- gauche / colonnes (panneau media + question). Toutes les colonnes sont
-- nullable sans default -> NULL = comportement historique exact. Les quiz
-- existants (dont ceux sous pub) sont rendus STRICTEMENT comme avant tant
-- que le createur n'a rien change.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS question_layout TEXT,
  ADD COLUMN IF NOT EXISTS split_image_url TEXT,
  ADD COLUMN IF NOT EXISTS split_side TEXT;

COMMENT ON COLUMN public.quizzes.question_layout IS
  'Disposition des questions : centered (defaut/NULL) | left | split.';
COMMENT ON COLUMN public.quizzes.split_image_url IS
  'URL image/GIF du panneau media en disposition split (bucket public-assets). NULL si non utilisee.';
COMMENT ON COLUMN public.quizzes.split_side IS
  'Cote du panneau media en split : left (defaut/NULL) | right.';

NOTIFY pgrst, 'reload schema';
