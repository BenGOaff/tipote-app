// app/app/page.tsx
// Dashboard "Aujourd'hui" (server)
// - Protégé par l'auth Supabase
// - Si onboarding non terminé => redirect /onboarding
// - Tâches : priorité à public.project_tasks (si vide => fallback depuis business_plan.plan_json)
// - Affiche quelques stats et liens rapides

import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { TaskList, type TaskItem } from "@/components/tasks/TaskList";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type AnyRecord = Record<string, unknown>;

type DbTask = {
  id: string;
  title: string | null;
  status: string | null;
  due_date: string | null;
  priority: string | null;
  source: string | null;
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

function normalizePriority(raw: unknown): string | null {
  const s = cleanNullableString(raw);
  if (!s) return null;
  const low = s.toLowerCase();
  return low === "high" || low === "important" || low === "urgent" || low === "p1" ? "high" : null;
}

function isDone(status: string | null) {
  const s = String(status ?? "").toLowerCase();
  return ["done", "completed", "termin", "finished"].some((k) => s.includes(k));
}

function toYYYYMMDD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isToday(iso: string | null) {
  if (!iso) return false;
  return iso.startsWith(toYYYYMMDD(new Date()));
}

function isOverdue(iso: string | null) {
  if (!iso) return false;
  const today = new Date(toYYYYMMDD(new Date()));
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < today.getTime();
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
  const plan90 = asRecord(planJson.plan90 ?? planJson.plan_90 ?? planJson.plan_90_days);

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

export default async function TodayDashboard() {
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

  // tasks db
  const { data: dbTasksRaw } = await supabase
    .from("project_tasks")
    .select("id, title, status, due_date, priority, source, created_at")
    .eq("user_id", session.user.id);

  const dbTasks: DbTask[] = Array.isArray(dbTasksRaw) ? (dbTasksRaw as DbTask[]) : [];
  const hasDbTasks = dbTasks.length > 0;

  // fallback plan json
  const { data: planRow } = await supabase
    .from("business_plan")
    .select("plan_json, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const fallbackPlanTasks = pickTasksFromPlan(asRecord((planRow as AnyRecord | null)?.plan_json ?? null));

  const tasks: TaskItem[] = hasDbTasks
    ? dbTasks.map((t) => ({
        id: String(t.id),
        title: String(t.title ?? ""),
        description: null,
        status: (t.status ?? null) as string | null,
        due_date: (t.due_date ?? null) as string | null,
        priority: (t.priority ?? null) as string | null,
        source: (t.source ?? null) as string | null,
      }))
    : fallbackPlanTasks;

  const tasksToday = tasks.filter((t) => isToday(t.due_date) && !isDone(t.status));
  const overdueTasks = tasks.filter((t) => isOverdue(t.due_date) && !isDone(t.status));
  const doneCount = tasks.filter((t) => isDone(t.status)).length;

  const nextAction =
    tasksToday[0]?.title ||
    overdueTasks[0]?.title ||
    tasks.find((t) => !isDone(t.status))?.title ||
    "Tout est à jour 🎉";

  const tasksTodayTop5 = tasksToday.slice(0, 5);
  const tasksUpcomingTop5 = tasks
    .filter((t) => !isDone(t.status) && !isToday(t.due_date))
    .sort((a, b) => {
      const da = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
      const db = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
      return da - db;
    })
    .slice(0, 5);

  return (
    <AppShell userEmail={userEmail}>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Aujourd’hui</h1>
              <p className="mt-1 text-sm text-slate-600">
                Ton focus : <span className="font-semibold text-slate-900">{nextAction}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              {!hasDbTasks ? (
                <Badge variant="secondary" className="h-8 px-3">
                  Tâches non importées
                </Badge>
              ) : null}
              <Link href="/tasks">
                <Button variant="outline" className="h-9">
                  Mes tâches
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-xs text-slate-500">À faire aujourd’hui</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{tasksToday.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">En retard</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{overdueTasks.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">Terminées</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{doneCount}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">Total</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{tasks.length}</p>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <TaskList title="Tâches du jour" tasks={tasksTodayTop5} showSync={false} allowCreate={false} variant="flat" />
          </Card>

          <Card className="p-5">
            <TaskList title="À venir" tasks={tasksUpcomingTop5} showSync={false} allowCreate={false} variant="flat" />
          </Card>
        </div>

        <div className="pt-1">
          <Link href="/tasks">
            <Button variant="outline" className="w-full justify-between">
              Gérer toutes les tâches
              <span className="text-xs text-slate-500">Sync + CRUD</span>
            </Button>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
