// app/app/page.tsx
// Dashboard "Aujourd'hui" (aligné Lovable + cahier des charges)
// - Protégé par l'auth Supabase
// - Si aucun plan stratégique => redirect /onboarding
// - UI : banner “Ta prochaine action” + 4 stats + progress semaine + actions rapides + à venir
// - Zéro nouvelle route/API/table : on lit business_plan / project_tasks / content_item

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  FileText,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";

type TaskItem = {
  id: string;
  title: string;
  status: string | null;
  due_date: string | null;
  priority: string | null;
  source: string | null;
  created_at: string | null;
};

type ContentItem = {
  id: string;
  type: string | null;
  title: string | null;
  status: string | null;
  scheduled_date: string | null;
  channel: string | null;
  created_at: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toStringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function toNonEmptyStringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function toIdString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function parseDateSafe(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function isDoneStatus(status: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "done" || s === "completed" || s === "fait" || s === "terminé" || s === "termine";
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function formatDayLabel(d: Date): string {
  // Format simple FR sans lib (ex: "jeu 25")
  const days = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}`;
}

function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getPlanProgressPercent(planJson: unknown): number | null {
  // On reste compatible: si plan_json contient un champ "progress" (0..1 ou 0..100)
  if (!isRecord(planJson)) return null;
  const v = planJson.progress;
  const n = safeNumber(v);
  if (n === null) return null;
  if (n > 1) return Math.round(clamp01(n / 100) * 100);
  return Math.round(clamp01(n) * 100);
}

export default async function TodayPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userId = session.user.id;
  const userEmail = session.user.email ?? "";

  // 1) Plan stratégique : requis pour accéder à l'app (cahier des charges)
  const { data: planRow } = await supabase
    .from("business_plan")
    .select("id, plan_json")
    .eq("user_id", userId)
    .maybeSingle();

  if (!planRow) {
    redirect("/onboarding");
  }

  const planJson: unknown = isRecord(planRow) ? planRow.plan_json : null;

  // 2) Tâches (project_tasks)
  const { data: tasksData } = await supabase
    .from("project_tasks")
    .select("id, title, status, due_date, priority, source, created_at")
    .eq("user_id", userId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const tasks: TaskItem[] = Array.isArray(tasksData)
    ? tasksData
        .map((r: unknown) => {
          if (!isRecord(r)) return null;
          const id = toIdString(r.id);
          const title = toNonEmptyStringOrNull(r.title);
          if (!id || !title) return null;

          return {
            id,
            title,
            status: toStringOrNull(r.status),
            due_date: toStringOrNull(r.due_date),
            priority: toStringOrNull(r.priority),
            source: toStringOrNull(r.source),
            created_at: toStringOrNull(r.created_at),
          };
        })
        .filter((x: TaskItem | null): x is TaskItem => x !== null)
    : [];

  // 3) Contenus (pour stats + "à venir cette semaine")
  const { data: contentsData } = await supabase
    .from("content_item")
    .select("id, type, title, status, scheduled_date, channel, created_at")
    .eq("user_id", userId)
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const contents: ContentItem[] = Array.isArray(contentsData)
    ? contentsData
        .map((r: unknown) => {
          if (!isRecord(r)) return null;
          const id = toIdString(r.id);
          if (!id) return null;

          return {
            id,
            type: toStringOrNull(r.type),
            title: toStringOrNull(r.title),
            status: toStringOrNull(r.status),
            scheduled_date: toStringOrNull(r.scheduled_date),
            channel: toStringOrNull(r.channel),
            created_at: toStringOrNull(r.created_at),
          };
        })
        .filter((x: ContentItem | null): x is ContentItem => x !== null)
    : [];

  const now = new Date();
  const today0 = startOfDay(now);
  const tomorrow0 = new Date(today0.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(today0.getTime() + 7 * 24 * 60 * 60 * 1000);

  const openTasks = tasks.filter((t) => !isDoneStatus(t.status));
  const doneTasks = tasks.filter((t) => isDoneStatus(t.status));

  const nextTask =
    openTasks.find((t) => {
      const d = parseDateSafe(t.due_date);
      if (!d) return false;
      return d >= today0 && d < tomorrow0;
    }) ??
    openTasks.find((t) => {
      const d = parseDateSafe(t.due_date);
      if (!d) return false;
      return d >= today0 && d < weekEnd;
    }) ??
    openTasks[0] ??
    null;

  const upcomingThisWeek = contents
    .map((c) => ({
      ...c,
      _date: parseDateSafe(c.scheduled_date),
    }))
    .filter((c) => c._date && c._date >= today0 && c._date < weekEnd)
    .sort((a, b) => (a._date!.getTime() - b._date!.getTime()))
    .slice(0, 6);

  const publishedCount = contents.filter((c) => (c.status ?? "").toLowerCase() === "published").length;
  const scheduledCount = contents.filter((c) => (c.status ?? "").toLowerCase() === "scheduled").length;

  const tasksCompletionRatio = tasks.length === 0 ? 0 : doneTasks.length / tasks.length;
  const tasksCompletionPercent = Math.round(clamp01(tasksCompletionRatio) * 100);

  const planProgressPercent = getPlanProgressPercent(planJson);
  const displayPlanPercent = planProgressPercent ?? tasksCompletionPercent;

  // “Prochaine échéance” : min due_date parmi tâches ouvertes
  const nextDue = openTasks
    .map((t) => parseDateSafe(t.due_date))
    .filter((d: Date | null): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const nextDueLabel = nextDue ? formatDayLabel(nextDue) : "—";

  return (
    <AppShell
      userEmail={userEmail}
      headerTitle="Aujourd’hui"
      headerRight={
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href="/analytics">
            <TrendingUp className="h-4 w-4" />
            Analytics détaillés
          </Link>
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {/* Banner "Ta prochaine action" (hero) */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-white/20" />
            <div className="absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-white/15" />
          </div>

          <div className="relative p-6 md:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-white/15 p-3">
                  <Sparkles className="h-6 w-6" />
                </div>

                <div className="min-w-0">
                  <p className="text-white/80">Ta prochaine action</p>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
                    {nextTask ? nextTask.title : "Aucune tâche urgente pour aujourd’hui"}
                  </h1>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge className="border-0 bg-white/15 text-white hover:bg-white/20">
                      {nextTask?.source ? nextTask.source : "Tâche"}
                    </Badge>
                    <Badge className="border-0 bg-white/15 text-white hover:bg-white/20">
                      {nextTask?.priority ? nextTask.priority : "Priorité"}
                    </Badge>
                    <Badge className="border-0 bg-white/15 text-white hover:bg-white/20">
                      {nextTask?.due_date ? `Échéance : ${nextTask.due_date}` : "Échéance : —"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" className="gap-2 bg-white text-violet-700 hover:bg-white/90">
                  <Link href="/create">
                    Créer en 1 clic
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>

                <Button asChild size="sm" variant="secondary" className="bg-white/15 text-white hover:bg-white/20">
                  <Link href="/strategy">Voir la stratégie</Link>
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* 4 stats cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Contenus publiés</p>
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <FileText className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold">{publishedCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">Total publiés</p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Tâches complétées</p>
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold">
              {doneTasks.length}/{tasks.length}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{tasksCompletionPercent}% de complétion</p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Contenus planifiés</p>
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <Calendar className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold">{scheduledCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">Total planifiés</p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Prochaine échéance</p>
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <Target className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold">{nextDueLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">Sur tes tâches ouvertes</p>
          </Card>
        </div>

        {/* Progression de la semaine */}
        <Card className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Progression de la semaine</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Garde le cap : stratégie, exécution, contenus.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/strategy">Voir ma stratégie complète</Link>
              </Button>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Plan stratégique</span>
                <span className="font-medium">{displayPlanPercent}%</span>
              </div>
              <Progress value={displayPlanPercent} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tâches complétées</span>
                <span className="font-medium">
                  {doneTasks.length}/{tasks.length}
                </span>
              </div>
              <Progress value={tasksCompletionPercent} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Contenus planifiés (semaine)</span>
                <span className="font-medium">
                  {upcomingThisWeek.length}/{Math.max(upcomingThisWeek.length, 6)}
                </span>
              </div>
              <Progress value={Math.round(clamp01(upcomingThisWeek.length / 6) * 100)} />
            </div>
          </div>
        </Card>

        {/* Actions rapides + À venir */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="p-6 lg:col-span-1">
            <h3 className="text-lg font-semibold">Actions rapides</h3>
            <p className="mt-1 text-sm text-muted-foreground">Les 3 raccourcis qui comptent.</p>

            <div className="mt-4 flex flex-col gap-2">
              <Button asChild className="justify-between">
                <Link href="/create">
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Créer du contenu
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>

              <Button asChild variant="outline" className="justify-between">
                <Link href="/contents">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Voir mes contenus
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>

              <Button asChild variant="outline" className="justify-between">
                <Link href="/tasks">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Planifier ma semaine
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-5 rounded-xl border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                  <Target className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Prochaine étape recommandée</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {nextTask ? "Commence par ta tâche du jour, puis génère ton contenu." : "Génère un contenu aujourd’hui pour garder le rythme."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link href={nextTask ? "/tasks" : "/create"}>
                        {nextTask ? "Commencer" : "Générer"}
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/strategy">Voir la stratégie</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6 lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">À venir cette semaine</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tes contenus planifiés (et ton focus).
                </p>
              </div>

              <Button asChild variant="outline" size="sm">
                <Link href="/contents">Tout voir</Link>
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {upcomingThisWeek.length > 0 ? (
                upcomingThisWeek.map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-3 rounded-xl border p-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary">
                        <Calendar className="h-4 w-4" />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {c.title ?? "Contenu planifié"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {c._date ? formatDayLabel(c._date) : "—"} · {c.type ?? "Contenu"} {c.channel ? `· ${c.channel}` : ""}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant="secondary">{c.status ?? "scheduled"}</Badge>
                          {c.type ? <Badge variant="secondary">{c.type}</Badge> : null}
                        </div>
                      </div>
                    </div>

                    <Button asChild size="sm" className="shrink-0">
                      <Link href={`/contents/${encodeURIComponent(c.id)}`}>Voir</Link>
                    </Button>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border bg-muted/20 p-6">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary">
                      <Calendar className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Rien de planifié pour l’instant</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Planifie un contenu depuis <span className="font-medium">Créer</span> puis retrouve-le ici.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button asChild size="sm" className="gap-2">
                          <Link href="/create">
                            <Sparkles className="h-4 w-4" />
                            Créer maintenant
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link href="/contents">Mes contenus</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Focus du jour</p>
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Target className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {nextTask ? nextTask.title : "Produire 1 contenu utile pour ton audience."}
                </p>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Énergie</p>
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Un petit pas aujourd’hui &rarr; une semaine solide.
                </p>
              </Card>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
