// lib/tasksSync.ts
// Sync “smart” : business_plan.plan_json -> public.project_tasks
// ✅ Ne touche jamais aux tâches manuelles (source='manual')
// ✅ Remplace uniquement les tâches de stratégie (source='strategy')
// ✅ Préserve la progression: si une tâche stratégie existait (même title+due_date) on garde son status

export type AnyRecord = Record<string, unknown>;

function asRecord(v: unknown): AnyRecord | null {
  if (!v || typeof v !== "object") return null;
  return v as AnyRecord;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function cleanString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isIsoDateYYYYMMDD(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function normalizeDueDate(raw: unknown): string | null {
  const s = cleanString(raw);
  if (!s) return null;

  if (isIsoDateYYYYMMDD(s)) return s;

  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

function normalizePriority(raw: unknown): string | null {
  const s = cleanString(raw);
  if (!s) return null;
  const low = s.toLowerCase();
  return low === "high" ? "high" : null;
}

function normalizeTask(raw: unknown) {
  const r = asRecord(raw);
  if (!r) return null;

  const title = cleanString(r.title ?? r.task ?? r.name);
  if (!title) return null;

  const dueRaw = r.due_date ?? r.dueDate ?? r.deadline ?? r.date;
  const due_date = normalizeDueDate(dueRaw);

  const prioRaw = r.priority ?? r.prio ?? r.importance;
  const priority = normalizePriority(prioRaw);

  return { title, due_date, priority };
}

export function pickTasksFromPlan(planJson: AnyRecord | null) {
  if (!planJson) return [];

  const direct = asArray(planJson.tasks).map(normalizeTask).filter(Boolean);
  if (direct.length) return direct;

  const plan = asRecord(planJson.plan);
  const plan90 = asRecord(planJson.plan90 ?? planJson.plan_90 ?? planJson.plan_90_days);

  const a = asArray(plan?.tasks).map(normalizeTask).filter(Boolean);
  if (a.length) return a;

  const b = asArray(plan90?.tasks).map(normalizeTask).filter(Boolean);
  if (b.length) return b;

  const grouped = asRecord(plan90?.tasks_by_timeframe ?? planJson.tasks_by_timeframe);
  if (grouped) {
    const d30 = asArray(grouped.d30).map(normalizeTask).filter(Boolean);
    const d60 = asArray(grouped.d60).map(normalizeTask).filter(Boolean);
    const d90 = asArray(grouped.d90).map(normalizeTask).filter(Boolean);
    return [...d30, ...d60, ...d90].filter(Boolean);
  }

  return [];
}

function keyOf(title: string, due_date: string | null) {
  return `${title.toLowerCase().trim()}__${due_date ?? ""}`;
}

export async function syncStrategyTasksFromPlanJson(params: {
  supabase: any;
  userId: string;
  planJson: AnyRecord | null;
}) {
  const { supabase, userId, planJson } = params;

  const parsed = pickTasksFromPlan(planJson).filter(
    (t): t is { title: string; due_date: string | null; priority: string | null } => Boolean(t),
  );

  // préserver status existant + repérer les tâches soft-deleted
  const { data: existingStrategy, error: exErr } = await supabase
    .from("project_tasks")
    .select("title, due_date, status, deleted_at")
    .eq("user_id", userId)
    .eq("source", "strategy");

  if (exErr) {
    return { ok: false as const, error: exErr.message, inserted: 0 };
  }

  const statusByKey = new Map<string, string | null>();
  const deletedKeys = new Set<string>();
  for (const r of (existingStrategy ?? []) as AnyRecord[]) {
    const title = cleanString(r.title);
    if (!title) continue;
    const due = cleanString(r.due_date) || null;
    const k = keyOf(title, due);

    if (r.deleted_at != null) {
      // ✅ Tâche supprimée par l'user → ne pas recréer
      deletedKeys.add(k);
    } else {
      statusByKey.set(k, (r.status as string | null) ?? null);
    }
  }

  // delete uniquement strategy ACTIVES (pas les soft-deleted)
  const { error: delErr } = await supabase
    .from("project_tasks")
    .delete()
    .eq("user_id", userId)
    .eq("source", "strategy")
    .is("deleted_at", null);

  if (delErr) {
    return { ok: false as const, error: delErr.message, inserted: 0 };
  }

  if (parsed.length === 0) {
    return { ok: true as const, inserted: 0 };
  }

  // ✅ Exclure les tâches que l'user a supprimées
  const payload = parsed
    .filter((t) => !deletedKeys.has(keyOf(t.title, t.due_date ?? null)))
    .map((t) => ({
      user_id: userId,
      title: t.title,
      due_date: t.due_date ?? null,
      priority: t.priority ?? null,
      status: statusByKey.get(keyOf(t.title, t.due_date ?? null)) ?? "todo",
      source: "strategy",
    }));

  if (payload.length === 0) {
    return { ok: true as const, inserted: 0 };
  }

  const { error: insErr } = await supabase.from("project_tasks").insert(payload);
  if (insErr) {
    return { ok: false as const, error: insErr.message, inserted: 0 };
  }

  return { ok: true as const, inserted: payload.length };
}
