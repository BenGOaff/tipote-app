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
import { Progress } from "@/components/ui/progress";

import {
  Brain,
  TrendingUp,
  Calendar,
  FileText,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Target,
  Play,
  BarChart3,
  AlertTriangle,
  Clock,
  ListTodo,
} from "lucide-react";

type AnyRecord = Record<string, unknown>;

type PlanTask = {
  title?: string;
  description?: string;
  status?: string | null;
  due_date?: string | null;
  dueDate?: string | null;
  importance?: string | null;
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
  _dueDate: Date | null;
  _isDone: boolean;
  _isImportant: boolean;
};

type ContentItem = {
  id: string;
  type: string | null;
  title: string | null;
  status: string | null;
  scheduled_date: string | null; // YYYY-MM-DD
  channel: string | null;
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isDoneStatus(status: string | undefined | null): boolean {
  const s = String(status ?? "").toLowerCase();
  return ["done", "completed", "termin", "finished"].some((k) => s.includes(k));
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function formatDueBadge(due: Date | null) {
  if (!due) return "Sans échéance";
  const now = new Date();
  const today = startOfDay(now);
  const dueDay = startOfDay(due);

  const diffDays = Math.round(
    (dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays < 0) return "En retard";
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Demain";
  if (diffDays <= 7) return `Dans ${diffDays} jours`;
  return due.toLocaleDateString("fr-FR");
}

function formatIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatScheduledBadge(iso: string | null) {
  if (!iso) return "Sans date";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mm, dd] = m;
  return `${dd}/${mm}/${y}`;
}

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

function enrichTask(
  base: {
    id: string;
    title: string;
    description: string | null;
    status: string | null;
    due_date: string | null;
    importance: string | null;
  },
): EnrichedTask {
  const due = parseDate(base.due_date);
  const important = String(base.importance ?? "").toLowerCase() === "high";
  return {
    ...base,
    _dueDate: due,
    _isDone: isDoneStatus(base.status),
    _isImportant: important,
  };
}

export default async function TodayPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "";

  // 1) Vérifier onboarding/plan existant (logique existante)
  const { data: businessPlan } = await supabase
    .from("business_plan")
    .select("id, plan_json, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!businessPlan) {
    redirect("/onboarding");
  }

  const { data: businessProfile } = await supabase
    .from("business_profile")
    .select("*")
    .eq("user_id", session.user.id)
    .maybeSingle();

  const planJson = (businessPlan as AnyRecord)?.plan_json as AnyRecord | null;

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
          const title = typeof t.title === "string" ? t.title.trim() : "";
          const description =
            typeof t.description === "string" ? t.description.trim() : null;
          const status = typeof t.status === "string" ? t.status.trim() : "todo";
          const due = (t.due_date ?? t.dueDate ?? null) as string | null;
          const due_date = typeof due === "string" && due.trim() ? due.trim() : null;
          const importance =
            typeof t.importance === "string" && t.importance.trim()
              ? t.importance.trim().toLowerCase()
              : null;

          return enrichTask({
            id: `plan-${idx}-${title || "task"}`,
            title: title || "Tâche",
            description,
            status,
            due_date,
            importance,
          });
        })
        .filter((t) => t.title.trim().length > 0);

  // tri : d'abord échéance, puis important
  const tasks = [...mergedTasks].sort((a, b) => {
    const da = a._dueDate ? a._dueDate.getTime() : Number.POSITIVE_INFINITY;
    const db = b._dueDate ? b._dueDate.getTime() : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    if (a._isImportant !== b._isImportant) return a._isImportant ? -1 : 1;
    return 0;
  });

  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(
    todayStart.getFullYear(),
    todayStart.getMonth(),
    todayStart.getDate() + 1,
  );
  const weekEnd = new Date(
    todayStart.getFullYear(),
    todayStart.getMonth(),
    todayStart.getDate() + 7,
  );

  const overdueTasks = tasks.filter(
    (t) => t._dueDate && t._dueDate < todayStart && !t._isDone,
  );

  const tasksToday = tasks.filter((t) => {
    if (!t._dueDate) return false;
    return t._dueDate >= todayStart && t._dueDate < tomorrowStart && !t._isDone;
  });

  const upcomingWeek = tasks.filter((t) => {
    if (!t._dueDate) return false;
    return t._dueDate >= tomorrowStart && t._dueDate < weekEnd && !t._isDone;
  });

  const totalTasks = tasks.length;
  const doneTasksCount = tasks.filter((t) => t._isDone).length;
  const progressPercent =
    totalTasks > 0 ? Math.round((doneTasksCount / totalTasks) * 100) : 0;

  const rawGoal90 =
    (businessProfile as AnyRecord)?.main_goal ??
    (businessProfile as AnyRecord)?.goal_90_days ??
    "";

  const goal90: string =
    typeof rawGoal90 === "string" ? rawGoal90 : String(rawGoal90 ?? "");

  // Prochaine action = priorité aux retards, sinon aujourd'hui
  const nextTask: EnrichedTask | null = overdueTasks[0] ?? tasksToday[0] ?? null;

  const nextTitle =
    nextTask?.title?.trim?.() ||
    (tasksToday.length > 0
      ? "Choisir ta prochaine action"
      : "Définir ta prochaine action");

  const nextDescription =
    nextTask?.description?.trim?.() ||
    (!hasDbTasks
      ? "Astuce : va dans “Ma stratégie” puis clique “Sync tâches” pour importer les tâches en base."
      : "Tu peux avancer avec tes actions rapides et planifier tes contenus.");

  const nextDue = (nextTask?._dueDate ?? null) as Date | null;
  const nextDueBadge = formatDueBadge(nextDue);

  // 3) Contenus planifiés
  const todayIso = formatIsoDate(todayStart);
  const weekIso = formatIsoDate(weekEnd);

  const { data: plannedContentRaw } = await supabase
    .from("content_item")
    .select("id, type, title, status, scheduled_date, channel")
    .eq("user_id", session.user.id)
    .not("scheduled_date", "is", null)
    .gte("scheduled_date", todayIso)
    .lte("scheduled_date", weekIso)
    .order("scheduled_date", { ascending: true })
    .limit(25);

  const plannedContents: ContentItem[] = Array.isArray(plannedContentRaw)
    ? (plannedContentRaw as ContentItem[])
    : [];

  const plannedToday = plannedContents.filter((c) => c.scheduled_date === todayIso);
  const plannedWeek = plannedContents.filter((c) => c.scheduled_date !== todayIso);

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
      trend: plannedContents.length > 0 ? "Semaine" : "—",
      icon: Calendar,
    },
    {
      label: "Alertes",
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
        {/* Header (Lovable style) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Aujourd&apos;hui</h1>
            <Badge variant="outline" className="text-xs">
              {new Date().toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
              })}
            </Badge>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <Link href="/create">
              <Button className="gradient-primary text-primary-foreground">
                <Sparkles className="w-4 h-4 mr-2" />
                Créer
              </Button>
            </Link>
            <Link href="/analytics">
              <Button variant="outline">
                <BarChart3 className="w-4 h-4 mr-2" />
                Analytics
              </Button>
            </Link>
          </div>
        </div>

        {/* Hero / Next action */}
        <Card className="p-6 gradient-primary border-none">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-background/20 text-primary-foreground border-none">
                  Prochaine action
                </Badge>
                <Badge className="bg-background/20 text-primary-foreground border-none">
                  {nextDueBadge}
                </Badge>
              </div>

              <h2 className="text-2xl font-bold text-primary-foreground mb-2">
                {nextTitle}
              </h2>

              <p className="text-primary-foreground/80 mb-6 max-w-2xl">
                {nextDescription}
              </p>

              <div className="flex items-center gap-3 flex-wrap">
                <Link href="/create">
                  <Button className="bg-background/20 hover:bg-background/30 text-primary-foreground border-none">
                    <Play className="w-4 h-4 mr-2" />
                    Créer en 1 clic
                  </Button>
                </Link>

                <Link href="/strategy">
                  <Button
                    variant="ghost"
                    className="text-primary-foreground hover:bg-background/10"
                  >
                    Ma stratégie
                  </Button>
                </Link>
              </div>
            </div>

            <Brain className="w-20 h-20 text-primary-foreground/30 hidden lg:block" />
          </div>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <stat.icon className="w-5 h-5 text-primary" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{stat.trend}</p>
            </Card>
          ))}
        </div>

        {/* Middle grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Progress / Goal */}
          <Card className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">Objectif 90 jours</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {goal90 || "Définis ton objectif pendant l’onboarding"}
                </p>
              </div>
              <Target className="w-5 h-5 text-primary mt-1" />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>Progression</span>
                <span className="font-semibold">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} />

              <div className="pt-2">
                <Link href="/strategy">
                  <Button variant="outline" className="w-full">
                    Voir ma stratégie complète
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-6">Actions rapides</h3>

            <div className="space-y-3">
              <Link href="/create" className="block">
                <div className="p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold group-hover:text-primary transition-colors">
                        Générer un contenu
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Créer un post, une newsletter, une idée…
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </Link>

              <Link href="/contents" className="block">
                <div className="p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold group-hover:text-primary transition-colors">
                        Mes contenus
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Retrouver, éditer, planifier
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </Link>

              <Link href="/strategy" className="block">
                <div className="p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold group-hover:text-primary transition-colors">
                        Ma stratégie
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Pyramides, offres, angles
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </Link>
            </div>
          </Card>

          {/* Today tasks */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Aujourd&apos;hui</h3>
              <Badge variant="outline" className="text-xs">
                {tasksToday.length} tâche(s)
              </Badge>
            </div>

            {tasksToday.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">Rien d’urgent aujourd’hui 🎉</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tu peux avancer sur la création de contenu.
                </p>
                <div className="mt-4">
                  <Link href="/create">
                    <Button className="w-full gradient-primary text-primary-foreground">
                      <Sparkles className="w-4 h-4 mr-2" />
                      Créer
                    </Button>
                  </Link>
                </div>

                {!hasDbTasks ? (
                  <div className="mt-3">
                    <Link href="/strategy">
                      <Button variant="outline" className="w-full">
                        Sync tâches (dans Stratégie)
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                {tasksToday.slice(0, 5).map((t, idx) => (
                  <div
                    key={`${t.id}-${idx}`}
                    className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                        <ListTodo className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">
                          {t.title || "Action du jour"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDueBadge((t._dueDate ?? null) as Date | null)}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {t._isImportant ? "Important" : "Standard"}
                    </Badge>
                  </div>
                ))}

                <div className="pt-2">
                  <Link href="/strategy">
                    <Button variant="outline" className="w-full">
                      Voir les tâches
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Upcoming / A venir */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">À venir</h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {upcomingWeek.length} tâche(s)
              </Badge>
              <Badge variant="outline" className="text-xs">
                {plannedContents.length} contenu(s)
              </Badge>
            </div>
          </div>

          {upcomingWeek.length === 0 && plannedContents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Rien de planifié sur la semaine pour l’instant.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Planifie un contenu pour garder le rythme.
              </p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                <Link href="/create">
                  <Button className="w-full gradient-primary text-primary-foreground">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Créer
                  </Button>
                </Link>
                <Link href="/contents">
                  <Button variant="outline" className="w-full">
                    Mes contenus
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Upcoming tasks */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">Tâches (7 jours)</p>
                  <Link href="/strategy" className="text-xs font-semibold text-primary">
                    Voir →
                  </Link>
                </div>

                {upcomingWeek.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center">
                    <p className="text-sm text-muted-foreground">Aucune tâche à venir.</p>
                    {!hasDbTasks ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        Va dans “Ma stratégie” → “Sync tâches”.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  upcomingWeek.slice(0, 5).map((t, idx) => (
                    <div
                      key={`${t.id}-${idx}`}
                      className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                          <Clock className="h-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">
                            {t.title || "Action à venir"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDueBadge((t._dueDate ?? null) as Date | null)}
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {t._isImportant ? "Important" : "Standard"}
                      </Badge>
                    </div>
                  ))
                )}
              </div>

              {/* Planned contents */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">Contenus planifiés</p>
                  <Link
                    href="/contents?view=calendar"
                    className="text-xs font-semibold text-primary"
                  >
                    Calendrier →
                  </Link>
                </div>

                {plannedContents.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center">
                    <p className="text-sm text-muted-foreground">Aucun contenu planifié.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Renseigne une date dans “Créer”.
                    </p>
                  </div>
                ) : (
                  <>
                    {plannedToday.length > 0 ? (
                      <div className="rounded-lg border border-border p-3 bg-muted/30">
                        <p className="text-xs text-muted-foreground mb-2">
                          Aujourd&apos;hui ({formatScheduledBadge(todayIso)})
                        </p>
                        <div className="space-y-2">
                          {plannedToday.slice(0, 3).map((c) => (
                            <Link
                              key={c.id}
                              href={`/contents/${c.id}`}
                              className="block rounded-md border border-border bg-background p-3 hover:bg-muted/40 transition-colors"
                            >
                              <p className="text-[11px] text-muted-foreground">
                                {c.type ?? "—"} • {c.channel ?? "—"}
                              </p>
                              <p className="text-sm font-semibold">{c.title ?? "Sans titre"}</p>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      {plannedWeek.slice(0, 5).map((c) => (
                        <Link
                          key={c.id}
                          href={`/contents/${c.id}`}
                          className="block rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] text-muted-foreground">
                                {formatScheduledBadge(c.scheduled_date)} • {c.type ?? "—"} •{" "}
                                {c.channel ?? "—"}
                              </p>
                              <p className="text-sm font-semibold truncate">
                                {c.title ?? "Sans titre"}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {c.status ?? "planned"}
                            </Badge>
                          </div>
                        </Link>
                      ))}
                    </div>

                    <div className="pt-2">
                      <Link href="/contents">
                        <Button variant="outline" className="w-full">
                          Voir tous mes contenus
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
