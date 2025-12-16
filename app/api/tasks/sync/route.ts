// app/api/tasks/sync/route.ts
// Sync des tâches : plan_json (business_plan) -> table tasks
// ✅ v2: ne supprime plus les tâches existantes
// - On insère seulement les tâches manquantes (dédupe simple : title + due_date)

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type AnyRecord = Record<string, unknown>;

type PlanTask = {
  title?: unknown;
  description?: unknown;
  status?: unknown;
  due_date?: unknown;
  dueDate?: unknown;
  deadline?: unknown;
  date?: unknown;
  importance?: unknown;
  priority?: unknown;
};

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asRecord(v: unknown): AnyRecord | null {
  return v && typeof v === "object" ? (v as AnyRecord) : null;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function cleanString(v: unknown): string {
  return asString(v).trim();
}

function cleanNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = cleanString(v);
  return s ? s : null;
}

function isIsoDateYYYYMMDD(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function normalizeDueDate(raw: unknown): string | null {
  const s = cleanNullableString(raw);
  if (!s) return null;

  if (isIsoDateYYYYMMDD(s)) return s;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeImportance(raw: unknown): string | null {
  const s = cleanNullableString(raw);
  if (!s) return null;
  const low = s.toLowerCase();
  return low === "high" || low === "important" || low === "urgent" || low === "p1" ? "high" : null;
}

function normalizeTask(
  raw: unknown,
): { title: string; description: string | null; due_date: string | null; importance: string | null } | null {
  const r = asRecord(raw);
  if (!r) return null;

  const title = cleanString(r.title ?? (r as PlanTask).title ?? r.task ?? r.name);
  if (!title) return null;

  const description = cleanNullableString(r.description ?? (r as PlanTask).description ?? r.details ?? r.note);

  const dueRaw =
    (r as PlanTask).due_date ??
    (r as PlanTask).dueDate ??
    (r as PlanTask).deadline ??
    (r as PlanTask).date ??
    r.due_date ??
    r.dueDate ??
    r.deadline ??
    r.date;

  const due_date = normalizeDueDate(dueRaw);

  const impRaw = (r as PlanTask).importance ?? (r as PlanTask).priority ?? r.importance ?? r.priority;
  const importance = normalizeImportance(impRaw);

  return { title, description, due_date, importance };
}

function pickTasksFromPlan(planJson: AnyRecord | null) {
  if (!planJson) return [];

  const direct = asArray(planJson.tasks).map(normalizeTask).filter(Boolean);
  if (direct.length) return direct;

  const plan = asRecord(planJson.plan);
  const plan90 = asRecord(planJson.plan90 ?? planJson.plan_90);

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

function makeKey(title: string, due_date: string | null) {
  return `${title.toLowerCase().trim()}__${due_date ?? ""}`;
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // 1) lire le dernier business_plan
    const { data: bp, error: bpErr } = await supabase
      .from("business_plan")
      .select("id, plan_json, created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bpErr) return NextResponse.json({ ok: false, error: bpErr.message }, { status: 400 });

    const planJson = asRecord((bp as AnyRecord | null)?.plan_json ?? null);
    const parsed = pickTasksFromPlan(planJson).filter(
      (t): t is { title: string; description: string | null; due_date: string | null; importance: string | null } =>
        Boolean(t),
    );

    if (parsed.length === 0) return NextResponse.json({ ok: true, inserted: 0 }, { status: 200 });

    // 2) récupérer tâches existantes pour déduplication
    const { data: existingRaw, error: exErr } = await supabase
      .from("tasks")
      .select("id, title, due_date")
      .eq("user_id", auth.user.id);

    if (exErr) return NextResponse.json({ ok: false, error: exErr.message }, { status: 400 });

    const existingKeys = new Set<string>();
    if (Array.isArray(existingRaw)) {
      for (const r of existingRaw as Array<{ title: string | null; due_date: string | null }>) {
        const t = (r.title ?? "").trim();
        if (!t) continue;
        existingKeys.add(makeKey(t, r.due_date ?? null));
      }
    }

    // 3) payload (uniquement nouvelles)
    const payload = parsed
      .map((t) => ({
        user_id: auth.user.id,
        title: t.title,
        description: t.description,
        due_date: t.due_date,
        importance: t.importance,
        status: "todo",
      }))
      .filter((t) => !existingKeys.has(makeKey(t.title, t.due_date)));

    if (payload.length === 0) return NextResponse.json({ ok: true, inserted: 0 }, { status: 200 });

    const { error: insErr } = await supabase.from("tasks").insert(payload);
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, inserted: payload.length }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
