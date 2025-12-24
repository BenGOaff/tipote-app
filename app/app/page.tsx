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
  return {
    id: String(raw["id"]),
    title: (raw["title"] as string | null) ?? null,
    type: (raw["type"] as string | null) ?? null,
    status: (raw["status"] as string | null) ?? null,
    scheduledDate: (raw["scheduled_date"] as string | null) ?? null,
    channel: (raw["channel"] as string | null) ?? null,
  };
}

function normalizeContentRowFR(raw: AnyRecord): ContentUpcomingItem {
  return {
    id: String(raw["id"]),
    title: (raw["titre"] as string | null) ?? null,
    type: (raw["type_contenu"] as string | null) ?? null,
    status: (raw["statut"] as string | null) ?? null,
    scheduledDate: (raw["date_planifiee"] as string | null) ?? null,
    channel: (raw["canal"] as string | null) ?? null,
  };
}

async function loadUpcomingContents(args: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  userId: string;
}): Promise<ContentUpcomingItem[]> {
  const { supabase, userId } = args;

  const v2 = await supabase
    .from("content_item")
    .select("id,title,type,status,scheduled_date,channel")
    .eq("user_id", userId)
    .not("scheduled_date", "is", null)
    .order("scheduled_date", { ascending: true })
    .limit(25);

  if (!v2.error) {
    return (v2.data ?? []).map((r) => normalizeContentRowV2(r as AnyRecord));
  }

  const fr = await supabase
    .from("content_item")
    .select("id,titre,type_contenu,statut,date_planifiee,canal")
    .eq("user_id", userId)
    .not("date_planifiee", "is", null)
    .order("date_planifiee", { ascending: true })
    .limit(25);

  if (fr.error) {
    console.error("[app/app] Error loading upcoming contents", v2.error, fr.error);
    return [];
  }

  return (fr.data ?? []).map((r) => normalizeContentRowFR(r as AnyRecord));
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

  // 2b) Charger les contenus planifiés (content_item) — compat FR/EN
  const allUpcomingContents = await loadUpcomingContents({
    supabase,
    userId: session.user.id,
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

  const contentsWeek = allUpcomingContents
    .map((c) => ({ c, dt: parseScheduledDate(c) }))
    .filter((x) => x.dt && x.dt >= todayStart && x.dt < weekEnd)
    .map((x) => x.c)
    .slice(0, 5);

  const doneRate =
    tasks.length === 0 ? 0 : Math.round((tasksDone.length / tasks.length) * 100);

  // 3) Next action (simple)
  const nextAction =
    tasksToday[0]?.title ||
    tasksWeek[0]?.title ||
    tasksOpen[0]?.title ||
    "Créer un contenu pour attirer des clients";

  const planProgress = Math.min(
    100,
    Math.max(
      0,
      toNumber((planJson as AnyRecord)?.progress, 35),
    ),
  );

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Aujourd’hui</p>
            <h1 className="text-2xl font-bold">Hello 👋</h1>
            <p className="text-sm text-muted-foreground">
              On avance sur ton business, une étape à la fois.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/strategy">
              <Button variant="outline">Voir stratégie</Button>
            </Link>
            <Link href="/create">
              <Button className="bg-[#b042b4] hover:opacity-95">Créer du contenu</Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <p className="text-xs text-muted-foreground">Prochaine action</p>
            <p className="mt-1 text-base font-semibold">{nextAction as string}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="secondary">{tasksToday.length} aujourd’hui</Badge>
              <Badge variant="secondary">{tasksWeek.length} cette semaine</Badge>
              <Badge variant="secondary">{tasksDone.length} terminées</Badge>
            </div>
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
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Tâches du jour</h2>
                <p className="text-sm text-muted-foreground">
                  Ce qui doit être fait aujourd’hui
                </p>
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
                  Les prochaines tâches et contenus planifiés
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/contents">
                  <Button variant="outline">Contenus</Button>
                </Link>
                <Link href="/tasks">
                  <Button variant="outline">Tâches</Button>
                </Link>
              </div>
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

            <div className="mt-5 border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Contenus planifiés</p>
                  <p className="text-xs text-muted-foreground">
                    Ce qui est prévu à publier (7 prochains jours)
                  </p>
                </div>
                <Link href="/contents">
                  <Button size="sm" variant="outline">
                    Ouvrir
                  </Button>
                </Link>
              </div>

              <div className="mt-3 space-y-2">
                {contentsWeek.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun contenu planifié cette semaine.
                  </p>
                ) : (
                  contentsWeek.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {String(c.title ?? "Sans titre")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {String(c.type ?? "contenu")} • {String(c.scheduledDate ?? "—")}
                        </p>
                      </div>
                      <Link href={`/contents/${c.id}`}>
                        <Button size="sm" variant="outline">
                          Voir
                        </Button>
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
