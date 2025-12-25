'use client'

// components/tasks/TaskList.tsx
// Liste de tâches – version interactive (compatible avec /app/tasks/page.tsx)
// ✅ Supporte props attendues: title, showSync, allowCreate, allowEdit, allowDelete, variant
// ✅ Continue de fonctionner en default export ET named export
// ✅ Sync via POST /api/tasks/sync
// ✅ Création via POST /api/tasks

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import TaskItemRow from './TaskItem'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type TaskItemType = {
  id: string
  title: string
  status: string | null
  due_date?: string | null
}

// Alias compat : app/tasks/page.tsx fait `type TaskItem`
export type TaskItem = TaskItemType

type Variant = 'card' | 'default'

type Props = {
  tasks: TaskItemType[]

  // Props attendues par /app/tasks/page.tsx
  title?: string
  showSync?: boolean
  allowCreate?: boolean
  allowEdit?: boolean
  allowDelete?: boolean
  variant?: Variant
}

export function TaskList({
  title,
  tasks,
  showSync = false,
  allowCreate = false,
  allowEdit = false,
  allowDelete = false,
  variant = 'default',
}: Props) {
  const router = useRouter()
  const [isSyncPending, startSync] = useTransition()
  const [isCreatePending, startCreate] = useTransition()
  const [newTitle, setNewTitle] = useState('')

  const canShowHeader = !!title || showSync || allowCreate || allowEdit || allowDelete

  const containerClass = useMemo(() => {
    if (variant === 'card') return 'space-y-4'
    return 'space-y-3'
  }, [variant])

  const listClass = useMemo(() => {
    if (variant === 'card') return 'space-y-2'
    return 'space-y-2'
  }, [variant])

  const handleSync = () => {
    startSync(async () => {
      try {
        const res = await fetch('/api/tasks/sync', { method: 'POST' })
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
        if (!res.ok || !json?.ok) {
          // eslint-disable-next-line no-console
          console.error(json?.error || 'Sync failed')
          return
        }
        router.refresh()
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
      }
    })
  }

  const handleCreate = () => {
    const t = newTitle.trim()
    if (!t) return

    startCreate(async () => {
      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: t }),
        })
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
        if (!res.ok || !json?.ok) {
          // eslint-disable-next-line no-console
          console.error(json?.error || 'Create failed')
          return
        }
        setNewTitle('')
        router.refresh()
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
      }
    })
  }

  return (
    <div className={containerClass}>
      {canShowHeader ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="truncate text-base font-semibold">{title}</h2> : null}
            <p className="text-sm text-muted-foreground">
              {tasks.length} tâche{tasks.length > 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {showSync ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleSync}
                disabled={isSyncPending}
              >
                {isSyncPending ? 'Sync...' : 'Sync tâches'}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {allowCreate ? (
        <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center', variant === 'card' ? '' : '')}>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Ajouter une tâche…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
            disabled={isCreatePending}
          />
          <Button
            type="button"
            size="sm"
            onClick={handleCreate}
            disabled={isCreatePending || !newTitle.trim()}
            className="sm:shrink-0"
          >
            {isCreatePending ? 'Ajout...' : 'Ajouter'}
          </Button>
        </div>
      ) : null}

      <div className={listClass}>
        {tasks.map((t) => (
          <TaskItemRow
            key={t.id}
            id={t.id}
            title={t.title}
            status={t.status}
            dueDate={t.due_date}
          />
        ))}
      </div>
    </div>
  )
}

// ✅ Compat default import
export default TaskList
