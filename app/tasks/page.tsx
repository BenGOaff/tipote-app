// app/tasks/page.tsx
// Page dédiée "Tâches" (public.project_tasks) + Sync + CRUD
// ✅ UI alignée Lovable (structure, espacements, card, header)
// ✅ Utilise AppShell (sidebar + top header)
// ✅ Requêtes SSR Supabase + auth guard
// ✅ Passe allowEdit/allowDelete au TaskList

import Link from 'next/link'
import { redirect } from 'next/navigation'

import AppShell from '@/components/AppShell'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { TaskList, type TaskItem } from '@/components/tasks/TaskList'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, CheckCircle2, ListChecks } from 'lucide-react'

type TaskRow = {
  id: string | number
  title: string | null
  status: string | null
  due_date: string | null
  priority: string | null
  source: string | null
  created_at: string | null
}

function toTaskItem(row: TaskRow): TaskItem {
  return {
    id: String(row.id),
    title: row.title ?? '',
    status: row.status ?? null,
    due_date: row.due_date ?? null,
    priority: row.priority ?? null,
    source: row.source ?? null,
  }
}

function isDone(status: string | null): boolean {
  if (!status) return false
  const s = status.toLowerCase()
  return s === 'done' || s === 'completed' || s === 'fait' || s === 'terminé' || s === 'termine'
}

export default async function TasksPage() {
  const supabase = await getSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) redirect('/')

  const userEmail = session.user.email ?? ''

  const { data: tasksRaw } = await supabase
    .from('project_tasks')
    .select('id, title, status, due_date, priority, source, created_at')
    .eq('user_id', session.user.id)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  const tasks: TaskItem[] = Array.isArray(tasksRaw)
    ? (tasksRaw as TaskRow[]).map(toTaskItem).filter((t) => t.title.trim().length > 0)
    : []

  const doneCount = tasks.filter((t) => isDone(t.status)).length
  const totalCount = tasks.length

  return (
    <AppShell
      userEmail={userEmail}
      headerTitle="Tâches"
      headerRight={
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href="/app">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Link>
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {/* Hero / résumé (Lovable-ish) */}
        <Card className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-xl bg-primary/10 p-2 text-primary">
                <ListChecks className="h-5 w-5" />
              </div>

              <div>
                <h1 className="text-2xl font-bold tracking-tight">Gère ton exécution</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ajoute, planifie et coche tes tâches pour rester dans le rythme.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {doneCount}/{totalCount} terminées
                  </Badge>
                  <Badge variant="secondary">{totalCount} au total</Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/strategy">Voir la stratégie</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/create">Créer en 1 clic</Link>
              </Button>
            </div>
          </div>
        </Card>

        {/* Liste */}
        <Card className="p-6">
          <TaskList
            title="Mes tâches"
            tasks={tasks}
            showSync
            allowCreate
            allowEdit
            allowDelete
            variant="card"
          />
        </Card>

        {tasks.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Astuce : si tu viens de générer ta stratégie, clique sur <span className="font-medium">Sync tâches</span>.
          </div>
        ) : null}
      </div>
    </AppShell>
  )
}
