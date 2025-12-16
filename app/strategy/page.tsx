// app/strategy/page.tsx
// Stratégie (server) + tâches liées au plan
// - Affiche la pyramide d'offres via StrategyClient (UI existante)
// - Affiche les tâches: priorité à public.project_tasks (si vide => fallback plan_json)
// - Bouton "Sync tâches" pour importer dans project_tasks

import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import StrategyClient from "./StrategyClient";
import { TaskList, type TaskItem } from "@/components/tasks/TaskList";

type AnyRecord = Record<string, unknown>;

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

function normalizePriority(raw: unknown): string | null {
  const s = cleanNullableString(raw);
  if (!s) return null;
  const low = s.toLowerCase();
  return low === "high" || low === "important" || low === "urgent" || low === "p1" ? "high" : null;
}

function normalizePlanTask(raw: unknown, idx: number): TaskItem | null {
  const r = asRecord(raw);
  if (!r) return null;

  const title = cleanString(r.title ?? r.task ?? r.name);
  if (!title) return null;

  const description = cleanNullableString(r.description ?? r.details ?? r.note);
  const due_date = normalizeDueDate(r.due_date ?? r.dueDate ?? r.deadline ?? r.date);
  const priority = normalizePriority(r.priority ?? r.importance);

  return {
    id: `plan-${idx}`,
    title,
    description,
    status: cleanNullableString(r.status) ?? "todo",
    due_date,
    priority,
    source: "strategy",
  };
}

function pickTasksFromPlan(planJson: AnyRecord | null): TaskItem[] {
  if (!planJson) return [];

  const direct = asArray(planJson.tasks)
    .map((t, i) => normalizePlanTask(t, i))
    .filter(Boolean) as TaskItem[];
  if (direct.length) return direct;

  const plan = asRecord(planJson.plan);
  const plan90 = asRecord(planJson.plan90 ?? planJson.plan_90 ?? planJson.plan_90_days ?? planJson.plan_90_days);

  const a = asArray(plan?.tasks)
    .map((t, i) => normalizePlanTask(t, i))
    .filter(Boolean) as TaskItem[];
  if (a.length) return a;

  const b = asArray(plan90?.tasks)
    .map((t, i) => normalizePlanTask(t, i))
    .filter(Boolean) as TaskItem[];
  if (b.length) return b;

  const grouped = asRecord(plan90?.tasks_by_timeframe ?? planJson.tasks_by_timeframe);
  if (grouped) {
    const d30 = asArray(grouped.d30)
      .map((t, i) => normalizePlanTask(t, i))
      .filter(Boolean) as TaskItem[];
    const d60 = asArray(grouped.d60)
      .map((t, i) => normalizePlanTask(t, i))
      .filter(Boolean) as TaskItem[];
    const d90 = asArray(grouped.d90)
      .map((t, i) => normalizePlanTask(t, i))
      .filter(Boolean) as TaskItem[];

    return [...d30, ...d60, ...d90];
  }

  return [];
}

function pickOfferPyramidsFromPlan(planJson: AnyRecord | null): AnyRecord[] {
  if (!planJson) return [];

  const direct = asArray((planJson as AnyRecord).offer_pyramids) as AnyRecord[];
  if (direct.length) return direct;

  const camel = asArray((planJson as AnyRecord).offerPyramids) as AnyRecord[];
  if (camel.length) return camel;

  const single =
    ((planJson as AnyRecord).offer_pyramid as AnyRecord | undefined) ??
    ((planJson as AnyRecord).offerPyramid as AnyRecord | undefined) ??
    null;

  if (single && typeof single === "object") return [single];

  const fromBlocks = asArray((planJson as AnyRecord).business_blocks) as AnyRecord[];
  const pyramidsFromBlocks = fromBlocks
    .map((b) => asRecord(b)?.offer_pyramid ?? asRecord(b)?.offerPyramid ?? null)
    .filter((x) => x && typeof x === "object") as AnyRecord[];

  return pyramidsFromBlocks;
}

function pickSelectedOfferPyramid(planJson: AnyRecord | null) {
  const idxRaw =
    (planJson as AnyRecord | null)?.selected_offer_pyramid_index ??
    (planJson as AnyRecord | null)?.selectedOfferPyramidIndex ??
    0;

  const idxNum = typeof idxRaw === "number" ? idxRaw : Number(String(idxRaw ?? "0"));
  const initialSelectedIndex = Number.isFinite(idxNum) && idxNum >= 0 ? idxNum : 0;

  const selected =
    (planJson as AnyRecord | null)?.selected_offer_pyramid ??
    (planJson as AnyRecord | null)?.selectedOfferPyramid ??
    undefined;

  const initialSelectedPyramid = selected && typeof selected === "object" ? (selected as AnyRecord) : undefined;

  return { initialSelectedIndex, initialSelectedPyramid };
}

export default async function StrategyPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "";

  // onboarding
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_done")
    .eq("id", session.user.id)
    .maybeSingle();
  if (!profile?.onboarding_done) redirect("/onboarding");

  // dernier business plan (stratégie)
  const { data: planRow } = await supabase
    .from("business_plan")
    .select("id, plan_json, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!planRow) redirect("/onboarding");

  const planJson = asRecord((planRow as AnyRecord).plan_json ?? null);

  // tâches DB (project_tasks)
  const { data: tasksRows } = await supabase
    .from("project_tasks")
    .select("id, title, status, due_date, priority, source, created_at")
    .eq("user_id", session.user.id);

  const tasksFromDb: TaskItem[] = Array.isArray(tasksRows)
    ? (tasksRows as Array<{
        id: string;
        title: string | null;
        status: string | null;
        due_date: string | null;
        priority: string | null;
        source: string | null;
      }>).map((t) => ({
        id: String(t.id),
        title: String(t.title ?? ""),
        description: null,
        status: (t.status ?? null) as string | null,
        due_date: (t.due_date ?? null) as string | null,
        priority: (t.priority ?? null) as string | null,
        source: (t.source ?? null) as string | null,
      }))
    : [];

  const planTasksFallback: TaskItem[] = pickTasksFromPlan(planJson);
  const tasks = tasksFromDb.length > 0 ? tasksFromDb : planTasksFallback;

  // pyramides
  const offerPyramids = pickOfferPyramidsFromPlan(planJson);
  const { initialSelectedIndex, initialSelectedPyramid } = pickSelectedOfferPyramid(planJson);

  return (
    <AppShell userEmail={userEmail}>
      <div className="p-6 max-w-6xl mx-auto space-y-8">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Stratégie</h1>
          <p className="mt-1 text-sm text-slate-600">Ta feuille de route et ta pyramide d’offres.</p>
        </header>

        <section>
          <h2 className="text-sm font-semibold text-slate-900">Tâches</h2>
          <p className="mt-1 text-xs text-slate-500">
            Synchronise les tâches depuis ta stratégie pour pouvoir les cocher et les gérer.
          </p>

          <div className="mt-4">
            <TaskList title="Tâches (90 jours)" tasks={tasks} showSync allowCreate={false} variant="card" />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-900">Pyramide d’offres</h2>
          <p className="mt-1 text-xs text-slate-500">(UI existante conservée — on ne casse rien)</p>
          <div className="mt-4">
            <StrategyClient
              offerPyramids={offerPyramids}
              initialSelectedIndex={initialSelectedIndex}
              initialSelectedPyramid={initialSelectedPyramid}
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
