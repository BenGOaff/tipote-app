"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

export type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  due_date: string | null; // YYYY-MM-DD or ISO
  importance: string | null;
};

type Props = {
  title: string;
  tasks: TaskItem[];
  showSync?: boolean;
};

function isDone(status: string | null | undefined) {
  const s = String(status ?? "").toLowerCase();
  return ["done", "completed", "termin", "finished"].some((k) => s.includes(k));
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mm, dd] = m;
  return `${dd}/${mm}/${y}`;
}

export function TaskList({ title, tasks, showSync }: Props) {
  const router = useRouter();
  const [syncing, startSync] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const copy = [...tasks];
    copy.sort((a, b) => {
      const da = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
      const db = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      const ia = String(a.importance ?? "").toLowerCase() === "high" ? 0 : 1;
      const ib = String(b.importance ?? "").toLowerCase() === "high" ? 0 : 1;
      return ia - ib;
    });
    return copy;
  }, [tasks]);

  async function toggle(task: TaskItem) {
    setMsg(null);
    const nextDone = !isDone(task.status);

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: nextDone }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setMsg(data.error ?? "Erreur");
        return;
      }
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur inconnue");
    }
  }

  function syncFromPlan() {
    setMsg(null);
    startSync(async () => {
      try {
        const res = await fetch("/api/tasks/sync", { method: "POST" });
        const data = (await res.json()) as { ok: boolean; error?: string; inserted?: number };
        if (!data.ok) {
          setMsg(data.error ?? "Erreur sync");
          return;
        }
        setMsg(`Sync OK (${data.inserted ?? 0})`);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Erreur inconnue");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">{sorted.length} tâche(s)</p>
        </div>

        {showSync ? (
          <Button
            variant="outline"
            className="h-9"
            onClick={syncFromPlan}
            disabled={syncing}
          >
            {syncing ? "Sync…" : "Sync tâches"}
          </Button>
        ) : null}
      </div>

      {msg ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {msg}
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-center">
          <p className="text-sm text-slate-600">Aucune tâche ici.</p>
          <p className="mt-1 text-xs text-slate-500">
            (Astuce : lance un “Sync tâches” pour importer depuis la stratégie.)
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {sorted.map((t) => {
            const done = isDone(t.status);
            const important = String(t.importance ?? "").toLowerCase() === "high";

            return (
              <div
                key={t.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 hover:bg-slate-50"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Checkbox
                    checked={done}
                    onCheckedChange={() => toggle(t)}
                    className="mt-0.5"
                  />

                  <div className="min-w-0">
                    <p
                      className={[
                        "text-sm font-semibold truncate",
                        done ? "text-slate-400 line-through" : "text-slate-900",
                      ].join(" ")}
                    >
                      {t.title}
                    </p>
                    {t.description ? (
                      <p className="mt-1 text-xs text-slate-600 line-clamp-2">{t.description}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[11px]">
                        {done ? "done" : "todo"}
                      </Badge>
                      <Badge variant="outline" className="text-[11px]">
                        Échéance : {formatDate(t.due_date)}
                      </Badge>
                      {important ? (
                        <Badge variant="outline" className="text-[11px]">
                          Important
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
