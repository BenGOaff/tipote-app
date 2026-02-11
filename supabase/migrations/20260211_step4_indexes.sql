/*
  ETAPE 4 : Index sur project_id pour les tables les plus requetees
*/

CREATE INDEX IF NOT EXISTS idx_business_profiles_project ON public.business_profiles(project_id);
CREATE INDEX IF NOT EXISTS idx_content_item_project ON public.content_item(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON public.project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_coach_messages_project ON public.coach_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_project ON public.quizzes(project_id);
