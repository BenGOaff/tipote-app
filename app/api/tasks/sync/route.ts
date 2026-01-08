// app/api/tasks/sync/route.ts
// Sync “smart” : business_plan -> project_tasks (dédupe + update safe)

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function toStr(x: unknown): string | null {
  return typeof x === "string" ? x : null;
}

function toArray(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

function toStringArray(x: unknown): string[] {
  return toArray(x)
    .map((v) => (typeof v === "string" ? v : ""))
    .map((s) => s.trim())
    .filter(Boolean);
}

function toIsoDateOrNull(x: unknown): string | null {
  const s = toStr(x);
  if (!s) return null;
  // Accept YYYY-MM-DD or ISO
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
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
  // On récupère tout ce qui ressemble à des tasks dans plan_90_days.tasks_by_timeframe
  const plan90 = isRecord(planJson.plan_90_days) ? planJson.plan_90_days : null;
  const tbt = plan90 && isRecord((plan90 as any).tasks_by_timeframe) ? (plan90 as any).tasks_by_timeframe : null;

  if (tbt && isRecord(tbt)) {
    for (const timeframe of Object.keys(tbt)) {
      const arr = toArray((tbt as any)[timeframe]);
      for (const t of arr) {
        if (!isRecord(t)) continue;
        const title = toStr((t as any).title) || toStr((t as any).task) || "";
        if (!title.trim()) continue;
        const due = toIsoDateOrNull((t as any).due_date) || toIsoDateOrNull((t as any).dueDate) || null;
        out.push({
          title: title.trim(),
          due_date: due,
          source: `plan_90_days:${timeframe}`,
        });
      }
    }
  }

  // Autres sections possibles
  const tasks = toArray((planJson as any).tasks);
  for (const t of tasks) {
    if (!isRecord(t)) continue;
    const title = toStr((t as any).title) || toStr((t as any).task) || "";
    if (!title.trim()) continue;
    const due = toIsoDateOrNull((t as any).due_date) || toIsoDateOrNull((t as any).dueDate) || null;
    out.push({
      title: title.trim(),
      due_date: due,
      source: "tasks",
    });
  }

  // Dédoublonnage simple par title+due_date
  const seen = new Set<string>();
  const deduped: TaskFromPlan[] = [];
  for (const t of out) {
    const key = `${t.title}__${t.due_date ?? ""}__${t.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(t);
  }

  return deduped;
}

function normalizeTitle(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const auth = { user: session.user };

    // A5 — Pas de gating abonnement ici : le sync de tâches fait partie du coeur produit (onboarding/plan)

    const { data: bp, error: bpErr } = await supabase
      .from("business_plan")
      .select("plan_json, created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bpErr) {
      console.error("Error loading business_plan:", bpErr);
      return NextResponse.json({ ok: false, error: "Failed to load business_plan" }, { status: 500 });
    }

    const tasks = extractTasksFromPlan((bp as any)?.plan_json);
    if (tasks.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, message: "No tasks found in plan_json" }, { status: 200 });
    }

    // Charger tâches existantes (pour dédupe)
    const { data: existing, error: existingErr } = await supabase
      .from("project_tasks")
      .select("id, title, due_date, source")
      .eq("user_id", auth.user.id);

    if (existingErr) {
      console.error("Error loading existing project_tasks:", existingErr);
      return NextResponse.json({ ok: false, error: "Failed to load existing tasks" }, { status: 500 });
    }

    const existingRows = Array.isArray(existing) ? existing : [];
    const existingIndex = new Map<string, { id: string; title: string; due_date: string | null; source: string | null }>();

    for (const row of existingRows) {
      const title = typeof (row as any).title === "string" ? (row as any).title : "";
      const due = typeof (row as any).due_date === "string" ? (row as any).due_date : null;
      const source = typeof (row as any).source === "string" ? (row as any).source : null;

      const key = `${normalizeTitle(title)}__${due ?? ""}__${source ?? ""}`;
      existingIndex.set(key, { id: (row as any).id, title, due_date: due, source });
    }

    // Préparer upserts : si existe -> update soft (title/due_date/source), sinon insert
    const toInsert: any[] = [];
    const toUpdate: { id: string; patch: any }[] = [];

    for (const t of tasks) {
      const key = `${normalizeTitle(t.title)}__${t.due_date ?? ""}__${t.source}`;
      const ex = existingIndex.get(key);

      if (ex) {
        // Update soft : on laisse l’utilisateur modifier ailleurs, on évite de tout écraser.
        // Ici on ne met à jour que des champs “safe”.
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
          user_id: auth.user.id,
          title: t.title,
          due_date: t.due_date,
          source: t.source,
          status: "todo",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Batch updates (séquentiel pour limiter les soucis RLS / timeouts)
    let updated = 0;
    for (const u of toUpdate) {
      const { error } = await supabase.from("project_tasks").update(u.patch).eq("id", u.id).eq("user_id", auth.user.id);
      if (!error) updated += 1;
    }

    let inserted = 0;
    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from("project_tasks").insert(toInsert);
      if (insErr) {
        console.error("Insert tasks error:", insErr);
        return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
      }
      inserted = toInsert.length;
    }

    return NextResponse.json(
      { ok: true, synced: inserted + updated, inserted, updated, source: "business_plan.plan_json" },
      { status: 200 },
    );
  } catch (e) {
    console.error("Unhandled error in /api/tasks/sync:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
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
