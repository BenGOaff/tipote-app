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
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { TaskList, type TaskItem } from '@/components/tasks/TaskList'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type TaskRow = {
  id: string
  title: string | null
  status: string | null
  due_date: string | null
  priority: string | null
  source: string | null
  created_at: string | null
}

function isDone(status: string | null) {
  return (status ?? '').toLowerCase() === 'done'
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

export default async function TasksPage() {
  const supabase = await getSupabaseServerClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) redirect('/')

  const userEmail = session.user.email ?? ''

  // ✅ IMPORTANT (prod/RLS-safe):
  // On lit les tâches via supabaseAdmin (service_role) car les policies RLS peuvent renvoyer [] sans erreur.
  // On filtre STRICTEMENT par user_id de la session -> aucune fuite de données.
  const { data: tasksRaw } = await supabaseAdmin
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
        <Button asChild variant="secondary" size="sm">
          <Link href="/strategy">Retour</Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Hero */}
        <Card className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-foreground"
                >
                  <path
                    d="M9 6H21"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 12H21"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 18H21"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M3.99988 6.00001L4.99988 7.00001L6.99988 5.00001"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M3.99988 12L4.99988 13L6.99988 11"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M3.99988 18L4.99988 19L6.99988 17"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <div className="min-w-0">
                <h1 className="text-lg font-semibold leading-tight">Gère ton exécution</h1>
                <p className="text-sm text-muted-foreground">
                  Ajoute, planifie et coche tes tâches pour rester dans le rythme.
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="gap-2">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M12 8V12L15 15"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                      </svg>
                    </span>
                    <span>
                      {doneCount}/{totalCount} terminées
                    </span>
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
