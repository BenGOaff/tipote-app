// app/api/tasks/sync/route.ts
// Sync “smart” : business_plan -> project_tasks (dédupe + update safe)

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function toStr(x: unknown): string | null {
  return typeof x === "string" ? x : null;
}

function toArray(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

function parseDueDate(input: unknown): string | null {
  const s = toStr(input)?.trim();
  if (!s) return null;

  // Accept YYYY-MM-DD or ISO
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso.toISOString();

  // Very safe fallback: try YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

type TaskFromPlan = {
  title: string;
  due_date: string | null;
  source: string;
};

function extractTasksFromPlan(planJson: unknown): TaskFromPlan[] {
  if (!isRecord(planJson)) return [];

  const out: TaskFromPlan[] = [];

  // Heuristiques : plan_json peut avoir des sections variées.
  // On récupère:
  // - plan_90_days.tasks_by_timeframe (nouveau)
  // - action_plan_30_90.weeks_* (legacy)
  // - tasks[] (legacy simple)
  const plan90 = isRecord((planJson as any).plan_90_days) ? ((planJson as any).plan_90_days as Record<string, unknown>) : null;

  // New schema: plan_90_days.tasks_by_timeframe (objet)
  const tasksByTimeframe = plan90 && isRecord((plan90 as any).tasks_by_timeframe) ? ((plan90 as any).tasks_by_timeframe as Record<string, unknown>) : null;
  if (tasksByTimeframe) {
    for (const [, v] of Object.entries(tasksByTimeframe)) {
      const arr = toArray(v);
      for (const item of arr) {
        if (!isRecord(item)) continue;
        const title = toStr((item as any).task) ?? toStr((item as any).title);
        if (!title) continue;
        out.push({
          title: title.trim(),
          due_date: parseDueDate((item as any).due_date ?? (item as any).scheduled_for ?? (item as any).date),
          source: "plan_90_days",
        });
      }
    }
  }

  // Legacy: action_plan_30_90.weeks_1_4.actions etc.
  const actionPlan = isRecord((planJson as any).action_plan_30_90) ? ((planJson as any).action_plan_30_90 as Record<string, unknown>) : null;
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
          title,
          due_date: null,
          source: `action_plan_30_90:${k}`,
        });
      }
    }
  }

  // Legacy: top-level tasks
  const tasks = toArray((planJson as any).tasks);
  for (const t of tasks) {
    if (!isRecord(t)) continue;
    const title = toStr((t as any).task) ?? toStr((t as any).title);
    if (!title) continue;
    out.push({
      title: title.trim(),
      due_date: parseDueDate((t as any).due_date ?? (t as any).date),
      source: "tasks",
    });
  }

  // Dédoublonnage basique (title + due_date + source)
  const seen = new Set<string>();
  const uniq: TaskFromPlan[] = [];
  for (const t of out) {
    const key = `${normalizeTitle(t.title)}__${t.due_date ?? ""}__${t.source}`;
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

    // Charger business_plan (via session user)
    const { data: planRow, error: planErr } = await supabase
      .from("business_plan")
      .select("id, plan_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (planErr) {
      return NextResponse.json({ ok: false, error: planErr.message }, { status: 500 });
    }
    if (!planRow?.plan_json) {
      return NextResponse.json({ ok: false, error: "Business plan not found" }, { status: 404 });
    }

    const tasks = extractTasksFromPlan(planRow.plan_json);
    if (tasks.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0, updated: 0, total: 0 }, { status: 200 });
    }

    // IMPORTANT:
    // On fait les writes sur project_tasks avec supabaseAdmin (service_role) pour éviter les blocages RLS.
    // On garde l'auth user + on force user_id = auth.user.id dans toutes les écritures.
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("project_tasks")
      .select("id, title, due_date, source")
      .eq("user_id", userId);

    if (existingErr) {
      console.error("Load existing tasks error:", existingErr);
      return NextResponse.json({ ok: false, error: existingErr.message }, { status: 500 });
    }

    const existingIndex = new Map<string, { id: string; title: string; due_date: string | null; source: string }>();
    for (const row of existing ?? []) {
      const key = `${normalizeTitle(row.title)}__${row.due_date ?? ""}__${row.source ?? ""}`;
      existingIndex.set(key, row as any);
    }

    const toUpdate: { id: string; patch: Record<string, any> }[] = [];
    const toInsert: Record<string, any>[] = [];

    for (const t of tasks) {
      const key = `${normalizeTitle(t.title)}__${t.due_date ?? ""}__${t.source}`;
      const ex = existingIndex.get(key);

      if (ex) {
        // Update soft : champs “safe” uniquement.
        toUpdate.push({
          id: ex.id,
          patch: {
            title: t.title,
            due_date: t.due_date,
            source: t.source,
            updated_at: new Date().toISOString(),
          },
        });
      } else {
        toInsert.push({
          user_id: userId,
          title: t.title,
          due_date: t.due_date,
          source: t.source,
          status: "todo",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Batch updates (séquentiel pour limiter les soucis timeouts)
    let updated = 0;
    for (const u of toUpdate) {
      const { error } = await supabaseAdmin
        .from("project_tasks")
        .update(u.patch)
        .eq("id", u.id)
        .eq("user_id", userId);

      if (!error) updated += 1;
    }

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
