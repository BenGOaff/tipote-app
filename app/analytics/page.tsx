// app/analytics/page.tsx
// Pixel-perfect (Lovable) : reprend la structure du design (src/pages/Analytics.tsx)
// Analytics V1 : KPIs calculés à partir de content_item (pas de tracking externe)
// - Auth Supabase obligatoire
// - Période via searchParams (?period=7|30|90)
// - Export CSV via /api/analytics/export

import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  TrendingUp,
  TrendingDown,
  FileText,
  Calendar,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";

type ContentRow = {
  id: string;
  title: string | null;
  type: string | null;
  status: string | null;
  channel: string | null;
  scheduled_date: string | null;
  created_at: string | null;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function csvPeriod(p: string) {
  if (p === "7") return 7;
  if (p === "90") return 90;
  return 30;
}

function pctDelta(curr: number, prev: number) {
  if (prev <= 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

function safeString(v: unknown) {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function formatDateShort(d: Date) {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function labelType(t: string | null) {
  const x = (t ?? "").toLowerCase();
  if (x === "post") return "Post";
  if (x === "email") return "Email";
  if (x === "blog") return "Blog";
  if (x === "video_script") return "Script vidéo";
  if (x === "funnel") return "Funnel";
  return t || "—";
}

function labelStatus(s: string | null) {
  const x = (s ?? "").toLowerCase();
  if (x === "published" || x === "publie" || x === "publié") return "Publié";
  if (x === "scheduled" || x === "planifie" || x === "planifié")
    return "Planifié";
  if (x === "draft" || x === "brouillon") return "Brouillon";
  return s || "—";
}

function statusBadgeVariant(s: string | null) {
  const x = (s ?? "").toLowerCase();
  if (x === "published" || x === "publie" || x === "publié") return "default";
  if (x === "scheduled" || x === "planifie" || x === "planifié")
    return "secondary";
  return "outline";
}

function trendIcon(delta: number) {
  if (delta >= 0) return <TrendingUp className="h-4 w-4" />;
  return <TrendingDown className="h-4 w-4" />;
}

function trendColor(delta: number) {
  if (delta >= 0) return "text-emerald-600";
  return "text-rose-600";
}

function toTime(d: Date) {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseDateMaybe(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: { period?: string };
}) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/");

  const userEmail = session.user.email ?? "";
  const periodDays = csvPeriod(String(searchParams?.period ?? "30"));

  // KPI rapide : on calcule sur les 800 derniers contenus (scope user)
  const v2 = await supabase
    .from("content_item")
    .select("id, title, type, status, channel, scheduled_date, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(800);

  let rows: ContentRow[] = [];

  if (!v2.error) {
    rows = Array.isArray(v2.data) ? (v2.data as ContentRow[]) : [];
  } else {
    // Fallback FR schema with aliasing (titre/statut/canal/date_planifiee)
    const fb = await supabase
      .from("content_item")
      .select(
        "id, title:titre, type, status:statut, channel:canal, scheduled_date:date_planifiee, created_at"
      )
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(800);

    rows = Array.isArray(fb.data) ? (fb.data as ContentRow[]) : [];
  }

  const sincePeriod = daysAgo(periodDays).getTime();
  const sincePrev = daysAgo(periodDays * 2).getTime();

  const inPeriod = rows.filter((r) => {
    const created = parseDateMaybe(r.created_at)?.getTime() ?? 0;
    return created >= sincePeriod;
  });

  const inPrev = rows.filter((r) => {
    const created = parseDateMaybe(r.created_at)?.getTime() ?? 0;
    return created >= sincePrev && created < sincePeriod;
  });

  const publishedNow = inPeriod.filter((r) => {
    const s = (r.status ?? "").toLowerCase();
    return s === "published" || s === "publie" || s === "publié";
  });

  const publishedPrev = inPrev.filter((r) => {
    const s = (r.status ?? "").toLowerCase();
    return s === "published" || s === "publie" || s === "publié";
  });

  const scheduledNow = inPeriod.filter((r) => {
    const s = (r.status ?? "").toLowerCase();
    return s === "scheduled" || s === "planifie" || s === "planifié";
  });

  const scheduledPrev = inPrev.filter((r) => {
    const s = (r.status ?? "").toLowerCase();
    return s === "scheduled" || s === "planifie" || s === "planifié";
  });

  const allNow = inPeriod.length;
  const allPrev = inPrev.length;

  const deltaPublished = pctDelta(publishedNow.length, publishedPrev.length);
  const deltaAll = pctDelta(allNow, allPrev);
  const deltaScheduled = pctDelta(scheduledNow.length, scheduledPrev.length);

  // prochaine échéance = contenu planifié le plus proche
  const nextScheduled = rows
    .map((r) => {
      const d = parseDateMaybe(r.scheduled_date);
      if (!d) return null;
      return { ...r, _d: d };
    })
    .filter(Boolean)
    .map((r) => r as ContentRow & { _d: Date })
    .filter((r) => r._d.getTime() >= Date.now())
    .sort((a, b) => a._d.getTime() - b._d.getTime())[0];

  // series semaine (7 jours) : contenus publiés / planifiés par jour
  const startWeek = startOfDay(daysAgo(6));
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(startWeek);
    d.setDate(startWeek.getDate() + i);
    return d;
  });

  const publishedByDay = days.map((d) => {
    const key = toIsoDate(d);
    return publishedNow.filter((r) => {
      const created = parseDateMaybe(r.created_at);
      if (!created) return false;
      return toIsoDate(created) === key;
    }).length;
  });

  const scheduledByDay = days.map((d) => {
    const key = toIsoDate(d);
    return scheduledNow.filter((r) => {
      const sched = parseDateMaybe(r.scheduled_date);
      if (!sched) return false;
      return toIsoDate(sched) === key;
    }).length;
  });

  // progression plan stratégique (V1 simple) : tasks complétées / total
  const { data: tasks } = await supabase
    .from("project_tasks")
    .select("id, status, due_date, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(400);

  const taskRows = Array.isArray(tasks) ? tasks : [];
  const tasksDone = taskRows.filter((t) => {
    const s = (t?.status ?? "").toLowerCase();
    return (
      s === "done" ||
      s === "completed" ||
      s === "termine" ||
      s === "terminé"
    );
  }).length;
  const tasksTotal = taskRows.length;
  const tasksPct =
    tasksTotal > 0
      ? clamp(Math.round((tasksDone / tasksTotal) * 100), 0, 100)
      : 0;

  return (
    <AppShell
      userEmail={userEmail}
      headerTitle="Analytics"
      headerRight={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a
              href={`/api/analytics/export?period=${periodDays}`}
              target="_blank"
              rel="noreferrer"
            >
              Export CSV
            </a>
          </Button>
          <Button asChild size="sm">
            <Link href="/create">Créer</Link>
          </Button>
        </div>
      }
      contentClassName="flex-1 p-0"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <Tabs defaultValue={String(periodDays)} className="mb-6">
          <TabsList>
            <TabsTrigger asChild value="7">
              <Link href="/analytics?period=7">7 jours</Link>
            </TabsTrigger>
            <TabsTrigger asChild value="30">
              <Link href="/analytics?period=30">30 jours</Link>
            </TabsTrigger>
            <TabsTrigger asChild value="90">
              <Link href="/analytics?period=90">90 jours</Link>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={String(periodDays)} className="mt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">Contenus publiés</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`flex items-center gap-1 ${trendColor(
                      deltaPublished
                    )}`}
                  >
                    {trendIcon(deltaPublished)}
                    {Math.abs(deltaPublished)}%
                  </Badge>
                </div>
                <div className="mt-3 text-3xl font-semibold">
                  {publishedNow.length}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  vs période précédente : {publishedPrev.length}
                </p>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Tâches complétées
                    </span>
                  </div>
                  <Badge variant="secondary">{tasksPct}%</Badge>
                </div>
                <div className="mt-3 text-3xl font-semibold">
                  {tasksDone}/{tasksTotal}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Progression globale (V1)
                </p>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Contenus planifiés
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`flex items-center gap-1 ${trendColor(
                      deltaScheduled
                    )}`}
                  >
                    {trendIcon(deltaScheduled)}
                    {Math.abs(deltaScheduled)}%
                  </Badge>
                </div>
                <div className="mt-3 text-3xl font-semibold">
                  {scheduledNow.length}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  vs période précédente : {scheduledPrev.length}
                </p>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">Total contenus</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`flex items-center gap-1 ${trendColor(deltaAll)}`}
                  >
                    {trendIcon(deltaAll)}
                    {Math.abs(deltaAll)}%
                  </Badge>
                </div>
                <div className="mt-3 text-3xl font-semibold">{allNow}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  vs période précédente : {allPrev}
                </p>
              </Card>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              <Card className="p-6 lg:col-span-2">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-semibold">Cette semaine</h2>
                  <Badge variant="secondary">
                    {formatDateShort(days[0])} → {formatDateShort(days[6])}
                  </Badge>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {days.map((d, idx) => (
                    <div key={toIsoDate(d)} className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">
                        {d.toLocaleDateString("fr-FR", { weekday: "short" })}
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {d.getDate()}
                      </div>

                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Publiés</span>
                          <span className="font-medium">
                            {publishedByDay[idx]}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Planifiés</span>
                          <span className="font-medium">
                            {scheduledByDay[idx]}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <Button asChild variant="secondary">
                    <Link href="/contents">Voir mes contenus</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/create">Créer un contenu</Link>
                  </Button>
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="text-base font-semibold">Prochaine échéance</h2>

                {nextScheduled ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {labelType(nextScheduled.type)}
                      </Badge>
                      <Badge variant="outline">
                        {safeString(nextScheduled.channel) || "—"}
                      </Badge>
                      <Badge variant={statusBadgeVariant(nextScheduled.status)}>
                        {labelStatus(nextScheduled.status)}
                      </Badge>
                    </div>

                    <div className="text-lg font-semibold leading-snug">
                      {safeString(nextScheduled.title) || "Sans titre"}
                    </div>

                    <div className="text-sm text-muted-foreground">
                      {nextScheduled._d.toLocaleDateString("fr-FR", {
                        weekday: "long",
                        day: "2-digit",
                        month: "long",
                      })}{" "}
                      à {toTime(nextScheduled._d)}
                    </div>

                    <div className="flex gap-2">
                      <Button asChild className="w-full">
                        <Link href={`/contents/${nextScheduled.id}`}>Ouvrir</Link>
                      </Button>
                      <Button asChild variant="secondary" className="w-full">
                        <Link href="/strategy">Voir stratégie</Link>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Aucun contenu planifié à venir sur la période.
                  </p>
                )}

                <div className="mt-8">
                  <h3 className="text-sm font-semibold">Raccourcis</h3>
                  <div className="mt-3 grid gap-2">
                    <Button
                      asChild
                      variant="outline"
                      className="justify-between"
                    >
                      <Link href="/create">
                        Créer
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="justify-between"
                    >
                      <Link href="/tasks">
                        Tâches
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="justify-between"
                    >
                      <Link href="/contents">
                        Mes contenus
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
