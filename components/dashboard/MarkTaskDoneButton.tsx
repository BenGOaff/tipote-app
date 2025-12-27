'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'

type Props = {
  taskId: string | null
  initialStatus?: string | null
  className?: string
}

function isDone(status: unknown): boolean {
  if (typeof status !== 'string') return false
  const s = status.trim().toLowerCase()
  return s === 'done' || s === 'completed' || s === 'fait' || s === 'terminé' || s === 'termine'
}

function extractOkError(json: unknown): { ok: boolean; error?: string } {
  if (typeof json !== 'object' || json === null) return { ok: false, error: 'Invalid response' }
  const rec = json as Record<string, unknown>
  const ok = rec.ok === true
  const error = typeof rec.error === 'string' ? rec.error : undefined
  return { ok, error }
}

export function MarkTaskDoneButton({ taskId, initialStatus, className }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [optimisticDone, setOptimisticDone] = useState<boolean | null>(null)

  const done = useMemo(() => {
    if (optimisticDone !== null) return optimisticDone
    return isDone(initialStatus)
  }, [initialStatus, optimisticDone])

  const disabled = pending || !taskId

  async function onClick() {
    if (!taskId || pending) return

    const nextStatus = done ? 'todo' : 'done'
    const prev = done

    setPending(true)
    setOptimisticDone(!done)

    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })

      const json = (await res.json().catch(() => null)) as unknown
      const { ok, error } = extractOkError(json)

      if (!res.ok || !ok) {
        setOptimisticDone(prev)
        toast({
          title: 'Impossible de mettre à jour la tâche',
          description: error || `Erreur ${res.status}`,
          variant: 'destructive',
        })
        return
      }

      toast({
        title: done ? 'Tâche remise à faire' : 'Tâche terminée',
        description: done ? 'Tu peux la reprendre quand tu veux.' : 'Bravo 🎉',
      })

      router.refresh()
    } catch (e) {
      setOptimisticDone(prev)
      toast({
        title: 'Erreur réseau',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant={done ? 'secondary' : 'default'}
      size="sm"
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      {pending ? '...' : done ? 'Annuler' : 'Marquer comme faite'}
    </Button>
  )
}

export default MarkTaskDoneButton
