-- Studio visuel : MÉMOIRE DE STYLE de l'utilisateur (Tipote + affilié).
--
-- Deux usages, deux tables :
--   1. `visual_studio_styles` : combinaisons NOMMÉES enregistrées par l'user
--      (style de fond + couleurs + police + format + logo). Rechargées en 1 clic
--      pour générer des visuels qui se ressemblent en ne variant que le contenu.
--   2. `visual_studio_votes` : 👍/👎 sur les visuels générés + snapshot des
--      réglages → on apprend le style préféré de l'user et on biaise les défauts.
--
-- Accès : chaque user ne voit/écrit QUE ses lignes (RLS sur auth.uid()). Marche
-- pour Tipote ET pour l'affilié (tous deux authentifiés via Supabase Auth).

CREATE TABLE IF NOT EXISTS public.visual_studio_styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Réglages du studio qui définissent "un look" (cf. lib/visualStudio/stylePrefs.ts).
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vstudio_styles_user
  ON public.visual_studio_styles (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.visual_studio_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- +1 (j'aime) / -1 (je n'aime pas).
  vote smallint NOT NULL CHECK (vote IN (-1, 1)),
  -- Style de fond IA jugé (photoPerson / minimal / abstract / …) + snapshot des
  -- réglages, pour pondérer les défauts au fil du temps.
  ai_style text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vstudio_votes_user
  ON public.visual_studio_votes (user_id, created_at DESC);

ALTER TABLE public.visual_studio_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visual_studio_votes ENABLE ROW LEVEL SECURITY;

-- RLS : l'utilisateur gère uniquement ses propres lignes.
DROP POLICY IF EXISTS vstudio_styles_owner ON public.visual_studio_styles;
CREATE POLICY vstudio_styles_owner ON public.visual_studio_styles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS vstudio_votes_owner ON public.visual_studio_votes;
CREATE POLICY vstudio_votes_owner ON public.visual_studio_votes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
