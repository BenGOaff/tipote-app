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

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function isDoneStatus(status: string | null): boolean {
  const s = norm(status ?? "");
  return s === "done" || s === "completed" || s === "fait" || s === "terminé" || s === "termine";
}

type TaskInDb = {
  id: string;
  title: string;
  status: string | null;
  due_date: string | null;
  source: string | null;
};

type TaskFromPlan = {
  title: string;
  due_date: string | null;
  source: string;
};

function extractTasksFromPlan(planJson: unknown): TaskFromPlan[] {
  if (!isRecord(planJson)) return [];

  const out: TaskFromPlan[] = [];

  // Heuristiques : plan_json peut avoir des sections variées.
  // On récupère tout champ "tasks" qui ressemble à une liste d'objets avec title.
  const stack: unknown[] = [planJson];

  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;

    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
      continue;
    }

    if (!isRecord(cur)) continue;

    for (const [k, v] of Object.entries(cur)) {
      if (k === "tasks" && Array.isArray(v)) {
        for (const item of v) {
          if (!isRecord(item)) continue;
          const title = (toStr(item.title) ?? toStr(item.name) ?? "").trim();
          if (!title) continue;
          const due = toStr((item as any).due_date) ?? toStr((item as any).dueDate) ?? null;
          out.push({ title, due_date: due, source: "business_plan" });
        }
      } else {
        // continue DFS
        stack.push(v);
      }
    }
  }

  // dédupe par titre normalisé
  const seen = new Set<string>();
  const deduped: TaskFromPlan[] = [];
  for (const t of out) {
    const key = norm(t.title);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(t);
  }
  return deduped;
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // A5 — Gating minimal (abonnement requis)
    // Si table/colonne/RLS indisponible => fail-open (ne pas casser la prod)
    try {
      const { data: billingProfile, error: billingError } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", auth.user.id)
        .maybeSingle();

      if (!billingError) {
        const plan = (billingProfile as any)?.plan as string | null | undefined;
        const p = (plan ?? "").toLowerCase().trim();
        const hasPlan = p === "basic" || p === "essential" || p === "elite";
        if (!hasPlan) {
          return NextResponse.json(
            { ok: false, code: "subscription_required", error: "Abonnement requis." },
            { status: 402 },
          );
        }
      }
    } catch {
      // fail-open
    }

    const { data: bp, error: bpErr } = await supabase
      .from("business_plan")
      .select("plan_json, created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bpErr) return NextResponse.json({ ok: false, error: bpErr.message }, { status: 400 });
    if (!bp?.plan_json) return NextResponse.json({ ok: true, inserted: 0, updated: 0 }, { status: 200 });

    const tasksFromPlan = extractTasksFromPlan(bp.plan_json);

    if (tasksFromPlan.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0, updated: 0 }, { status: 200 });
    }

    const { data: existingData, error: exErr } = await supabase
      .from("project_tasks")
      .select("id,title,status,due_date,source")
      .eq("user_id", auth.user.id);

    if (exErr) return NextResponse.json({ ok: false, error: exErr.message }, { status: 400 });

    const existing: TaskInDb[] = Array.isArray(existingData) ? (existingData as TaskInDb[]) : [];
    const byTitle = new Map<string, TaskInDb>();
    for (const t of existing) {
      const key = norm(t.title ?? "");
      if (!key) continue;
      if (!byTitle.has(key)) byTitle.set(key, t);
    }

    let inserted = 0;
    let updated = 0;

    for (const t of tasksFromPlan) {
      const key = norm(t.title);
      const inDb = byTitle.get(key);

      if (!inDb) {
        const { error: insErr } = await supabase.from("project_tasks").insert({
          user_id: auth.user.id,
          title: t.title,
          status: "todo",
          due_date: t.due_date,
          source: t.source,
        });

        if (!insErr) inserted += 1;
        continue;
      }

      // Update uniquement si pas done + due_date vide dans DB et présente dans plan
      if (!isDoneStatus(inDb.status)) {
        const shouldUpdateDue = !toStr(inDb.due_date) && !!t.due_date;
        if (shouldUpdateDue) {
          const { error: upErr } = await supabase
            .from("project_tasks")
            .update({ due_date: t.due_date })
            .eq("id", inDb.id)
            .eq("user_id", auth.user.id);

          if (!upErr) updated += 1;
        }
      }
    }

    return NextResponse.json({ ok: true, inserted, updated }, { status: 200 });
  } catch (e) {
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
