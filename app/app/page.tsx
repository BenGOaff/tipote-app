// app/app/page.tsx
// Dashboard "Aujourd'hui" (Design Lovable + logique existante)
// - Protégé par l'auth Supabase
// - Si aucun plan stratégique => redirect /onboarding
// - UI Lovable : Welcome/Next action + stats + progression + quick actions + à venir
// - Pas de contenu "prérempli" : on affiche des placeholders propres si pas de données

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

type AnyRecord = Record<string, any>;

type Task = {
  title?: string;
  description?: string;
  status?: string | null;
  due_date?: string | null;
  dueDate?: string | null; // variantes possibles
  importance?: string | null; // "high" / ...
};

type BusinessPlanJson = {
  business_profile?: AnyRecord;
  action_plan_30_90?: {
    main_goal?: string;
    phase?: string;
    current_week?: number;
  };
  tasks?: Task[];
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isDoneStatus(status: string | undefined | null): boolean {
  const s = String(status ?? "").toLowerCase();
  return ["done", "completed", "terminé", "termine", "finished"].some((k) => s.includes(k));
}

function parseDueDate(task: Task): Date | null {
  const value = task.due_date ?? task.dueDate ?? null;
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

  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "En retard";
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Demain";
  if (diffDays <= 7) return `Dans ${diffDays} jours`;
  return due.toLocaleDateString("fr-FR");
}

export default async function AppPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/auth/login");
  }

  const userEmail = session.user.email ?? "Utilisateur";

  // 1) Charger le plan stratégique
  const { data: planRow, error: planError } = await supabase
    .from("business_plan")
    .select("id, plan_json")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (planError) {
    console.error("[AppPage] Supabase business_plan select error", planError);
  }

  // 2) Si pas de plan => onboarding
  if (!planRow || !planRow.plan_json) {
    redirect("/onboarding");
  }

  const planJson = (planRow.plan_json ?? {}) as BusinessPlanJson;
  const businessProfile = (planJson.business_profile ?? {}) as AnyRecord;
  const actionPlan = (planJson.action_plan_30_90 ?? {}) as BusinessPlanJson["action_plan_30_90"];
  const rawTasks = Array.isArray(planJson.tasks) ? (planJson.tasks as Task[]) : [];

  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1);
  const weekEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 7);

  const tasks = rawTasks
    .map((t) => {
      const due = parseDueDate(t);
      return {
        ...t,
        _dueDate: due as Date | null,
        _isDone: isDoneStatus(t.status),
        _isImportant: String(t.importance ?? "").toLowerCase() === "high",
      };
    })
    // tri stable : d'abord échéance, puis important
    .sort((a: any, b: any) => {
      const da = a._dueDate ? a._dueDate.getTime() : Number.POSITIVE_INFINITY;
      const db = b._dueDate ? b._dueDate.getTime() : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      if (a._isImportant !== b._isImportant) return a._isImportant ? -1 : 1;
      return 0;
    });

  const overdueTasks = tasks.filter((t: any) => t._dueDate && t._dueDate < todayStart && !t._isDone);
  const tasksToday = tasks.filter(
    (t: any) => t._dueDate && t._dueDate >= todayStart && t._dueDate < tomorrowStart && !t._isDone,
  );
  const upcomingWeek = tasks.filter(
    (t: any) => t._dueDate && t._dueDate >= tomorrowStart && t._dueDate < weekEnd && !t._isDone,
  );

  const totalTasks = tasks.length;
  const doneTasksCount = tasks.filter((t: any) => t._isDone).length;
  const progressPercent = totalTasks === 0 ? 0 : Math.round((doneTasksCount / totalTasks) * 100);

  // Objectif 90 jours (variantes possibles)
  const goal90 =
    actionPlan?.main_goal ??
    businessProfile.main_goal ??
    businessProfile.goal_90_days ??
    "";

  // Prochaine action = priorité aux retards, sinon aujourd'hui
  const nextTask: any = overdueTasks[0] ?? tasksToday[0] ?? null;

  const nextTitle =
    nextTask?.title?.trim?.() ||
    (tasksToday.length > 0 ? "Choisir ta prochaine action" : "Définir ta prochaine action");
  const nextDescription =
    nextTask?.description?.trim?.() ||
    "On va remplir ça automatiquement après l’onboarding. Pour l’instant, tu peux avancer avec tes actions rapides.";

  const nextDue = (nextTask?._dueDate ?? null) as Date | null;
  const nextDueBadge = formatDueBadge(nextDue);

  const stats = [
    {
      label: "À faire aujourd'hui",
      value: String(tasksToday.length),
      trend: tasksToday.length > 0 ? "Aujourd'hui" : "R.A.S.",
      icon: ListTodo,
    },
    {
      label: "En retard",
      value: String(overdueTasks.length),
      trend: overdueTasks.length > 0 ? "Priorité" : "OK",
      icon: AlertTriangle,
    },
    {
      label: "Cette semaine",
      value: String(upcomingWeek.length),
      trend: upcomingWeek.length > 0 ? "À venir" : "Calme",
      icon: Clock,
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
              Dashboard
            </Badge>
          </div>

          <Link href="/analytics">
            <Button variant="outline" size="sm">
              <BarChart3 className="w-4 h-4 mr-2" />
              Analytics détaillés
            </Button>
          </Link>
        </div>

        {/* Welcome Card with Next Action */}
        <Card className="p-8 gradient-hero border-border/50">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-background/20 backdrop-blur-sm flex items-center justify-center">
                  <Target className="w-6 h-6 text-primary-foreground" />
                </div>

                <div>
                  <p className="text-primary-foreground/80 text-sm">Ta prochaine action</p>
                  <h2 className="text-2xl font-bold text-primary-foreground">{nextTitle}</h2>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <Badge className="bg-background/20 text-primary-foreground border-none">
                  <Calendar className="w-3.5 h-3.5 mr-1.5" />
                  {nextDueBadge}
                </Badge>

                {nextTask?._isImportant ? (
                  <Badge className="bg-background/20 text-primary-foreground border-none">
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Important
                  </Badge>
                ) : (
                  <Badge className="bg-background/20 text-primary-foreground border-none">
                    <Brain className="w-3.5 h-3.5 mr-1.5" />
                    Assisté par l&apos;IA
                  </Badge>
                )}
              </div>

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
                  <Button variant="ghost" className="text-primary-foreground hover:bg-background/10">
                    Voir la stratégie
                  </Button>
                </Link>
              </div>
            </div>

            <Brain className="w-20 h-20 text-primary-foreground/30 hidden lg:block" />
          </div>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <Card key={index} className="p-5 hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2.5 rounded-xl bg-muted">
                  <stat.icon className="w-5 h-5 text-primary" />
                </div>
                <Badge variant="outline" className="text-xs">
                  {stat.trend}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
              <p className="text-2xl font-bold">{stat.value}</p>
            </Card>
          ))}
        </div>

        {/* Progress + Quick Actions */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Progress Overview */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold">Progression</h3>
              <Badge className="gradient-primary text-primary-foreground border-none">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                {progressPercent}%
              </Badge>
            </div>

            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Actions terminées</span>
                  <span className="text-sm font-medium">
                    {doneTasksCount}/{totalTasks}
                  </span>
                </div>
                <Progress value={progressPercent} className="h-2" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Objectif 90 jours</span>
                  <span className="text-sm font-medium">
                    {goal90 ? "Défini" : "À définir"}
                  </span>
                </div>
                <Progress value={goal90 ? 25 : 0} className="h-2" />
                {goal90 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Objectif :</span> {goal90}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Ton objectif sera affiché ici après l’onboarding.
                  </p>
                )}
              </div>
            </div>

            <Link href="/strategy" className="block mt-6">
              <Button variant="outline" className="w-full">
                Voir ma stratégie complète
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
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
                    <div className="w-10 h-10 rounded-xl gradient-secondary flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-5 h-5 text-secondary-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold group-hover:text-primary transition-colors">
                        Voir mes contenus
                      </p>
                      <p className="text-sm text-muted-foreground">Liste & calendrier éditorial</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </Link>

              <Link href="/strategy" className="block">
                <div className="p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold group-hover:text-primary transition-colors">
                        Ajuster ma stratégie
                      </p>
                      <p className="text-sm text-muted-foreground">Pyramides, offres, angles</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </Link>
            </div>
          </Card>
        </div>

        {/* Upcoming / A venir */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">À venir</h3>
            <Badge variant="outline" className="text-xs">
              Semaine
            </Badge>
          </div>

          {upcomingWeek.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Rien de planifié pour la semaine pour l’instant. Après l’onboarding, on affichera ici tes prochaines échéances.
            </div>
          ) : (
            <div className="grid gap-3">
              {upcomingWeek.slice(0, 5).map((t: any, idx: number) => (
                <div
                  key={`${t.title ?? "task"}-${idx}`}
                  className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">{t.title ?? "Action à venir"}</div>
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
                <Link href="/contents">
                  <Button variant="outline" className="w-full">
                    Voir tout
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
