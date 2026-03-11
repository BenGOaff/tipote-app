-- ============================================================
-- Task enrichment: tags, subtasks, description, estimated_duration, due_date UI
-- ============================================================

-- 1. Add description + estimated_duration to project_tasks
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS estimated_duration TEXT DEFAULT NULL;
-- estimated_duration: free-text like "2h", "1 jour", "30min"

-- 2. Task tags (user-scoped, colored)
CREATE TABLE IF NOT EXISTS public.task_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tags"
  ON public.task_tags FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_task_tags_user ON public.task_tags(user_id);

-- 3. Task ↔ Tag junction
CREATE TABLE IF NOT EXISTS public.task_tag_assignments (
  task_id UUID NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.task_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

ALTER TABLE public.task_tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tag assignments"
  ON public.task_tag_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.task_tags t
      WHERE t.id = task_tag_assignments.tag_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.task_tags t
      WHERE t.id = task_tag_assignments.tag_id AND t.user_id = auth.uid()
    )
  );

-- 4. Task subtasks (checklist items)
CREATE TABLE IF NOT EXISTS public.task_subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_done BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.task_subtasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own subtasks"
  ON public.task_subtasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.project_tasks pt
      WHERE pt.id = task_subtasks.task_id AND pt.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_tasks pt
      WHERE pt.id = task_subtasks.task_id AND pt.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_task_subtasks_task ON public.task_subtasks(task_id);
