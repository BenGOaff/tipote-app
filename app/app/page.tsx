// app/app/page.tsx
// Dashboard "Aujourd'hui" (Design Lovable + logique existante)
// - Protégé par l'auth Supabase
// - Si aucun plan stratégique => redirect /onboarding
// - UI Lovable : Welcome/Next action + stats + progression + quick actions + à venir
// - Tâches : priorité à la table `tasks` (si vide => fallback plan_json)
// - Contenus planifiés : table `content_item`

import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TaskList, type TaskItem } from "@/components/tasks/TaskList";

import {
  ArrowRight,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  ListTodo,
  Sparkles,
  TrendingUp,
} from "lucide-react";

type AnyRecord = Record<string, unknown>;

type PlanTask = {
  title?: unknown;
  description?: unknown;
  due_date?: unknown;
  importance?: unknown;
};

type DbTask = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  due_date: string | null;
  importance: string | null;
};

type EnrichedTask = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  due_date: string | null;
  importance: string | null;

  _isDone: boolean;
  _isImportant: boolean;
  _dueDate: Date | null;
  _label: string;
};

type ContentItem = {
  id: string;
  title: string | null;
  content_type: string | null;
  status: string | null;
  scheduled_date: string | null; // YYYY-MM-DD
};

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isDoneStatus(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return ["done", "completed", "termin", "finished"].some((k) => s.includes(k));
}

function normalizeTask(raw: unknown): PlanTask | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as AnyRecord;

  const title = r.title ?? r.task ?? r.name;
  const description = r.description ?? r.details ?? r.note;
  const due_date = r.due_date ?? r.dueDate ?? r.deadline ?? r.date;
  const importance = r.importance ?? r.priority ?? r.level ?? r.impact;

  return {
    title,
    description,
    due_date,
    importance,
  };
}

function pickTasksFromPlan(planJson: AnyRecord | null): PlanTask[] {
  if (!planJson) return [];

  const direct = asArray(planJson.tasks).map(normalizeTask).filter(Boolean) as PlanTask[];
  if (direct.length) return direct;

  const plan = (planJson.plan as AnyRecord | undefined) ?? null;
  const plan90 = (planJson.plan90 as AnyRecord | undefined) ?? (planJson.plan_90 as AnyRecord | undefined) ?? null;

  const a = asArray(plan?.tasks).map(normalizeTask).filter(Boolean) as PlanTask[];
  if (a.length) return a;

  const b = asArray(plan90?.tasks).map(normalizeTask).filter(Boolean) as PlanTask[];
  if (b.length) return b;

  const grouped =
    (plan90?.tasks_by_timeframe as AnyRecord | undefined) ??
    (planJson.tasks_by_timeframe as AnyRecord | undefined) ??
    null;

  if (grouped && typeof grouped === "object") {
    const d30 = asArray((grouped as AnyRecord).d30).map(normalizeTask).filter(Boolean) as PlanTask[];
    const d60 = asArray((grouped as AnyRecord).d60).map(normalizeTask).filter(Boolean) as PlanTask[];
    const d90 = asArray((grouped as AnyRecord).d90).map(normalizeTask).filter(Boolean) as PlanTask[];
    return [...d30, ...d60, ...d90].filter(Boolean);
  }

  return [];
}

function enrichTask(t: {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  due_date: string | null;
  importance: string | null;
}): EnrichedTask {
  const due = t.due_date ? new Date(t.due_date) : null;
  const imp = String(t.importance ?? "").toLowerCase();
  const important = imp === "high" || imp === "important" || imp === "urgent" || imp === "p1";

  const done = isDoneStatus(t.status);

  const label = due
    ? `${String(due.getDate()).padStart(2, "0")}/${String(due.getMonth() + 1).padStart(2, "0")}`
    : "—";

  return {
    ...t,
    _isDone: done,
    _isImportant: important,
    _dueDate: due && Number.isFinite(due.getTime()) ? due : null,
    _label: label,
  };
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function percent(n: number, d: number) {
  if (d <= 0) return 0;
  const p = Math.round((n / d) * 100);
  return Math.max(0, Math.min(100, p));
}

export default async function TodayDashboard() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "";

  // 1) Business plan (plan_json) : sert pour onboarding redirect + fallback tâches
  const { data: businessPlan } = await supabase
    .from("business_plan")
    .select("id, plan_json, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planJson = (businessPlan as AnyRecord)?.plan_json as AnyRecord | null;

  if (!planJson) {
    redirect("/onboarding");
  }

  // 2) Tâches : priorité DB `tasks`, sinon fallback plan_json
  const { data: dbTasksRaw } = await supabase
    .from("tasks")
    .select("id, title, description, status, due_date, importance")
    .eq("user_id", session.user.id);

  const dbTasks: DbTask[] = Array.isArray(dbTasksRaw) ? (dbTasksRaw as DbTask[]) : [];
  const hasDbTasks = dbTasks.length > 0;

  const fallbackPlanTasks = pickTasksFromPlan(planJson);

  const mergedTasks: EnrichedTask[] = hasDbTasks
    ? dbTasks
        .map((t) =>
          enrichTask({
            id: t.id,
            title: t.title,
            description: t.description ?? null,
            status: t.status ?? "todo",
            due_date: t.due_date ?? null,
            importance: t.importance ?? null,
          }),
        )
        .filter((t) => t.title.trim().length > 0)
    : fallbackPlanTasks
        .map((t, idx) => {
          const title = typeof t.title === "string" ? t.title : asString(t.title);
          const desc = typeof t.description === "string" ? t.description : asString(t.description);

          const due =
            typeof t.due_date === "string"
              ? t.due_date
              : t.due_date instanceof Date
                ? t.due_date.toISOString()
                : null;

          const imp = typeof t.importance === "string" ? t.importance : null;

          return enrichTask({
            id: `plan-${idx}`,
            title: title || "Action",
            description: desc || null,
            status: "todo",
            due_date: due,
            importance: imp,
          });
        })
        .filter((t) => t.title.trim().length > 0);

  const tasks = [...mergedTasks].sort((a, b) => {
    // 1) non-fait d'abord
    if (a._isDone !== b._isDone) return a._isDone ? 1 : -1;
    // 2) important d'abord
    if (a._isImportant !== b._isImportant) return a._isImportant ? -1 : 1;
    // 3) date proche d'abord
    const da = a._dueDate ? a._dueDate.getTime() : Number.POSITIVE_INFINITY;
    const db = b._dueDate ? b._dueDate.getTime() : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    // 4) alpha
    return a.title.localeCompare(b.title);
  });

  // 3) Contenus planifiés (à venir / aujourd’hui)
  const { data: plannedContentRaw } = await supabase
    .from("content_item")
    .select("id, title, content_type, status, scheduled_date")
    .eq("user_id", session.user.id)
    .not("scheduled_date", "is", null);

  const plannedContents: ContentItem[] = Array.isArray(plannedContentRaw)
    ? (plannedContentRaw as ContentItem[])
    : [];

  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = startOfDay(addDays(now, 1));

  const todayIso = `${todayStart.getFullYear()}-${String(todayStart.getMonth() + 1).padStart(2, "0")}-${String(
    todayStart.getDate(),
  ).padStart(2, "0")}`;

  const plannedToday = plannedContents.filter((c) => c.scheduled_date === todayIso);
  const plannedWeek = plannedContents.filter((c) => c.scheduled_date !== todayIso);

  const overdueTasks = tasks.filter((t) => t._dueDate && t._dueDate < todayStart && !t._isDone);

  const tasksToday = tasks.filter((t) => {
    if (!t._dueDate) return false;
    return t._dueDate >= todayStart && t._dueDate < tomorrowStart && !t._isDone;
  });

  const upcomingWeek = tasks.filter((t) => {
    if (!t._dueDate) return false;
    const inNext7 = t._dueDate >= tomorrowStart && t._dueDate < startOfDay(addDays(now, 8));
    return inNext7 && !t._isDone;
  });

  const totalTasks = tasks.length;
  const doneTasksCount = tasks.filter((t) => t._isDone).length;
  const progressPercent = percent(doneTasksCount, totalTasks);

  const nextAction = (tasksToday[0] ?? overdueTasks[0] ?? upcomingWeek[0] ?? null) as EnrichedTask | null;

  const stats = [
    {
      label: "À faire aujourd'hui",
      value: String(tasksToday.length),
      trend: tasksToday.length > 0 ? "Aujourd'hui" : "R.A.S.",
      icon: ListTodo,
    },
    {
      label: "Contenus planifiés",
      value: String(plannedContents.length),
      trend: plannedToday.length > 0 ? "Aujourd'hui" : "Semaine",
      icon: Calendar,
    },
    {
      label: "Retards",
      value: String(overdueTasks.length),
      trend: overdueTasks.length > 0 ? "Priorité" : "OK",
      icon: AlertTriangle,
    },
    {
      label: "Progression",
      value: `${progressPercent}%`,
      trend: `${doneTasksCount}/${totalTasks}`,
      icon: TrendingUp,
    },
  ];

  return (
    <AppShell userEmail={userEmail}>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Aujourd&apos;hui</h1>
            <p className="text-sm text-muted-foreground">
              Avance sur l’essentiel, sans te disperser.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/create">
              <Button className="bg-[#b042b4] text-white hover:opacity-95">
                <Sparkles className="w-4 h-4 mr-2" />
                Créer un contenu
              </Button>
            </Link>
            <Link href="/strategy">
              <Button variant="outline">Ma stratégie</Button>
            </Link>
          </div>
        </div>

        {/* Next action */}
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs">
                <ClipboardList className="w-4 h-4" />
                Prochaine action
              </div>

              <h2 className="mt-3 text-xl font-bold">
                {nextAction ? nextAction.title : "Rien d’urgent, continue ton rythme"}
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {nextAction
                  ? nextAction.description || "Une action concrète pour faire avancer ton business."
                  : "Ajoute des échéances à tes tâches ou planifie du contenu pour la semaine."}
              </p>

              {nextAction ? (
                <div className="mt-4 flex items-center gap-2">
                  {nextAction._isImportant ? (
                    <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">
                      Prioritaire
                    </Badge>
                  ) : (
                    <Badge variant="secondary">À faire</Badge>
                  )}
                  <Badge variant="outline">{nextAction._label}</Badge>
                </div>
              ) : null}
            </div>

            <div className="hidden md:flex items-center justify-center h-14 w-14 rounded-2xl bg-muted">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Link href="/tasks" className="group">
              <div className="rounded-xl border border-border p-4 hover:bg-muted/40 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Tâches</p>
                    <p className="text-sm font-semibold">{totalTasks}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </Link>

            <Link href="/contents" className="group">
              <div className="rounded-xl border border-border p-4 hover:bg-muted/40 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Contenus</p>
                    <p className="text-sm font-semibold">{plannedContents.length}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </Link>

            <Link href="/calendar" className="group">
              <div className="rounded-xl border border-border p-4 hover:bg-muted/40 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Calendrier</p>
                    <p className="text-sm font-semibold">
                      {plannedToday.length > 0 ? `${plannedToday.length} aujourd’hui` : "Voir"}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </Link>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.label} className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="mt-2 text-2xl font-bold">{s.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{s.trend}</p>
                  </div>

                  <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick actions */}
          <Card className="p-6 lg:col-span-1">
            <h3 className="text-lg font-bold mb-4">Actions rapides</h3>

            <div className="space-y-3">
              <Link href="/create">
                <Button className="w-full bg-[#b042b4] text-white hover:opacity-95 justify-between">
                  Créer un contenu
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>

              <Link href="/tasks">
                <Button variant="outline" className="w-full justify-between">
                  Gérer mes tâches
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>

              <Link href="/strategy">
                <Button variant="outline" className="w-full justify-between">
                  Voir ma stratégie
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>

              <Link href="/contents">
                <Button variant="outline" className="w-full justify-between">
                  Mes contenus
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            {!hasDbTasks ? (
              <div className="mt-6 rounded-2xl border border-dashed border-border p-4">
                <p className="text-sm font-semibold">Astuce</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tes tâches viennent encore du plan stratégique (fallback). Lance un{" "}
                  <span className="font-medium">Sync</span> depuis la page Stratégie pour les importer dans la base.
                </p>

                <div className="mt-3">
                  <Link href="/strategy">
                    <Button variant="outline" className="w-full">
                      Sync tâches (dans Stratégie)
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </div>
            ) : null}
          </Card>

          {/* Today tasks */}
          <Card className="p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Aujourd&apos;hui</h3>
              <Badge variant="outline" className="text-xs">
                {tasksToday.length} tâche(s)
              </Badge>
            </div>

            {tasksToday.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Rien d’urgent aujourd’hui. Bonne nouvelle.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ajoute une échéance à une tâche pour la voir apparaître ici.
                </p>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Link href="/tasks">
                    <Button variant="outline" className="w-full">
                      Voir toutes mes tâches
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>

                  {!hasDbTasks ? (
                    <Link href="/strategy">
                      <Button variant="outline" className="w-full">
                        Sync tâches (dans Stratégie)
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <TaskList
                  title="Tâches du jour"
                  tasks={tasksToday.slice(0, 5).map(
                    (t): TaskItem => ({
                      id: t.id,
                      title: t.title,
                      description: t.description ?? null,
                      status: t.status ?? null,
                      due_date: t.due_date ?? null,
                      importance: t.importance ?? null,
                    }),
                  )}
                  showSync={false}
                  allowCreate={false}
                  variant="flat"
                  hideHeader
                />

                <div className="pt-1">
                  <Link href="/tasks">
                    <Button variant="ghost" className="w-full justify-between">
                      Gérer toutes les tâches
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Upcoming */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">À venir</h3>
              <p className="text-sm text-muted-foreground">Ce qui arrive sur les 7 prochains jours.</p>
            </div>
            <Badge variant="outline" className="text-xs">
              {upcomingWeek.length + plannedContents.length} élément(s)
            </Badge>
          </div>

          {upcomingWeek.length === 0 && plannedContents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center mt-4">
              <p className="text-sm text-muted-foreground">Rien de planifié sur la semaine pour l’instant.</p>
              <p className="text-xs text-muted-foreground mt-1">Planifie un contenu pour garder le rythme.</p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                <Link href="/create">
                  <Button className="w-full bg-[#b042b4] text-white hover:opacity-95">
                    Créer un contenu
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/tasks">
                  <Button variant="outline" className="w-full">
                    Ajouter une tâche
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Tâches</h4>
                  <Badge variant="secondary" className="text-xs">
                    {upcomingWeek.length}
                  </Badge>
                </div>

                {upcomingWeek.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-3">Aucune tâche sur les 7 prochains jours.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {upcomingWeek.slice(0, 6).map((t) => (
                      <div key={t.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{t.title}</div>
                          <div className="text-xs text-muted-foreground">Échéance : {t._label}</div>
                        </div>
                        {t._isImportant ? (
                          <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Prioritaire</Badge>
                        ) : (
                          <Badge variant="outline">À faire</Badge>
                        )}
                      </div>
                    ))}

                    <div className="pt-1">
                      <Link href="/tasks">
                        <Button variant="ghost" className="w-full justify-between">
                          Voir tout
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Contenus</h4>
                  <Badge variant="secondary" className="text-xs">
                    {plannedContents.length}
                  </Badge>
                </div>

                {plannedContents.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-3">Aucun contenu planifié.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {[...plannedToday, ...plannedWeek].slice(0, 6).map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {c.title || "Contenu"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {c.scheduled_date ? `Planifié : ${c.scheduled_date}` : "Non planifié"}
                          </div>
                        </div>

                        <Badge variant="outline" className="text-xs">
                          {c.content_type || "content"}
                        </Badge>
                      </div>
                    ))}

                    <div className="pt-1">
                      <Link href="/contents">
                        <Button variant="ghost" className="w-full justify-between">
                          Voir tout
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
