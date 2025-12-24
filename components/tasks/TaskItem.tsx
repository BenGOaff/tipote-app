'use client'

// components/tasks/TaskItem.tsx
// Élément tâche interactif (Lovable-compatible)
// ✅ Toggle todo/done
// ✅ Optimistic UI
// ✅ Aucun impact sur la structure existante

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  id: string
  title: string
  status: string | null
  dueDate?: string | null
}

export default function TaskItem({ id, title, status, dueDate }: Props) {
  const [currentStatus, setCurrentStatus] = useState(status ?? 'todo')
  const [isPending, startTransition] = useTransition()

  const toggle = () => {
    const next = currentStatus === 'done' ? 'todo' : 'done'

    // optimistic
    setCurrentStatus(next)

    startTransition(async () => {
      const res = await fetch(`/api/tasks/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })

      if (!res.ok) {
        // rollback si erreur
        setCurrentStatus(currentStatus)
      }
    })
  }

  const done = currentStatus === 'done'

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-xl border px-4 py-3 transition',
        done ? 'bg-slate-50 opacity-70' : 'bg-white',
      )}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={toggle}
          disabled={isPending}
          className={cn(
            'mt-1 h-5 w-5 rounded-md border flex items-center justify-center',
            done
              ? 'border-[#b042b4] bg-[#b042b4]'
              : 'border-slate-300 bg-white',
          )}
        >
          {done && <span className="text-[10px] font-bold text-white">✓</span>}
        </button>

        <div className="min-w-0">
          <p
            className={cn(
              'text-sm font-medium',
              done && 'line-through text-slate-500',
            )}
          >
            {title}
          </p>
          {dueDate && (
            <p className="text-xs text-slate-500">
              Échéance : {dueDate}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
