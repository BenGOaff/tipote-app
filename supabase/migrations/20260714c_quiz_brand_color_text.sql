-- 20260714c_quiz_brand_color_text.sql
-- Couleur des "autres textes" (réponses, corps) par quiz.
-- Nullable SANS default : NULL == "non choisie par l'user" -> le rendu
-- garde le foreground par défaut (aucun override émis). Les quiz existants
-- restent STRICTEMENT identiques tant que l'user n'a pas choisi.
-- (Béné 14 juil 2026 : contrôles design explicites principale / fond /
-- autres textes, sans rien casser sur l'existant.)

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS brand_color_text TEXT;

COMMENT ON COLUMN public.quizzes.brand_color_text IS
  'Couleur hex des autres textes (réponses, corps). NULL = défaut (foreground), aucun override.';

NOTIFY pgrst, 'reload schema';
