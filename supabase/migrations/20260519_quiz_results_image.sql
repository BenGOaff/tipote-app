-- Adeline (18 mai 2026) : "ajoute la possibilité d'ajouter une image
-- dans les résultats, 10Mo max, gif acceptés et possible de drag and
-- drop à l'emplacement voulu dans la page de résultats. Il ne faut pas
-- mettre l'image dans un texte, c'est bien séparé".
--
-- → champ `image_url` séparé sur quiz_results (pas inline dans le HTML
-- d'un des champs rich-text). Position contrôlée par `image_position`
-- avec 5 slots logiques :
--   - "top"                  → tout en haut, au-dessus du titre
--   - "after_title"          → entre le titre et la description
--   - "after_description"    → entre la description et la prise de conscience
--   - "after_insight"        → entre la prise de conscience et le et si…
--   - "bottom"               → tout en bas, juste au-dessus du CTA
-- Default "top" — c'est l'emplacement classique d'une vignette de
-- résultat (au-dessus du titre, comme un hero image).
--
-- Les deux colonnes sont nullable (image_url) / avec default text
-- (image_position). Existing quizzes : aucune image, aucun changement.

ALTER TABLE public.quiz_results
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS image_position TEXT NOT NULL DEFAULT 'top';

COMMENT ON COLUMN public.quiz_results.image_url IS
  'URL Supabase Storage de l''image hero du résultat (séparée du texte). Default NULL.';
COMMENT ON COLUMN public.quiz_results.image_position IS
  'Position de l''image dans la page de résultat. Valeurs : top, after_title, after_description, after_insight, bottom. Default ''top''.';
