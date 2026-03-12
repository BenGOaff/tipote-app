-- Add explicit phase column to project_tasks
-- Fixes bug where custom tasks added to Phase 2/3 fall back to Phase 1 on reload
-- because phase was inferred from title matching against plan_json

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS phase TEXT;

COMMENT ON COLUMN public.project_tasks.phase IS 'Explicit phase assignment: p1, p2, or p3. NULL = infer from plan_json title matching.';
