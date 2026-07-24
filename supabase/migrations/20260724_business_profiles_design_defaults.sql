-- 20260724_business_profiles_design_defaults.sql
-- Modele de design PAR PROJET : chaque business_profile (donc chaque projet
-- d'un user multiprofils) memorise sa disposition/forme preferee. Ces valeurs
-- sont ESTAMPILLEES sur chaque NOUVEAU quiz/sondage a la creation (jamais sur
-- les quiz existants). Toutes nullable sans default -> NULL = aucune
-- preference = rendu historique. Les quiz deja crees ne bougent pas.
--
-- Les couleurs/police/logo restent gerees par les colonnes brand_* existantes
-- (deja par projet sur business_profiles). Ici on ne stocke QUE la mise en
-- forme structurelle qui, elle, vit par-quiz et n'avait pas de defaut projet.

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS default_question_layout TEXT,
  ADD COLUMN IF NOT EXISTS default_intro_layout TEXT,
  ADD COLUMN IF NOT EXISTS default_button_shape TEXT,
  ADD COLUMN IF NOT EXISTS default_answer_layout TEXT,
  ADD COLUMN IF NOT EXISTS default_background_style TEXT,
  ADD COLUMN IF NOT EXISTS default_background_gradient TEXT;

COMMENT ON COLUMN public.business_profiles.default_question_layout IS
  'Modele projet : disposition des questions estampillee sur les nouveaux quiz (centered|left|split). NULL = pas de preference.';
COMMENT ON COLUMN public.business_profiles.default_intro_layout IS
  'Modele projet : disposition de l''accueil (card|cover). NULL = pas de preference.';
COMMENT ON COLUMN public.business_profiles.default_button_shape IS
  'Modele projet : forme des boutons (pill|rounded|square). NULL = pas de preference.';
COMMENT ON COLUMN public.business_profiles.default_answer_layout IS
  'Modele projet : disposition des reponses (auto|grid|list). NULL = pas de preference.';
COMMENT ON COLUMN public.business_profiles.default_background_style IS
  'Modele projet : style de fond (solid|gradient). NULL = pas de preference.';
COMMENT ON COLUMN public.business_profiles.default_background_gradient IS
  'Modele projet : cle du degrade quand default_background_style=gradient. NULL sinon.';

NOTIFY pgrst, 'reload schema';
