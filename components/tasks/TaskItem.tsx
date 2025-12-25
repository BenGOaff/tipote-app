"use client";

// components/tasks/TaskItem.tsx
// Élément tâche interactif (Lovable-compatible)
// ✅ Toggle todo/done (PATCH /api/tasks/[id]/status)
// ✅ Edit inline (title + due_date) (PATCH /api/tasks/[id])
// ✅ Delete (DELETE /api/tasks/[id])
// ✅ Optimistic UI + anti double submit
// ✅ TS strict (zéro any, zéro as)

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/alert-dialog";

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
  return (
    low === "done" ||
    low === "completed" ||
    low === "fait" ||
    low === "terminé" ||
    low === "termine"
  );
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function toDateInputValue(raw: string | null | undefined): string {
  if (!raw) return "";
  // gère ISO (2025-12-25T...) et YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDueDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function extractErrorMessage(json: unknown, fallback: string): string {
  if (typeof json !== "object" || json === null) return fallback;
  if (!("error" in json)) return fallback;
  const v = (json as { error?: unknown }).error;
  return typeof v === "string" && v.trim().length > 0 ? v : fallback;
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
  const [draftDueDate, setDraftDueDate] = useState<string>(toDateInputValue(dueDate));
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setOptimisticDone(initialDone);
  }, [initialDone]);

  useEffect(() => {
    setDraftTitle(title);
  }, [title]);

  useEffect(() => {
    setDraftDueDate(toDateInputValue(dueDate));
  }, [dueDate]);

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
          setOptimisticDone((v) => !v);
          setEditError(extractErrorMessage(json, "Erreur lors de la mise à jour"));
          return;
        }

        router.refresh();
      } catch {
        setOptimisticDone((v) => !v);
        setEditError("Erreur réseau");
      }
    });
  }

  async function saveEdits() {
    if (isPending) return;

    const t = cleanString(draftTitle);
    if (!t) {
      setEditError("Le titre est requis");
      return;
    }

    // due_date: "" => null
    const normalizedDueDate: string | null = draftDueDate.trim().length > 0 ? draftDueDate.trim() : null;

    setEditError(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: t, due_date: normalizedDueDate }),
        });

        const json: unknown = await res.json().catch(() => null);

        if (!res.ok) {
          setEditError(extractErrorMessage(json, "Erreur lors de la sauvegarde"));
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
        const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
        const json: unknown = await res.json().catch(() => null);

        if (!res.ok) {
          setDeleteError(extractErrorMessage(json, "Erreur lors de la suppression"));
          return;
        }

        router.refresh();
      } catch {
        setDeleteError("Erreur réseau");
      }
    });
  }

  const done = optimisticDone;

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 transition",
        done ? "bg-slate-50 opacity-70" : "bg-white",
      )}
    >
      <div className="flex items-start gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={toggleDone}
          disabled={isPending}
          aria-label={done ? "Marquer comme à faire" : "Marquer comme faite"}
          className={cn("mt-0.5 h-8 w-8 rounded-full", done ? "border-slate-300" : "")}
        >
          {done ? <Check className="h-4 w-4" /> : null}
        </Button>

        <div className="flex-1">
          {editing ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2">
                <Input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  disabled={isPending}
                  placeholder="Titre…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdits();
                    if (e.key === "Escape") {
                      setDraftTitle(title);
                      setDraftDueDate(toDateInputValue(dueDate));
                      setEditError(null);
                      setEditing(false);
                    }
                  }}
                />

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    type="date"
                    value={draftDueDate}
                    onChange={(e) => setDraftDueDate(e.target.value)}
                    disabled={isPending}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDraftDueDate("")}
                      disabled={isPending || draftDueDate.length === 0}
                    >
                      Effacer date
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" onClick={saveEdits} disabled={isPending || !draftTitle.trim()}>
                    Sauvegarder
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDraftTitle(title);
                      setDraftDueDate(toDateInputValue(dueDate));
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
                    done ? "line-through text-slate-500" : "",
                  )}
                >
                  {title}
                </p>

                {dueDate ? <p className="text-xs text-slate-500">Échéance : {formatDueDate(dueDate)}</p> : null}

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
                        setDraftDueDate(toDateInputValue(dueDate));
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
                          <AlertDialogDescription>Cette action est définitive.</AlertDialogDescription>
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
              setDraftDueDate(toDateInputValue(dueDate));
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
