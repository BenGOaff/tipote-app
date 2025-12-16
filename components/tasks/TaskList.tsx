"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  allowCreate?: boolean;
  allowEdit?: boolean;
  allowDelete?: boolean;
  variant?: "card" | "flat";
  hideHeader?: boolean;
};

function isDone(status: string | null) {
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

function toDateInputValue(iso: string | null) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isVirtualTaskId(id: string) {
  return id.startsWith("plan-") || id.startsWith("fallback-") || id.startsWith("tmp-");
}

export function TaskList({
  title,
  tasks,
  showSync = false,
  allowCreate = false,
  allowEdit = false,
  allowDelete = false,
  variant = "card",
  hideHeader = false,
}: Props) {
  const router = useRouter();
  const [syncing, startSync] = useTransition();

  const [msg, setMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newImportant, setNewImportant] = useState(false);
  const [savingNew, setSavingNew] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editImportant, setEditImportant] = useState(false);
  const [editDone, setEditDone] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...tasks];
    copy.sort((a, b) => {
      const doneA = isDone(a.status);
      const doneB = isDone(b.status);
      if (doneA !== doneB) return doneA ? 1 : -1;

      const impA = String(a.importance ?? "").toLowerCase() === "high";
      const impB = String(b.importance ?? "").toLowerCase() === "high";
      if (impA !== impB) return impA ? -1 : 1;

      const da = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
      const db = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;

      return a.title.localeCompare(b.title);
    });
    return copy;
  }, [tasks]);

  const outerClassName =
    variant === "card" ? "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" : "space-y-3";
  const mt3 = variant === "card" ? "mt-3" : "";
  const mt4 = variant === "card" ? "mt-4" : "";

  function openEdit(task: TaskItem) {
    setMsg(null);

    if (isVirtualTaskId(task.id)) {
      setMsg("Cette tâche vient du plan stratégique. Fais un Sync pour l’importer dans la base.");
      return;
    }

    setEditingId(task.id);
    setEditTitle(task.title ?? "");
    setEditDescription(task.description ?? "");
    setEditDueDate(toDateInputValue(task.due_date));
    setEditImportant(String(task.importance ?? "").toLowerCase() === "high");
    setEditDone(isDone(task.status));
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
    setEditDueDate("");
    setEditImportant(false);
    setEditDone(false);
    setSavingEdit(false);
  }

  async function toggle(task: TaskItem) {
    setMsg(null);

    if (isVirtualTaskId(task.id)) {
      setMsg("Cette tâche vient du plan stratégique. Fais un Sync pour l’importer dans la base.");
      return;
    }

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

  async function syncFromPlan() {
    setMsg(null);

    startSync(async () => {
      try {
        const res = await fetch("/api/tasks/sync", { method: "POST" });
        const data = (await res.json()) as { ok: boolean; error?: string; inserted?: number };
        if (!data.ok) {
          setMsg(data.error ?? "Erreur sync");
          return;
        }
        setMsg(`Sync OK (+${data.inserted ?? 0})`);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Erreur inconnue");
      }
    });
  }

  async function createTask() {
    setMsg(null);
    const t = newTitle.trim();
    if (!t) {
      setMsg("Titre requis");
      return;
    }

    setSavingNew(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          description: newDescription.trim() ? newDescription.trim() : null,
          due_date: newDueDate ? newDueDate : null,
          importance: newImportant ? "high" : null,
          status: "todo",
        }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setMsg(data.error ?? "Erreur création");
        return;
      }

      setNewTitle("");
      setNewDescription("");
      setNewDueDate("");
      setNewImportant(false);
      setCreating(false);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSavingNew(false);
    }
  }

  async function saveEdit() {
    setMsg(null);
    if (!editingId) return;

    const t = editTitle.trim();
    if (!t) {
      setMsg("Titre requis");
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/tasks/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          description: editDescription.trim() ? editDescription.trim() : null,
          due_date: editDueDate ? editDueDate : null,
          importance: editImportant ? "high" : null,
          done: editDone,
        }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setMsg(data.error ?? "Erreur édition");
        setSavingEdit(false);
        return;
      }

      closeEdit();
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur inconnue");
      setSavingEdit(false);
    }
  }

  async function deleteTask(task: TaskItem) {
    setMsg(null);

    if (isVirtualTaskId(task.id)) {
      setMsg("Cette tâche vient du plan stratégique. Fais un Sync pour l’importer dans la base.");
      return;
    }

    const ok = window.confirm("Supprimer cette tâche ?");
    if (!ok) return;

    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setMsg(data.error ?? "Erreur suppression");
        return;
      }
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur inconnue");
    }
  }

  return (
    <>
      <div className={outerClassName}>
        {!hideHeader ? (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-xs text-slate-500">{sorted.length} tâche(s)</p>
            </div>

            <div className="flex items-center gap-2">
              {allowCreate ? (
                <Button
                  className="h-9 bg-[#b042b4] text-white hover:opacity-95"
                  onClick={() => setCreating((v) => !v)}
                  disabled={savingNew}
                >
                  {creating ? "Fermer" : "Nouvelle tâche"}
                </Button>
              ) : null}

              {showSync ? (
                <Button variant="outline" className="h-9" onClick={syncFromPlan} disabled={syncing}>
                  {syncing ? "Sync…" : "Sync tâches"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {msg ? (
          <div className={`${mt3} rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700`}>
            {msg}
          </div>
        ) : null}

        {allowCreate && creating ? (
          <div className={`${mt4} rounded-2xl border border-slate-200 bg-white p-4`}>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold text-slate-700">Titre</label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Préparer 5 idées de posts LinkedIn"
                />
              </div>

              <div className="grid gap-1.5">
                <label className="text-xs font-semibold text-slate-700">Description</label>
                <Textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Optionnel"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold text-slate-700">Échéance</label>
                  <Input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
                </div>

                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold text-slate-700">Priorité</label>
                  <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                    <Checkbox checked={newImportant} onCheckedChange={(v) => setNewImportant(Boolean(v))} />
                    <span className="text-xs text-slate-700">Important</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" className="h-9" onClick={() => setCreating(false)} disabled={savingNew}>
                  Annuler
                </Button>
                <Button
                  className="h-9 bg-[#b042b4] text-white hover:opacity-95"
                  onClick={createTask}
                  disabled={savingNew}
                >
                  {savingNew ? "Création…" : "Créer"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {sorted.length === 0 ? (
          <div className={`${mt4} rounded-2xl border border-slate-200 bg-slate-50 p-4`}>
            <p className="text-sm font-semibold text-slate-900">Aucune tâche</p>
            <p className="mt-1 text-xs text-slate-600">Ajoute une tâche ou synchronise depuis ta stratégie.</p>
            {showSync ? (
              <p className="mt-2 text-xs text-slate-500">(Astuce : lance un “Sync tâches” pour importer depuis la stratégie.)</p>
            ) : null}
          </div>
        ) : (
          <div className={`${mt4} space-y-2`}>
            {sorted.map((t) => {
              const done = isDone(t.status);
              const important = String(t.importance ?? "").toLowerCase() === "high";
              const virtual = isVirtualTaskId(t.id);

              return (
                <div
                  key={t.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 hover:bg-slate-50"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <Checkbox checked={done} disabled={virtual} onCheckedChange={() => toggle(t)} className="mt-0.5" />

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-semibold ${done ? "line-through text-slate-400" : "text-slate-900"}`}>
                          {t.title}
                        </p>

                        {virtual ? (
                          <Badge variant="secondary">Depuis stratégie</Badge>
                        ) : important ? (
                          <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Important</Badge>
                        ) : null}
                      </div>

                      {t.description ? (
                        <p className={`mt-0.5 text-xs ${done ? "text-slate-400" : "text-slate-600"}`}>{t.description}</p>
                      ) : null}

                      {(allowEdit || allowDelete) && !virtual ? (
                        <div className="mt-2 flex items-center gap-2">
                          {allowEdit ? (
                            <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => openEdit(t)}>
                              Modifier
                            </Button>
                          ) : null}
                          {allowDelete ? (
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-8 px-2 text-xs text-red-600 hover:text-red-700"
                              onClick={() => deleteTask(t)}
                            >
                              Supprimer
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-xs font-semibold text-slate-700">{formatDate(t.due_date)}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{virtual ? "À importer" : done ? "Fait" : "À faire"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={(open) => (open ? setEditOpen(true) : closeEdit())}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Modifier la tâche</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-slate-700">Titre</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-slate-700">Description</label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={4} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold text-slate-700">Échéance</label>
                <Input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
              </div>

              <div className="grid gap-1.5">
                <label className="text-xs font-semibold text-slate-700">Priorité</label>
                <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                  <Checkbox checked={editImportant} onCheckedChange={(v) => setEditImportant(Boolean(v))} />
                  <span className="text-xs text-slate-700">Important</span>
                </div>
              </div>
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-slate-700">Statut</label>
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                <Checkbox checked={editDone} onCheckedChange={(v) => setEditDone(Boolean(v))} />
                <span className="text-xs text-slate-700">Marquer comme fait</span>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={closeEdit} disabled={savingEdit}>
              Annuler
            </Button>
            <Button className="bg-[#b042b4] text-white hover:opacity-95" onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
