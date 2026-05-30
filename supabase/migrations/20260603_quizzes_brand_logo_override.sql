-- Adeline (30 mai 2026, suite) : "j'ai essayé de supprimer mon logo dans
-- les designs du quiz, mais celui par défaut est ajouté automatiquement.
-- Si je veux créer un quiz pour quelqu'un d'autre, mon logo doit pouvoir
-- être modifié."
--
-- Le logo vivait UNIQUEMENT au niveau du business_profile (single source
-- of truth). Conséquence : impossible de poser un logo différent par quiz
-- (cas client). Le bouton "Retirer" effaçait carrément le logo du business
-- profile → réapparition automatique dès qu'on rechargeait.
--
-- On ajoute deux colonnes sur quizzes pour faire de l'override par quiz :
--   • brand_logo_url : URL d'un logo spécifique à CE quiz. NULL = utiliser
--     le logo du business_profile (comportement actuel pour les quiz
--     existants strictement préservé).
--   • hide_brand_logo : si TRUE, masque TOUT logo sur ce quiz (pas même
--     le fallback business_profile). Sert quand on veut un quiz totalement
--     sans logo. Default FALSE pour ne rien changer aux quiz existants.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS brand_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS hide_brand_logo BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.quizzes.brand_logo_url IS
  'URL d''un logo override pour CE quiz uniquement. NULL = fallback sur business_profiles.brand_logo_url.';
COMMENT ON COLUMN public.quizzes.hide_brand_logo IS
  'Si TRUE, masque tout logo sur ce quiz (ni override, ni business profile). Default FALSE.';

NOTIFY pgrst, 'reload schema';
