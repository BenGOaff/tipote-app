// app/api/tasks/sync/route.ts
// Sync “smart” : business_plan -> project_tasks (dédupe + update safe)

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";

type AnyRecord = Record<string, unknown>;

type Priority = "low" | "medium" | "high";
type Status = "todo" | "in_progress" | "blocked" | "done";

type TaskFromPlan = {
  title: string;
  priority?: Priority | null;
  source: string; // e.g. 'strategy'
};

function isRecord(x: unknown): x is AnyRecord {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function toStr(x: unknown): string | null {
  return typeof x === "string" ? x : null;
}

function toArray(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

function clampLen(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function normalizeTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[’'"]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "");
}

function normalizePriority(x: unknown): Priority | null {
  const s = (toStr(x) ?? "").trim().toLowerCase();
  if (!s) return null;

  if (s === "high" || s === "haute" || s === "urgent" || s === "h") return "high";
  if (s === "medium" || s === "moyenne" || s === "mid" || s === "m") return "medium";
  if (s === "low" || s === "basse" || s === "l") return "low";

  return null;
}

function extractTasksFromPlan(planJson: unknown): TaskFromPlan[] {
  if (!isRecord(planJson)) return [];

  const out: TaskFromPlan[] = [];

  // Heuristiques : plan_json peut avoir des sections variées.
  // On récupère:
  // - plan_90_days|plan90|plan_90.tasks_by_timeframe (nouveau)
  // - action_plan_30_90.weeks_* (legacy)
  // - tasks[] (legacy simple)
  const plan90 =
    (isRecord((planJson as any).plan_90_days) ? ((planJson as any).plan_90_days as AnyRecord) : null) ||
    (isRecord((planJson as any).plan90) ? ((planJson as any).plan90 as AnyRecord) : null) ||
    (isRecord((planJson as any).plan_90) ? ((planJson as any).plan_90 as AnyRecord) : null);

  // New schema: plan_90_days|plan90|plan_90.tasks_by_timeframe (objet)
  // Fallback: plan_json.tasks_by_timeframe (certains payloads historiques)
  const tasksByTimeframe =
    (plan90 && isRecord((plan90 as any).tasks_by_timeframe) ? ((plan90 as any).tasks_by_timeframe as AnyRecord) : null) ||
    (isRecord((planJson as any).tasks_by_timeframe) ? ((planJson as any).tasks_by_timeframe as AnyRecord) : null);

  if (tasksByTimeframe) {
    for (const [, v] of Object.entries(tasksByTimeframe)) {
      const arr = toArray(v);
      for (const item of arr) {
        if (!isRecord(item)) continue;

        const title =
          toStr((item as any).title) ??
          toStr((item as any).task) ??
          toStr((item as any).name) ??
          toStr((item as any).label);

        if (!title) continue;

        out.push({
          title: clampLen(title, 180),
          priority: normalizePriority((item as any).priority ?? (item as any).importance),
          source: "strategy",
        });
      }
    }
  }

  // Legacy: action_plan_30_90.weeks_*.[actions|string[]]
  const actionPlan = isRecord((planJson as any).action_plan_30_90)
    ? ((planJson as any).action_plan_30_90 as Record<string, unknown>)
    : null;

  if (actionPlan) {
    for (const [k, v] of Object.entries(actionPlan)) {
      if (!k.startsWith("weeks_")) continue;
      if (!isRecord(v)) continue;

      const actions = toArray((v as any).actions);
      for (const a of actions) {
        if (typeof a !== "string") continue;
        const title = a.trim();
        if (!title) continue;

        out.push({
          title: clampLen(title, 180),
          priority: null,
          source: `action_plan_30_90:${k}`,
        });
      }
    }
  }

  // Legacy: tasks[]
  const legacyTasks = toArray((planJson as any).tasks);
  if (legacyTasks.length > 0) {
    for (const item of legacyTasks) {
      if (!isRecord(item)) continue;

      const title = toStr((item as any).title) ?? toStr((item as any).task) ?? toStr((item as any).name);
      if (!title) continue;

      out.push({
        title: clampLen(title, 180),
        priority: normalizePriority((item as any).priority ?? (item as any).importance),
        source: "tasks",
      });
    }
  }

  // Dédoublonnage basique (title + source)
  const seen = new Set<string>();
  const uniq: TaskFromPlan[] = [];
  for (const t of out) {
    const key = `${normalizeTitle(t.title)}__${t.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(t);
  }

  return uniq;
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError) {
      return NextResponse.json({ ok: false, error: authError.message }, { status: 401 });
    }
    if (!authData?.user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const userId = authData.user.id;
    const projectId = await getActiveProjectId(supabase, userId);

    // Charger business_plan (via session user)
    let planQuery = supabase
      .from("business_plan")
      .select("plan_json")
      .eq("user_id", userId);

    if (projectId) planQuery = planQuery.eq("project_id", projectId);

    const { data: planRow, error: planErr } = await planQuery
      .maybeSingle<{ plan_json: unknown }>();

    if (planErr) {
      return NextResponse.json({ ok: false, error: planErr.message }, { status: 400 });
    }

    const planJson = planRow?.plan_json ?? null;
    const tasks = extractTasksFromPlan(planJson);

    if (!tasks.length) {
      return NextResponse.json({ ok: true, inserted: 0, updated: 0, total: 0 }, { status: 200 });
    }

    // Lire existantes (uniquement sur les sources présentes dans le plan)
    // ⚠️ On inclut aussi les tâches soft-deleted pour ne pas les recréer
    const sources = Array.from(new Set(tasks.map((t) => t.source))).filter(Boolean);

    let existingQuery = supabaseAdmin
      .from("project_tasks")
      .select("id,title,source,priority,status,deleted_at")
      .eq("user_id", userId)
      .in("source", sources);

    if (projectId) existingQuery = existingQuery.eq("project_id", projectId);

    const { data: existing, error: existingErr } = await existingQuery;

    if (existingErr) {
      return NextResponse.json({ ok: false, error: existingErr.message }, { status: 500 });
    }

    const existingIndex = new Map<
      string,
      { id: string; title: string; source: string; priority: Priority | null; status: Status | null; deleted: boolean }
    >();

    for (const row of existing ?? []) {
      const key = `${normalizeTitle(String((row as any).title ?? ""))}__${String(
        (row as any).source ?? "",
      )}`;
      existingIndex.set(key, {
        id: String((row as any).id),
        title: String((row as any).title ?? ""),
        source: String((row as any).source ?? ""),
        priority: (row as any).priority ? (String((row as any).priority) as Priority) : null,
        status: (row as any).status ? (String((row as any).status) as Status) : null,
        deleted: (row as any).deleted_at != null,
      });
    }

    const toUpdate: { id: string; patch: Record<string, any> }[] = [];
    const toInsert: Record<string, any>[] = [];

    for (const t of tasks) {
      const key = `${normalizeTitle(t.title)}__${t.source}`;
      const ex = existingIndex.get(key);

      if (ex) {
        // ✅ Si la tâche a été supprimée par l'user, on ne la recrée pas
        if (ex.deleted) continue;

        // Update soft : title + priority only
        const patch: Record<string, any> = {};

        if (t.title && t.title !== ex.title) patch.title = t.title;
        if (!ex.priority && t.priority) patch.priority = t.priority;

        if (Object.keys(patch).length > 0) {
          toUpdate.push({ id: ex.id, patch });
        }
      } else {
        const insertPayload: Record<string, unknown> = {
          user_id: userId,
          title: t.title,
          priority: t.priority ?? null,
          status: "todo" satisfies Status,
          source: t.source,
        };
        if (projectId) insertPayload.project_id = projectId;
        toInsert.push(insertPayload);
      }
    }

    // Appliquer updates
    let updated = 0;
    for (const u of toUpdate) {
      let upQuery = supabaseAdmin
        .from("project_tasks")
        .update(u.patch)
        .eq("id", u.id)
        .eq("user_id", userId);

      if (projectId) upQuery = upQuery.eq("project_id", projectId);

      const { error: upErr } = await upQuery;

      if (upErr) {
        console.error("Update task error:", upErr);
        return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
      }
      updated += 1;
    }

    // Insert new
    let inserted = 0;
    if (toInsert.length > 0) {
      const { error: insErr } = await supabaseAdmin.from("project_tasks").insert(toInsert);
      if (insErr) {
        console.error("Insert tasks error:", insErr);
        return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
      }
      inserted = toInsert.length;
    }

    return NextResponse.json(
      {
        ok: true,
        inserted,
        updated,
        total: tasks.length,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Unhandled error in /api/tasks/sync:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
export async function PATCH() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
