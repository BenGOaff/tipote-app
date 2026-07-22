-- 20260722_quiz_presentation.sql
-- Présentation façon Typeform/Tally : fonds riches (dégradé/image), écran
-- d'accueil en couverture, et mémoire du thème appliqué.
-- TOUTES les colonnes sont nullable sans default -> NULL = comportement
-- historique exact. Les quiz existants (dont ceux sous pub) sont rendus
-- STRICTEMENT comme avant tant que l'user n'a rien changé.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS background_style TEXT,
  ADD COLUMN IF NOT EXISTS background_gradient TEXT,
  ADD COLUMN IF NOT EXISTS background_image_url TEXT,
  ADD COLUMN IF NOT EXISTS intro_layout TEXT,
  ADD COLUMN IF NOT EXISTS theme_id TEXT;

COMMENT ON COLUMN public.quizzes.background_style IS
  'Style de fond : solid (défaut/NULL) | gradient | image.';
COMMENT ON COLUMN public.quizzes.background_gradient IS
  'Clé de dégradé (palette fermée QUIZ_GRADIENTS). NULL si non utilisé.';
COMMENT ON COLUMN public.quizzes.background_image_url IS
  'URL image de fond (bucket public-assets). NULL si non utilisée.';
COMMENT ON COLUMN public.quizzes.intro_layout IS
  'Disposition de l accueil : card (défaut/NULL) | cover.';
COMMENT ON COLUMN public.quizzes.theme_id IS
  'Thème prêt-à-l-emploi appliqué (affichage éditeur). NULL = réglages manuels.';

NOTIFY pgrst, 'reload schema';
