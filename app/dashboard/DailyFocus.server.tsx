// app/dashboard/DailyFocus.server.tsx
// Server component : sélection de la tâche "focus du jour"

import DailyFocus from '@/components/dashboard/DailyFocus'
import { getSupabaseServerClient } from '@/lib/supabaseServer'

type TaskRow = {
  id: string
  title: string
  status: string | null
  due_date: string | null
  created_at: string
}

function startOfTodayISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default async function DailyFocusServer() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <DailyFocus task={null} />
  }

  const todayISO = startOfTodayISO()

  // 1️⃣ tâche due aujourd’hui (priorité)
  const { data: todayTask } = await supabase
    .from('project_tasks')
    .select('id,title,status,due_date,created_at')
    .eq('user_id', user.id)
    .neq('status', 'done')
    .gte('due_date', todayISO)
    .order('due_date', { ascending: true })
    .limit(1)
    .maybeSingle<TaskRow>()

  if (todayTask) {
    return <DailyFocus task={todayTask} />
  }

  // 2️⃣ fallback : plus ancienne non faite
  const { data: fallbackTask } = await supabase
    .from('project_tasks')
    .select('id,title,status,due_date,created_at')
    .eq('user_id', user.id)
    .neq('status', 'done')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<TaskRow>()

  return <DailyFocus task={fallbackTask ?? null} />
}
