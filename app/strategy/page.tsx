// app/strategy/page.tsx
// Stratégie (server) + tâches via table tasks (fallback plan_json si vide)
// + bouton sync pour importer les tâches du plan
// + StrategyClient attend offerPyramids / initialSelectedIndex / initialSelectedPyramid (pas planJson)

import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import StrategyClient from "./StrategyClient";
import { TaskList, type TaskItem } from "@/components/tasks/TaskList";

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

  return [];
}

function normalizePlanTask(t: PlanTask): TaskItem {
  const title = typeof t.title === "string" ? t.title.trim() : "Tâche";
  const description = typeof t.description === "string" ? t.description.trim() : null;
  const status = typeof t.status === "string" ? t.status.trim() : "todo";
  const due = (t.due_date ?? t.dueDate ?? null) as string | null;
  const due_date = typeof due === "string" && due.trim() ? due.trim() : null;
  const importance =
    typeof t.importance === "string" && t.importance.trim()
      ? t.importance.trim().toLowerCase()
      : null;

  // id fake (fallback display only)
  const id = `${title}-${due_date ?? "nodate"}-${Math.random().toString(16).slice(2)}`;

  return { id, title, description, status, due_date, importance };
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function bucket(tasks: TaskItem[]) {
  const now = new Date();
  const t0 = startOfDay(now).getTime();
  const t30 = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30)).getTime();
  const t60 = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60)).getTime();
  const t90 = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90)).getTime();

  const d30: TaskItem[] = [];
  const d60: TaskItem[] = [];
  const d90: TaskItem[] = [];
  const noDate: TaskItem[] = [];

  for (const t of tasks) {
    if (!t.due_date) {
      noDate.push(t);
      continue;
    }
    const ts = new Date(t.due_date).getTime();
    if (Number.isNaN(ts)) {
      noDate.push(t);
      continue;
    }
    if (ts >= t0 && ts < t30) d30.push(t);
    else if (ts >= t30 && ts < t60) d60.push(t);
    else if (ts >= t60 && ts <= t90) d90.push(t);
    else d90.push(t);
  }

  return { d30, d60, d90, noDate };
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

  return [];
}

function pickInitialPyramid(planJson: AnyRecord | null): {
  initialSelectedIndex: number;
  initialSelectedPyramid?: AnyRecord;
} {
  if (!planJson) return { initialSelectedIndex: 0 };

  const idxRaw =
    (planJson as AnyRecord).selected_offer_pyramid_index ??
    (planJson as AnyRecord).selectedOfferPyramidIndex ??
    0;

  const idxNum =
    typeof idxRaw === "number"
      ? idxRaw
      : typeof idxRaw === "string"
        ? Number(idxRaw)
        : 0;

  const initialSelectedIndex = Number.isFinite(idxNum) && idxNum >= 0 ? idxNum : 0;

  const selected =
    ((planJson as AnyRecord).selected_offer_pyramid as AnyRecord | undefined) ??
    ((planJson as AnyRecord).selectedOfferPyramid as AnyRecord | undefined) ??
    undefined;

  const initialSelectedPyramid =
    selected && typeof selected === "object" ? selected : undefined;

  return { initialSelectedIndex, initialSelectedPyramid };
}

export default async function StrategyPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "";

  const { data: planRow } = await supabase
    .from("business_plan")
    .select("id, plan_json, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!planRow) redirect("/onboarding");

  const { data: tasksRows } = await supabase
    .from("tasks")
    .select("id, title, description, status, due_date, importance")
    .eq("user_id", session.user.id);

  const tasksFromDb: TaskItem[] = Array.isArray(tasksRows)
    ? (tasksRows as TaskItem[])
    : [];

  const planJson = (planRow as AnyRecord).plan_json as AnyRecord | null;
  const planTasksFallback: TaskItem[] = pickTasksFromPlan(planJson).map(normalizePlanTask);

  const tasks = tasksFromDb.length > 0 ? tasksFromDb : planTasksFallback;
  const buckets = bucket(tasks);

  // ✅ props attendus par StrategyClient
  const offerPyramids = pickOfferPyramidsFromPlan(planJson);
  const { initialSelectedIndex, initialSelectedPyramid } = pickInitialPyramid(planJson);

  return (
    <AppShell userEmail={userEmail}>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <main className="space-y-6">
          <section className="rounded-2xl bg-[#b042b4] text-white p-6 shadow-sm">
            <h1 className="text-xl md:text-2xl font-semibold">Ma Stratégie</h1>
            <p className="mt-2 text-sm text-white/90 max-w-2xl">
              Pyramide d’offres + plan d’action. Les tâches peuvent maintenant être synchronisées en base.
            </p>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <TaskList title="Jours 1–30" tasks={buckets.d30} showSync={tasksFromDb.length === 0} />
            <TaskList title="Jours 31–60" tasks={buckets.d60} showSync={tasksFromDb.length === 0} />
            <TaskList title="Jours 61–90" tasks={buckets.d90} showSync={tasksFromDb.length === 0} />
            <TaskList title="Sans échéance" tasks={buckets.noDate} showSync={tasksFromDb.length === 0} />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
        </main>
      </div>
    </AppShell>
  );
}
