// app/dashboard/DailyFocus.server.tsx
// Server component : sélection de la tâche "focus du jour"

import DailyFocus from '@/components/dashboard/DailyFocus'
import { getSupabaseServerClient } from '@/lib/supabaseServer'

type TaskRow = {
  id: string
  title: string
  status: string | null
  created_at: string
}

export default async function DailyFocusServer() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <DailyFocus task={null} />
  }

  // Première tâche non faite, par ordre de création (priorité naturelle du plan)
  const { data: task } = await supabase
    .from('project_tasks')
    .select('id,title,status,created_at')
    .eq('user_id', user.id)
    .neq('status', 'done')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<TaskRow>()

  return <DailyFocus task={task ?? null} />
}
