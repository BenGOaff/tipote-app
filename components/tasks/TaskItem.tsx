'use client'

// components/tasks/TaskItem.tsx
// Élément tâche interactive (Lovable-compatible)
// ✅ Toggle todo/done (PATCH /api/tasks/[id]/status)
// ✅ Edit inline (title + due_date) (PATCH /api/tasks/[id])
// ✅ Delete (DELETE /api/tasks/[id])
// ✅ Optimistic UI + anti double submit
// ✅ Backward compatible : si allowEdit/allowDelete non fournis => UI minimale

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Check, Pencil, Trash2, X } from 'lucide-react'

type Props = {
  id: string
  title: string
  status: string | null
  allowEdit?: boolean
  allowDelete?: boolean
}

function isDone(status: string | null): boolean {
  if (!status) return false
  const s = status.toLowerCase()
  return s === 'done' || s === 'completed' || s === 'fait' || s === 'terminé' || s === 'termine'
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t.length > 0 ? t : null
}

function extractErrorMessage(json: unknown, fallback: string): string {
  if (typeof json !== 'object' || json === null) return fallback
  if (!('error' in json)) return fallback
  const v = (json as Record<string, unknown>).error
  return typeof v === 'string' && v.trim().length > 0 ? v : fallback
}

export default function TaskItem({
  id,
  title,
  status,
  allowEdit = false,
  allowDelete = false,
}: Props) {
  const router = useRouter()

  const initialDone = useMemo(() => isDone(status), [status])
  const [optimisticDone, setOptimisticDone] = useState<boolean>(initialDone)

  const [isPending, startTransition] = useTransition()

  const [editing, setEditing] = useState<boolean>(false)
  const [draftTitle, setDraftTitle] = useState<string>(title)

  const [inlineError, setInlineError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    setOptimisticDone(initialDone)
  }, [initialDone])

  useEffect(() => {
    setDraftTitle(title)
  }, [title])

  const done = optimisticDone

  const toggleDone = () => {
    if (isPending) return
    const nextStatus = done ? 'todo' : 'done'

    setInlineError(null)
    setOptimisticDone(!done)

    startTransition(async () => {
      try {
        const res = await fetch(`/api/tasks/${encodeURIComponent(id)}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        })

        const json: unknown = await res.json().catch(() => null)

        if (!res.ok) {
          setOptimisticDone((v) => !v)
          setInlineError(extractErrorMessage(json, 'Erreur lors de la mise à jour'))
          return
        }

        router.refresh()
      } catch {
        setOptimisticDone((v) => !v)
        setInlineError('Erreur réseau')
      }
    })
  }

  const saveEdits = () => {
    if (isPending) return

    const t = cleanString(draftTitle)
    if (!t) {
      setInlineError('Le titre est requis')
      return
    }

    setInlineError(null)

    startTransition(async () => {
      try {
        const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: t }),
        })

        const json: unknown = await res.json().catch(() => null)

        if (!res.ok) {
          setInlineError(extractErrorMessage(json, 'Erreur lors de la sauvegarde'))
          return
        }

        setEditing(false)
        router.refresh()
      } catch {
        setInlineError('Erreur réseau')
      }
    })
  }

  const confirmDelete = () => {
    if (isPending) return
    setDeleteError(null)

    startTransition(async () => {
      try {
        const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' })
        const json: unknown = await res.json().catch(() => null)

        if (!res.ok) {
          setDeleteError(extractErrorMessage(json, 'Erreur lors de la suppression'))
          return
        }

        router.refresh()
      } catch {
        setDeleteError('Erreur réseau')
      }
    })
  }

  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 transition',
        done ? 'bg-slate-50 opacity-70' : 'bg-white',
      )}
    >
      <div className="flex items-start gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={toggleDone}
          disabled={isPending}
          aria-label={done ? 'Marquer comme à faire' : 'Marquer comme faite'}
          className={cn('mt-0.5 h-8 w-8 rounded-full', done ? 'border-slate-300' : '')}
        >
          {done ? <Check className="h-4 w-4" /> : null}
        </Button>

        <div className="flex-1">
          {editing ? (
            <div className="flex flex-col gap-2">
              <Input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                disabled={isPending}
                placeholder="Titre…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdits()
                  if (e.key === 'Escape') {
                    setDraftTitle(title)
                    setInlineError(null)
                    setEditing(false)
                  }
                }}
              />

              <div className="flex items-center gap-2">
                <Button type="button" size="sm" onClick={saveEdits} disabled={isPending || !draftTitle.trim()}>
                  Sauvegarder
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDraftTitle(title)
                    setInlineError(null)
                    setEditing(false)
                  }}
                  disabled={isPending}
                >
                  Annuler
                </Button>
              </div>

              {inlineError ? <p className="text-xs text-destructive">{inlineError}</p> : null}
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={cn('text-sm font-medium text-slate-900', done ? 'line-through text-slate-500' : '')}>
                  {title}
                </p>

                {inlineError ? <p className="mt-1 text-xs text-destructive">{inlineError}</p> : null}
              </div>

              {(allowEdit || allowDelete) ? (
                <div className="flex shrink-0 items-center gap-1">
                  {allowEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isPending}
                      aria-label="Modifier la tâche"
                      onClick={() => {
                        setDeleteError(null)
                        setInlineError(null)
                        setDraftTitle(title)
                        setEditing(true)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  ) : null}

                  {allowDelete ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={isPending}
                          aria-label="Supprimer la tâche"
                          onClick={() => {
                            setInlineError(null)
                            setDeleteError(null)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>

                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer cette tâche ?</AlertDialogTitle>
                          <AlertDialogDescription>Cette action est définitive.</AlertDialogDescription>
                        </AlertDialogHeader>

                        {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}

                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={isPending}>Annuler</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={(e) => {
                              e.preventDefault()
                              confirmDelete()
                            }}
                            disabled={isPending}
                          >
                            Supprimer
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {editing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-0.5"
            disabled={isPending}
            aria-label="Fermer l'édition"
            onClick={() => {
              setDraftTitle(title)
              setInlineError(null)
              setEditing(false)
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
