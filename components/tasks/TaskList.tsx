"use client";

// components/tasks/TaskList.tsx
// Liste de tâches – version interactive (compatible avec /app/tasks/page.tsx)
// ✅ Supporte props: title, showSync, allowCreate, allowEdit, allowDelete, variant
// ✅ Default export + named export
// ✅ Sync via POST /api/tasks/sync
// ✅ Création via POST /api/tasks

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import TaskItemRow from "./TaskItem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type TaskItemType = {
  id: string;
  title: string;
  status: string | null;
  due_date?: string | null;
};

export type TaskItem = TaskItemType;

type Props = {
  tasks: TaskItemType[];
  title?: string;
  showSync?: boolean;
  allowCreate?: boolean;
  allowEdit?: boolean;
  allowDelete?: boolean;
  variant?: "card" | "default";
};

function cleanTitle(value: string): string | null {
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function TaskList({
  tasks,
  title,
  showSync = false,
  allowCreate = false,
  allowEdit = false,
  allowDelete = false,
  variant = "default",
}: Props) {
  const router = useRouter();

  const [newTitle, setNewTitle] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const [isCreatePending, startCreateTransition] = useTransition();

  const canShowHeader = !!title || showSync || allowCreate || allowEdit || allowDelete;

  const sortedTasks = useMemo(() => {
    // tri simple : todo d'abord puis done (mais on ne force pas le status exact)
    const copy = [...tasks];
    copy.sort((a, b) => {
      const ad = (a.status ?? "").toLowerCase();
      const bd = (b.status ?? "").toLowerCase();
      const aIsDone = ad === "done" || ad === "completed" || ad === "fait" || ad === "terminé" || ad === "termine";
      const bIsDone = bd === "done" || bd === "completed" || bd === "fait" || bd === "terminé" || bd === "termine";
      if (aIsDone === bIsDone) return 0;
      return aIsDone ? 1 : -1;
    });
    return copy;
  }, [tasks]);

  async function handleSync() {
    if (isPending) return;

    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/tasks/sync", { method: "POST" });
        const json: unknown = await res.json().catch(() => null);

        if (!res.ok) {
          const msg =
            typeof json === "object" && json !== null && "error" in json && typeof (json as { error?: unknown }).error === "string"
              ? (json as { error: string }).error
              : "Erreur sync";
          setError(msg);
          return;
        }

        router.refresh();
      } catch {
        setError("Erreur réseau");
      }
    });
  }

  async function handleCreate() {
    if (isCreatePending) return;

    const t = cleanTitle(newTitle);
    if (!t) {
      setError("Titre requis");
      return;
    }

    setError(null);

    startCreateTransition(async () => {
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: t }),
        });

        const json: unknown = await res.json().catch(() => null);

        if (!res.ok) {
          const msg =
            typeof json === "object" && json !== null && "error" in json && typeof (json as { error?: unknown }).error === "string"
              ? (json as { error: string }).error
              : "Erreur création";
          setError(msg);
          return;
        }

        setNewTitle("");
        router.refresh();
      } catch {
        setError("Erreur réseau");
      }
    });
  }

  return (
    <div className={cn("w-full", variant === "card" ? "" : "")}>
      {canShowHeader ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
            {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {showSync ? (
              <Button type="button" variant="outline" size="sm" onClick={handleSync} disabled={isPending}>
                Sync tâches
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {allowCreate ? (
        <div className="mb-4">
          <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center", variant === "card" ? "" : "")}>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Ajouter une tâche…"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              disabled={isCreatePending}
            />
            <Button type="button" size="sm" onClick={handleCreate} disabled={isCreatePending || !newTitle.trim()}>
              Ajouter
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {sortedTasks.map((t) => (
          <TaskItemRow
            key={t.id}
            id={t.id}
            title={t.title}
            status={t.status}
            dueDate={t.due_date}
            allowEdit={allowEdit}
            allowDelete={allowDelete}
          />
        ))}
      </div>
    </div>
  );
}

// ✅ Compat default import
export default TaskList;
