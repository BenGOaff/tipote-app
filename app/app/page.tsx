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

type AnyRecord = Record<string, unknown>;

function toNumber(v: unknown, fallback = 0): number {
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

export default async function TodayDashboard() {
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
    console.error("[app/app] Error loading plan", planError);
  }

  if (!planRow?.id) {
    redirect("/onboarding");
  }

  const planJson = (planRow.plan_json ?? {}) as AnyRecord;

  // 2) Charger les tâches (project_tasks)
  const { data: rawTasks, error: tasksError } = await supabase
    .from("project_tasks")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (tasksError) {
    console.error("[app/app] Error loading tasks", tasksError);
  }

  const tasks = (rawTasks ?? []) as AnyRecord[];

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

  const tasksOpen = tasks.filter((t) => !isDone(t.status));
  const tasksDone = tasks.filter((t) => isDone(t.status));
  const tasksToday = tasksOpen.filter((t) => {
    const due = parseDueDate(t);
    return due && due >= todayStart && due < tomorrowStart;
  });
  const tasksWeek = tasksOpen.filter((t) => {
    const due = parseDueDate(t);
    return due && due >= todayStart && due < weekEnd;
  });

  const doneRate =
    tasks.length === 0 ? 0 : Math.round((tasksDone.length / tasks.length) * 100);

  // 3) Next action (simple)
  const nextAction =
    tasksToday[0]?.title ||
    tasksWeek[0]?.title ||
    tasksOpen[0]?.title ||
    "Tout est à jour 🎉";

  // 4) Statistiques (fallback propre)
  const audienceSize = toNumber((planJson as AnyRecord).audience_size, 0);
  const emailListSize = toNumber((planJson as AnyRecord).email_list_size, 0);

  return (
    <AppShell userEmail={userEmail}>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Aujourd’hui</h1>
            <p className="text-sm text-muted-foreground">{userEmail}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/strategy">
              <Button variant="outline">Ma stratégie</Button>
            </Link>
            <Link href="/create">
              <Button>Créer du contenu</Button>
            </Link>
          </div>
        </div>

        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Prochaine action</p>
          <p className="mt-1 text-base font-semibold">{nextAction as string}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="secondary">{tasksToday.length} aujourd’hui</Badge>
            <Badge variant="secondary">{tasksWeek.length} cette semaine</Badge>
            <Badge variant="secondary">{tasksDone.length} terminées</Badge>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">À faire</p>
            <p className="mt-1 text-2xl font-bold">{tasksOpen.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Terminées</p>
            <p className="mt-1 text-2xl font-bold">{tasksDone.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Audience</p>
            <p className="mt-1 text-2xl font-bold">{audienceSize || "—"}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Emails</p>
            <p className="mt-1 text-2xl font-bold">{emailListSize || "—"}</p>
          </Card>
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Progression</h2>
              <p className="text-sm text-muted-foreground">
                Tâches terminées : {doneRate}%
              </p>
            </div>
            <Link href="/tasks">
              <Button variant="outline">Voir les tâches</Button>
            </Link>
          </div>

          <div className="mt-4">
            <Progress value={doneRate} />
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Aujourd’hui</h2>
                <p className="text-sm text-muted-foreground">Tes actions du jour</p>
              </div>
              <Link href="/tasks">
                <Button variant="outline">Tout voir</Button>
              </Link>
            </div>

            <div className="mt-4 space-y-2">
              {tasksToday.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Rien de prévu aujourd’hui. Tu peux avancer sur tes tâches “à venir”.
                </p>
              ) : (
                tasksToday.slice(0, 5).map((t) => (
                  <div
                    key={String(t.id)}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {String(t.title ?? "Sans titre")}
                      </p>
                      <p className="text-xs text-muted-foreground">À faire</p>
                    </div>
                    <Link href="/tasks">
                      <Button size="sm" variant="outline">
                        Ouvrir
                      </Button>
                    </Link>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">À venir</h2>
                <p className="text-sm text-muted-foreground">
                  Les prochaines tâches
                </p>
              </div>
              <Link href="/tasks">
                <Button variant="outline">Tout voir</Button>
              </Link>
            </div>

            <div className="mt-4 space-y-2">
              {tasksWeek.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune tâche planifiée cette semaine.
                </p>
              ) : (
                tasksWeek.slice(0, 5).map((t) => (
                  <div
                    key={String(t.id)}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {String(t.title ?? "Sans titre")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Échéance : {String(t.due_date ?? "—")}
                      </p>
                    </div>
                    <Link href="/tasks">
                      <Button size="sm" variant="outline">
                        Ouvrir
                      </Button>
                    </Link>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
