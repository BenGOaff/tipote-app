-- Add storytelling JSONB column to business_profiles
-- Stores the 6-step storytelling framework:
-- {
--   "situation_initiale": "...",
--   "element_declencheur": "...",
--   "peripeties": "...",
--   "moment_critique": "...",
--   "resolution": "...",
--   "situation_finale": "..."
-- }

ALTER TABLE public.business_profiles
ADD COLUMN IF NOT EXISTS storytelling JSONB DEFAULT NULL;

COMMENT ON COLUMN public.business_profiles.storytelling IS 'Storytelling en 6 étapes du parcours fondateur (situation initiale, élément déclencheur, péripéties, moment critique, résolution, situation finale)';
