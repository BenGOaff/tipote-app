// app/app/page.tsx
// Dashboard "Aujourd'hui" (Design Lovable + logique existante)
// - Protégé par l'auth Supabase
// - Si aucun plan stratégique => redirect /onboarding
// - UI Lovable : Welcome/Next action + stats + progression + quick actions + à venir
// - Pas de contenu "prérempli" : on affiche des placeholders propres si pas de données

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

import { ExecutionFeedback } from "@/components/dashboard/ExecutionFeedback";
import { MarkTaskDoneButton } from "@/components/dashboard/MarkTaskDoneButton";

type AnyRecord = Record<string, any>;

function toNumber(v: unknown, fallback = 0) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDueDate(task: AnyRecord): Date | null {
  const due = task.due_date;
  if (typeof due !== "string" || !due) return null;
  const dt = new Date(due);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function isDone(status: unknown): boolean {
  if (typeof status !== "string") return false;
  const s = status.toLowerCase();
  return s === "done" || s === "completed" || s === "fait" || s === "terminé";
}

type ContentUpcomingItem = {
  id: string;
  title: string | null;
  type: string | null;
  status: string | null;
  scheduledDate: string | null;
  channel: string | null;
};

function parseScheduledDate(item: ContentUpcomingItem): Date | null {
  const s = item.scheduledDate;
  if (typeof s !== "string" || !s) return null;
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function normalizeContentRowV2(raw: AnyRecord): ContentUpcomingItem {
  const id = String(raw?.id ?? "");
  const title =
    (typeof raw?.title === "string" ? raw.title : null) ??
    (typeof raw?.titre === "string" ? raw.titre : null);

  const type = typeof raw?.type === "string" ? raw.type : null;
  const status = typeof raw?.status === "string" ? raw.status : null;

  const scheduledDate =
    (typeof raw?.scheduled_date === "string" ? raw.scheduled_date : null) ??
    (typeof raw?.date_planifiee === "string" ? raw.date_planifiee : null);

  const channel = typeof raw?.channel === "string" ? raw.channel : null;

  return { id, title, type, status, scheduledDate, channel };
}

function humanizeContentType(type: string | null) {
  if (!type) return "Contenu";
  const t = type.toLowerCase();
  if (t.includes("email")) return "Email";
  if (t.includes("blog")) return "Article";
  if (t.includes("video")) return "Script vidéo";
  if (t.includes("post")) return "Post";
  if (t.includes("offer")) return "Offre";
  if (t.includes("funnel")) return "Tunnel";
  return "Contenu";
}

function humanizeRelativeDate(date: Date) {
  const now = startOfDay(new Date());
  const target = startOfDay(date);
  const diff = Math.round((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) return "Aujourd’hui";
  if (diff === 1) return "Demain";
  if (diff === -1) return "Hier";
  if (diff > 1) return `Dans ${diff} jours`;
  return `Il y a ${Math.abs(diff)} jours`;
}

export default async function AppTodayPage() {
  const supabase = await getSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData?.session) {
    redirect("/");
  }

  const userId = sessionData.session.user.id;
  const userEmail = sessionData.session.user.email ?? "";

  // 1) Plan stratégique (business_plan.plan_json)
  const { data: planRow } = await supabase
    .from("business_plan")
    .select("id, plan_json")
    .eq("user_id", userId)
    .maybeSingle();

  if (!planRow) {
    redirect("/onboarding");
  }

  const planJson = (planRow?.plan_json ?? null) as AnyRecord | null;

  // 2) Tâches (project_tasks)
  const { data: tasksData } = await supabase
    .from("project_tasks")
    .select("id, title, status, due_date, priority, source, created_at")
    .eq("user_id", userId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const tasks = (tasksData ?? []) as AnyRecord[];

  const now = new Date();
  const today0 = startOfDay(now);
  const today1 = new Date(today0.getTime() + 24 * 60 * 60 * 1000);
  const week1 = new Date(today0.getTime() + 7 * 24 * 60 * 60 * 1000);

  const tasksDone = tasks.filter((t) => isDone(t.status));
  const tasksOpen = tasks.filter((t) => !isDone(t.status));

  const tasksToday = tasksOpen.filter((t) => {
    const due = parseDueDate(t);
    if (!due) return false;
    return due >= today0 && due < today1;
  });

  const tasksWeek = tasksOpen.filter((t) => {
    const due = parseDueDate(t);
    if (!due) return false;
    return due >= today0 && due < week1;
  });

  const doneRate =
    tasks.length === 0 ? 0 : Math.round((tasksDone.length / tasks.length) * 100);

  // 3) Next action (simple)
  const nextAction =
    tasksToday[0]?.title ||
    tasksWeek[0]?.title ||
    tasksOpen[0]?.title ||
    "Créer un contenu pour attirer des clients";

  const nextTask = (tasksToday[0] || tasksWeek[0] || tasksOpen[0]) as AnyRecord | undefined;
  const nextTaskId = typeof nextTask?.id === "string" ? (nextTask.id as string) : null;
  const nextTaskStatus = typeof nextTask?.status === "string" ? (nextTask.status as string) : null;

  const planProgress = Math.min(
    100,
    Math.max(
      0,
      toNumber((planJson as AnyRecord)?.progress, 35),
    ),
  );

  // 4) Contenus à venir (content_item) - fallback FR/EN
  const { data: contentRows } = await supabase
    .from("content_item")
    .select("id, title, titre, type, status, scheduled_date, date_planifiee, channel, created_at")
    .eq("user_id", userId)
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .limit(8);

  const upcoming = (contentRows ?? [])
    .map((r) => normalizeContentRowV2(r as AnyRecord))
    .map((r) => ({ ...r, _d: parseScheduledDate(r) }))
    .filter((r) => !!r._d)
    .sort((a, b) => (a._d!.getTime() - b._d!.getTime()))
    .slice(0, 5);

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Aujourd’hui</h1>
            <p className="text-sm text-muted-foreground">
              Concentre-toi sur une action claire, puis exécute.
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/analytics">Analytics détaillés</Link>
          </Button>
        </div>

        {/* Top grid */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs text-muted-foreground">Prochaine action</p>
            <p className="mt-1 text-base font-semibold">{nextAction as string}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="secondary">{tasksToday.length} aujourd’hui</Badge>
              <Badge variant="secondary">{tasksWeek.length} cette semaine</Badge>
              <Badge variant="secondary">{tasksDone.length} terminées</Badge>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <MarkTaskDoneButton taskId={nextTaskId} initialStatus={nextTaskStatus} />
              <Button asChild variant="secondary" size="sm">
                <Link href="/create">Créer en 1 clic</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/strategy">Voir la stratégie</Link>
              </Button>
            </div>

            <ExecutionFeedback />
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Progression</p>
                <p className="mt-1 text-base font-semibold">
                  Plan stratégique
                </p>
              </div>
              <Badge variant="secondary">{planProgress}%</Badge>
            </div>
            <div className="mt-4">
              <Progress value={planProgress} />
              <p className="mt-2 text-sm text-muted-foreground">
                Continue à exécuter pour faire monter le score.
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Taux de complétion</p>
                <p className="mt-1 text-base font-semibold">{doneRate}%</p>
              </div>
              <Badge variant="secondary">
                {tasksDone.length}/{tasks.length}
              </Badge>
            </div>
            <div className="mt-4">
              <Progress value={doneRate} />
              <div className="mt-3 flex gap-2">
                <Button asChild size="sm">
                  <Link href="/tasks">Voir mes tâches</Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link href="/create">Créer</Link>
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Tasks of the day */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Tâches du jour</h2>
                <p className="text-sm text-muted-foreground">
                  Ce qui doit être fait aujourd’hui
                </p>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link href="/tasks">Tout voir</Link>
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {tasksToday.length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Rien de planifié aujourd’hui. Prends une tâche simple dans “Cette semaine”
                  ou crée une action manuelle.
                </div>
              ) : (
                tasksToday.slice(0, 6).map((t) => (
                  <div
                    key={String(t.id)}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{t.title ?? "Tâche"}</p>
                      <p className="text-xs text-muted-foreground">
                        Échéance :{" "}
                        {parseDueDate(t) ? humanizeRelativeDate(parseDueDate(t)!) : "—"}
                      </p>
                    </div>
                    <Badge variant="secondary">{t.priority ?? "—"}</Badge>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Upcoming */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">À venir</h2>
                <p className="text-sm text-muted-foreground">
                  Tâches + contenus planifiés
                </p>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link href="/contents">Tout voir</Link>
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {upcoming.length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Aucun contenu planifié. Crée un contenu et programme-le.
                </div>
              ) : (
                upcoming.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-start justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {c.title ?? "Contenu"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {humanizeContentType(c.type)} •{" "}
                        {c._d ? humanizeRelativeDate(c._d) : "—"}
                        {c.channel ? ` • ${c.channel}` : ""}
                      </p>
                    </div>
                    <Badge variant="secondary">{c.status ?? "—"}</Badge>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <Button asChild size="sm">
                <Link href="/create">Créer</Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link href="/strategy">Stratégie</Link>
              </Button>
            </div>
          </Card>
        </div>

        {/* Quick actions */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-5">
            <p className="text-sm font-semibold">Actions rapides</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Gagne du temps avec des raccourcis.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href="/create/post">Créer un post</Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link href="/create/email">Créer un email</Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link href="/create/blog">Créer un article</Link>
              </Button>
            </div>
          </Card>

          <Card className="p-5 md:col-span-2">
            <p className="text-sm font-semibold">Conseil Tipote</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Une seule priorité claire par jour = progression réelle.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/tasks">Planifier ma semaine</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/contents">Voir mes contenus</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/settings">Paramètres</Link>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
