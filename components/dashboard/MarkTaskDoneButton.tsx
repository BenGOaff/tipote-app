'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'

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

  if (!taskId) return null

  // ✅ Narrowing TS (évite string | null dans encodeURIComponent)
  const taskIdStr: string = taskId

  async function onClick() {
    if (pending || done) return

    setPending(true)
    setOptimisticDone(true)

    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskIdStr)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      })

      const json: unknown = await res.json().catch(() => null)
      const parsed = extractOkError(json)

      if (!res.ok || !parsed.ok) {
        setOptimisticDone(null)
        // eslint-disable-next-line no-console
        console.error(parsed.error || 'Failed to update task')
      } else {
        router.refresh()
      }
    } catch (e) {
      setOptimisticDone(null)
      // eslint-disable-next-line no-console
      console.error(e)
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
      disabled={pending || done}
      onClick={onClick}
    >
      {done ? 'Fait ✅' : pending ? '...' : 'Marquer comme faite'}
    </Button>
  )
}

export default MarkTaskDoneButton
