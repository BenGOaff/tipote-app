// app/api/tasks/sync/route.ts
// Sync “smart” : business_plan.plan_json -> public.project_tasks
// ✅ Ne touche jamais aux tâches manuelles (source='manual')
// ✅ Remplace uniquement les tâches de stratégie (source='strategy')
// ✅ Préserve la progression: si une tâche stratégie existait (même title+due_date) on garde son status

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { syncStrategyTasksFromPlanJson } from "@/lib/tasksSync";

type AnyRecord = Record<string, unknown>;

function asRecord(v: unknown): AnyRecord | null {
  if (!v || typeof v !== "object") return null;
  return v as AnyRecord;
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: bp, error: bpErr } = await supabase
      .from("business_plan")
      .select("plan_json, created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bpErr) return NextResponse.json({ ok: false, error: bpErr.message }, { status: 400 });

    const planJson = asRecord((bp as AnyRecord | null)?.plan_json ?? null);

    const res = await syncStrategyTasksFromPlanJson({
      supabase,
      userId: auth.user.id,
      planJson,
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, inserted: res.inserted }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
