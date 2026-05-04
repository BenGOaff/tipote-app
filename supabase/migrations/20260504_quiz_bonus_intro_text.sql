-- JB feedback 2026-05-02: the share-to-unlock step's intro paragraph is
-- built from a fixed template ("Partage le quiz pour recevoir <bonus> avec
-- tes résultats."). JB wants to write the full message himself. Add a
-- nullable column that, when set, overrides the templated paragraph
-- entirely. Existing rows keep the templated behaviour (NULL).
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS bonus_intro_text TEXT;

COMMENT ON COLUMN public.quizzes.bonus_intro_text IS
  'Optional full custom paragraph shown on the share-to-unlock step. When NULL, the public client renders the localized template using bonus_description.';
