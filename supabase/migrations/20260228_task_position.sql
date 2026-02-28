-- Add position column for task ordering (drag & drop persistence)
ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Create index for efficient ordering
CREATE INDEX IF NOT EXISTS idx_project_tasks_position
  ON public.project_tasks (user_id, position)
  WHERE deleted_at IS NULL;
