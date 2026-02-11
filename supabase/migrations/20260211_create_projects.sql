-- ============================================================
-- Migration : Multi-projets (feature ELITE)
-- ============================================================
-- 1. Crée la table `projects`
-- 2. Backfill : un projet par défaut par user existant
-- 3. Ajoute `project_id` aux tables scoped
-- 4. Backfill `project_id` sur les lignes existantes
-- 5. Contraintes FK + NOT NULL (après backfill)
-- 6. RLS policies sur `projects`
-- ============================================================

-- ────────────────────────────────────────────
-- 1. Table projects
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT 'Mon Tipote',
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Index pour lister les projets d'un user
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);

-- Un seul projet par défaut par user (partial unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_one_default_per_user
  ON public.projects(user_id) WHERE is_default = true;

-- RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- 2. Backfill : créer un projet default par user existant
-- ────────────────────────────────────────────
INSERT INTO public.projects (user_id, name, is_default, created_at, updated_at)
SELECT DISTINCT bp.user_id, 'Mon Tipote', true, now(), now()
FROM public.business_profiles bp
WHERE NOT EXISTS (
  SELECT 1 FROM public.projects p WHERE p.user_id = bp.user_id
);

-- ────────────────────────────────────────────
-- 3. Ajouter project_id aux tables scoped
-- ────────────────────────────────────────────

-- business_profiles
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- business_plan
ALTER TABLE public.business_plan
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- personas
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- competitor_analyses
ALTER TABLE public.competitor_analyses
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- onboarding_facts
ALTER TABLE public.onboarding_facts
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- onboarding_sessions
ALTER TABLE public.onboarding_sessions
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- coach_messages
ALTER TABLE public.coach_messages
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- content_item
ALTER TABLE public.content_item
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- project_tasks
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- quizzes
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- offer_pyramids
ALTER TABLE public.offer_pyramids
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- strategies
ALTER TABLE public.strategies
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- metrics
ALTER TABLE public.metrics
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- analytics_metrics
ALTER TABLE public.analytics_metrics
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- user_pepites
ALTER TABLE public.user_pepites
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- ────────────────────────────────────────────
-- 4. Backfill project_id sur les lignes existantes
--    (affecte le projet default de chaque user)
-- ────────────────────────────────────────────

UPDATE public.business_profiles bp
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = bp.user_id AND p.is_default = true AND bp.project_id IS NULL;

UPDATE public.business_plan bp
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = bp.user_id AND p.is_default = true AND bp.project_id IS NULL;

UPDATE public.personas pe
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = pe.user_id AND p.is_default = true AND pe.project_id IS NULL;

UPDATE public.competitor_analyses ca
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = ca.user_id AND p.is_default = true AND ca.project_id IS NULL;

UPDATE public.onboarding_facts of2
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = of2.user_id AND p.is_default = true AND of2.project_id IS NULL;

UPDATE public.onboarding_sessions os
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = os.user_id AND p.is_default = true AND os.project_id IS NULL;

UPDATE public.coach_messages cm
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = cm.user_id AND p.is_default = true AND cm.project_id IS NULL;

UPDATE public.content_item ci
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = ci.user_id AND p.is_default = true AND ci.project_id IS NULL;

UPDATE public.project_tasks pt
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = pt.user_id AND p.is_default = true AND pt.project_id IS NULL;

UPDATE public.quizzes q
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = q.user_id AND p.is_default = true AND q.project_id IS NULL;

UPDATE public.offer_pyramids op
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = op.user_id AND p.is_default = true AND op.project_id IS NULL;

UPDATE public.strategies s
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = s.user_id AND p.is_default = true AND s.project_id IS NULL;

UPDATE public.metrics m
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = m.user_id AND p.is_default = true AND m.project_id IS NULL;

UPDATE public.analytics_metrics am
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = am.user_id AND p.is_default = true AND am.project_id IS NULL;

UPDATE public.user_pepites up
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = up.user_id AND p.is_default = true AND up.project_id IS NULL;

-- ────────────────────────────────────────────
-- 5. Index sur project_id (les plus requêtées)
-- ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_business_profiles_project ON public.business_profiles(project_id);
CREATE INDEX IF NOT EXISTS idx_content_item_project ON public.content_item(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON public.project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_coach_messages_project ON public.coach_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_project ON public.quizzes(project_id);

-- ────────────────────────────────────────────
-- NOTE: On ne met PAS NOT NULL sur project_id tout de suite
-- pour permettre un déploiement progressif (fail-open).
-- Une fois toutes les routes migrées, lancer :
--
--   ALTER TABLE public.business_profiles ALTER COLUMN project_id SET NOT NULL;
--   ALTER TABLE public.content_item ALTER COLUMN project_id SET NOT NULL;
--   ... etc.
-- ────────────────────────────────────────────
