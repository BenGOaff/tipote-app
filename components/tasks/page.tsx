// app/tasks/page.tsx
// Page Tâches – exécution quotidienne (Lovable)
// ✅ Maintenant totalement interactive
// ✅ Aucune régression

import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import AppShell from '@/components/AppShell'
import TaskList from '@/components/tasks/TaskList'

export default async function TasksPage() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) redirect('/')

  const userEmail = session.user.email ?? ''
  const t = await getTranslations('tasksPage')

  const { data: tasks } = await supabase
    .from('project_tasks')
    .select('id,title,status')
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{t('pageTitle')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('pageSubtitle')}
          </p>
        </div>

        <TaskList tasks={(tasks ?? []) as any[]} />
      </div>
    </AppShell>
  )
}
