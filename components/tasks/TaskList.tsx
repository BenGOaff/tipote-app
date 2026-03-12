'use client'

// components/tasks/TaskList.tsx
// Liste de tâches – version interactive (compatible avec /app/tasks/page.tsx)
// ✅ Props: title, showSync, allowCreate, allowEdit, allowDelete, variant
// ✅ Default export + named export (compat)
// ✅ Sync via POST /api/tasks/sync
// ✅ Création via POST /api/tasks
// ✅ Passe allowEdit/allowDelete à TaskItem

import { useMemo, useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'

import TaskItemRow from './TaskItem'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type TaskItemType = {
  id: string
  title: string
  status: string | null
  priority?: string | null
  source?: string | null
}

export type TaskItem = TaskItemType

type Props = {
  tasks: TaskItemType[]
  title?: string
  showSync?: boolean
  allowCreate?: boolean
  allowEdit?: boolean
  allowDelete?: boolean
  variant?: 'card' | 'default'
}

function cleanTitle(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

function parseOkError(json: unknown): { ok: boolean; error?: string } | null {
  if (typeof json !== 'object' || json === null) return null
  const ok = (json as Record<string, unknown>).ok
  const error = (json as Record<string, unknown>).error
  return {
    ok: ok === true,
    error: typeof error === 'string' ? error : undefined,
  }
}

export function TaskList({
  tasks,
  title,
  showSync = false,
  allowCreate = false,
  allowEdit = false,
  allowDelete = false,
  variant = 'default',
}: Props) {
  const router = useRouter()

  const [newTitle, setNewTitle] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [createPending, setCreatePending] = useState(false)
  // Optimistic: local tasks for immediate UI feedback
  const [optimisticTasks, setOptimisticTasks] = useState<TaskItemType[]>([])

  const [syncPending, startSync] = useTransition()

  const containerClass = useMemo(() => {
    if (variant === 'card') return 'space-y-4'
    return 'space-y-4'
  }, [variant])

  // Merge server tasks + optimistic tasks
  const allTasks = useMemo(() => {
    const serverIds = new Set(tasks.map(t => t.id))
    // Only keep optimistic tasks that haven't appeared in server data yet
    const pending = optimisticTasks.filter(t => !serverIds.has(t.id))
    return [...tasks, ...pending]
  }, [tasks, optimisticTasks])

  const sortedTasks = useMemo(() => {
    const copy = [...allTasks]
    copy.sort((a, b) => {
      const ad = (a.status ?? '').toLowerCase()
      const bd = (b.status ?? '').toLowerCase()
      const aIsDone = ad === 'done' || ad === 'completed' || ad === 'fait' || ad === 'terminé' || ad === 'termine'
      const bIsDone = bd === 'done' || bd === 'completed' || bd === 'fait' || bd === 'terminé' || bd === 'termine'
      if (aIsDone === bIsDone) return 0
      return aIsDone ? 1 : -1
    })
    return copy
  }, [allTasks])

  const canShowHeader = Boolean(title) || showSync || allowCreate

  const handleSync = () => {
    if (syncPending) return
    setError(null)

    startSync(async () => {
      try {
        const res = await fetch('/api/tasks/sync', { method: 'POST' })
        const json: unknown = await res.json().catch(() => null)
        const parsed = parseOkError(json)

        if (!res.ok || !parsed?.ok) {
          setError(parsed?.error ?? 'Sync impossible')
          return
        }

        router.refresh()
      } catch {
        setError('Erreur réseau')
      }
    })
  }

  const handleCreate = useCallback(async () => {
    if (createPending) return

    const t = cleanTitle(newTitle)
    if (!t) {
      setError('Titre requis')
      return
    }

    setError(null)
    setCreatePending(true)

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t }),
      })

      const json: unknown = await res.json().catch(() => null)
      const parsed = parseOkError(json)

      if (!res.ok || !parsed?.ok) {
        setError(parsed?.error ?? 'Création impossible')
        return
      }

      // Extract the created task for optimistic update
      const taskData = (json as Record<string, unknown>)?.task as Record<string, unknown> | undefined
      if (taskData) {
        setOptimisticTasks((prev) => [...prev, {
          id: String(taskData.id ?? `temp-${Date.now()}`),
          title: t,
          status: 'todo',
          priority: null,
          source: 'manual',
        }])
      }

      setNewTitle('')
      router.refresh()
    } catch {
      setError('Erreur réseau')
    } finally {
      setCreatePending(false)
    }
  }, [createPending, newTitle, router])

  return (
    <div className={containerClass}>
      {canShowHeader ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="truncate text-base font-semibold">{title}</h2> : null}
            <p className="text-sm text-muted-foreground">
              {allTasks.length} tâche{allTasks.length > 1 ? 's' : ''}
            </p>
            {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {showSync ? (
              <Button type="button" variant="outline" size="sm" onClick={handleSync} disabled={syncPending}>
                Sync tâches
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {allowCreate ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Ajouter une tâche…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
            disabled={createPending}
          />
          <Button type="button" size="sm" onClick={handleCreate} disabled={createPending || newTitle.trim().length === 0}>
            Ajouter
          </Button>
        </div>
      ) : null}

      <div className={cn('flex flex-col gap-2', variant === 'card' ? '' : '')}>
        {sortedTasks.map((t) => (
          <TaskItemRow
            key={t.id}
            id={t.id}
            title={t.title}
            status={t.status}
            allowEdit={allowEdit}
            allowDelete={allowDelete}
          />
        ))}
      </div>
    </div>
  )
}

export default TaskList
