// app/api/tasks/sync/route.ts
// Sync des tâches : plan_json (business_plan) -> table tasks
// - delete+insert pour éviter les doublons
// - fonctionne avec la session user (RLS attendu: user_id = auth.uid())

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type AnyRecord = Record<string, unknown>;

type PlanTask = {
  title?: string;
  description?: string;
  status?: string | null;
  due_date?: string | null;
  dueDate?: string | null;
  importance?: string | null;
};

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function pickTasksFromPlan(planJson: AnyRecord | null): PlanTask[] {
  if (!planJson) return [];
  const direct = asArray(planJson.tasks) as PlanTask[];
  if (direct.length) return direct;

  const plan = (planJson.plan as AnyRecord | undefined) ?? null;
  const plan90 = (planJson.plan_90_days as AnyRecord | undefined) ?? null;

  const a = asArray(plan?.tasks) as PlanTask[];
  if (a.length) return a;

  const b = asArray(plan90?.tasks) as PlanTask[];
  if (b.length) return b;

  // parfois: { d30:[], d60:[], d90:[] }
  const grouped =
    (plan90?.tasks_by_timeframe as AnyRecord | undefined) ??
    (planJson.tasks_by_timeframe as AnyRecord | undefined) ??
    null;

  if (grouped && typeof grouped === "object") {
    const d30 = asArray((grouped as AnyRecord).d30) as PlanTask[];
    const d60 = asArray((grouped as AnyRecord).d60) as PlanTask[];
    const d90 = asArray((grouped as AnyRecord).d90) as PlanTask[];
    return [...d30, ...d60, ...d90].filter(Boolean);
  }

  return [];
}

function normalizeTask(t: PlanTask) {
  const title = typeof t.title === "string" ? t.title.trim() : "";
  const description = typeof t.description === "string" ? t.description.trim() : "";
  const status = typeof t.status === "string" ? t.status.trim() : "todo";

  const due = (t.due_date ?? t.dueDate ?? null) as string | null;
  const due_date = typeof due === "string" && due.trim() ? due.trim() : null;

  const importance =
    typeof t.importance === "string" && t.importance.trim()
      ? t.importance.trim().toLowerCase()
      : null;

  return { title, description, status, due_date, importance };
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: planRow, error: planErr } = await supabase
      .from("business_plan")
      .select("id, plan_json, created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planErr) {
      return NextResponse.json({ ok: false, error: planErr.message }, { status: 400 });
    }
    if (!planRow) {
      return NextResponse.json({ ok: false, error: "No business plan found" }, { status: 404 });
    }

    const planJson = (planRow as AnyRecord).plan_json as AnyRecord | null;
    const raw = pickTasksFromPlan(planJson);
    const normalized = raw.map(normalizeTask).filter((t) => t.title.length > 0);

    // wipe
    const { error: delErr } = await supabase.from("tasks").delete().eq("user_id", auth.user.id);
    if (delErr) {
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 });
    }

    if (normalized.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0 }, { status: 200 });
    }

    const payload = normalized.map((t) => ({
      user_id: auth.user.id,
      title: t.title,
      description: t.description || null,
      status: t.status || "todo",
      due_date: t.due_date,
      importance: t.importance,
      source: "plan_json",
    }));

    const { error: insErr } = await supabase.from("tasks").insert(payload);
    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, inserted: payload.length }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
