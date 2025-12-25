"use client";

// components/tasks/TaskItem.tsx
// Élément tâche interactif
// ✅ Toggle todo/done (PATCH /api/tasks/[id]/status)
// ✅ Edit inline (PATCH /api/tasks/[id])
// ✅ Delete (DELETE /api/tasks/[id])
// ✅ Optimistic UI + anti double submit

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Check, Pencil, Trash2, X } from "lucide-react";

type Props = {
  id: string;
  title: string;
  status: string | null;
  dueDate?: string | null;
  allowEdit?: boolean;
  allowDelete?: boolean;
};

function isDone(status: string | null): boolean {
  if (!status) return false;
  const low = status.toLowerCase();
  return low === "done" || low === "completed" || low === "fait" || low === "terminé" || low === "termine";
}

function formatDueDate(dueDate: string): string {
  // On laisse la valeur telle quelle (Supabase peut renvoyer YYYY-MM-DD)
  // On évite toute lib date lourde ici.
  return dueDate;
}

export default function TaskItem({
  id,
  title,
  status,
  dueDate,
  allowEdit = false,
  allowDelete = false,
}: Props) {
  const router = useRouter();

  const initialDone = useMemo(() => isDone(status), [status]);
  const [optimisticDone, setOptimisticDone] = useState<boolean>(initialDone);

  const [isPending, startTransition] = useTransition();

  const [editing, setEditing] = useState<boolean>(false);
  const [draftTitle, setDraftTitle] = useState<string>(title);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setOptimisticDone(initialDone);
  }, [initialDone]);

  useEffect(() => {
    setDraftTitle(title);
  }, [title]);

  async function toggleDone() {
    if (isPending) return;

    const next = optimisticDone ? "todo" : "done";
    setOptimisticDone(!optimisticDone);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/tasks/${encodeURIComponent(id)}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        });

        const json: unknown = await res.json().catch(() => null);

        if (!res.ok) {
          // rollback
          setOptimisticDone((v) => !v);

          const msg =
            typeof json === "object" && json !== null && "error" in json && typeof (json as { error?: unknown }).error === "string"
              ? (json as { error: string }).error
              : "Erreur lors de la mise à jour";
          setEditError(msg);
          return;
        }

        router.refresh();
      } catch {
        setOptimisticDone((v) => !v);
        setEditError("Erreur réseau");
      }
    });
  }

  async function saveTitle() {
    if (isPending) return;

    const trimmed = draftTitle.trim();
    if (!trimmed) {
      setEditError("Le titre est requis");
      return;
    }

    setEditError(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmed }),
        });

        const json: unknown = await res.json().catch(() => null);

        if (!res.ok) {
          const msg =
            typeof json === "object" && json !== null && "error" in json && typeof (json as { error?: unknown }).error === "string"
              ? (json as { error: string }).error
              : "Erreur lors de la sauvegarde";
          setEditError(msg);
          return;
        }

        setEditing(false);
        router.refresh();
      } catch {
        setEditError("Erreur réseau");
      }
    });
  }

  async function deleteTask() {
    if (isPending) return;

    setDeleteError(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });

        const json: unknown = await res.json().catch(() => null);

        if (!res.ok) {
          const msg =
            typeof json === "object" && json !== null && "error" in json && typeof (json as { error?: unknown }).error === "string"
              ? (json as { error: string }).error
              : "Erreur lors de la suppression";
          setDeleteError(msg);
          return;
        }

        router.refresh();
      } catch {
        setDeleteError("Erreur réseau");
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 transition",
        optimisticDone ? "bg-slate-50 opacity-70" : "bg-white",
      )}
    >
      <div className="flex items-start gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={toggleDone}
          disabled={isPending}
          aria-label={optimisticDone ? "Marquer comme à faire" : "Marquer comme faite"}
          className={cn("mt-0.5 h-8 w-8 rounded-full", optimisticDone ? "border-slate-300" : "")}
        >
          {optimisticDone ? <Check className="h-4 w-4" /> : null}
        </Button>

        <div className="flex-1">
          {editing ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  disabled={isPending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTitle();
                    if (e.key === "Escape") {
                      setDraftTitle(title);
                      setEditError(null);
                      setEditing(false);
                    }
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" onClick={saveTitle} disabled={isPending || !draftTitle.trim()}>
                    Sauvegarder
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDraftTitle(title);
                      setEditError(null);
                      setEditing(false);
                    }}
                    disabled={isPending}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
              {editError ? <p className="text-xs text-destructive">{editError}</p> : null}
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium text-slate-900",
                    optimisticDone ? "line-through text-slate-500" : "",
                  )}
                >
                  {title}
                </p>
                {dueDate ? (
                  <p className="text-xs text-slate-500">Échéance : {formatDueDate(dueDate)}</p>
                ) : null}
                {editError ? <p className="mt-1 text-xs text-destructive">{editError}</p> : null}
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
                        setDeleteError(null);
                        setEditError(null);
                        setDraftTitle(title);
                        setEditing(true);
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
                            setEditError(null);
                            setDeleteError(null);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer cette tâche ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Cette action est définitive.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={isPending}>Annuler</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={(e) => {
                              e.preventDefault();
                              deleteTask();
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
              setDraftTitle(title);
              setEditError(null);
              setEditing(false);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
