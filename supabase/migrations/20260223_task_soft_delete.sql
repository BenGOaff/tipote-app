-- Soft-delete pour project_tasks
-- Au lieu de supprimer physiquement une tâche, on marque deleted_at.
-- Cela empêche le sync de recréer les tâches supprimées par l'utilisateur.

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Index partiel pour accélérer le filtre "tâches actives" (deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_project_tasks_active
  ON public.project_tasks (user_id, project_id)
  WHERE deleted_at IS NULL;
