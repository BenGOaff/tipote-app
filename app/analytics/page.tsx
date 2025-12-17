// app/analytics/page.tsx
// Analytics : KPIs basés sur content_item (sans nouvelle table)
// - Protégé auth Supabase
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
  FolderOpen,
  Sparkles,
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
  const now = new Date();
  const d = new Date(now);
  d.setDate(now.getDate() - n);
  return startOfDay(d);
}

function normalizeStatus(v: string | null | undefined) {
  return String(v ?? "").trim().toLowerCase();
}

function isPublished(status: string | null | undefined) {
  return normalizeStatus(status) === "published";
}

function isPlanned(
  status: string | null | undefined,
  scheduled: string | null | undefined,
) {
  const s = normalizeStatus(status);
  return s === "planned" || Boolean(scheduled);
}

function isDraft(
  status: string | null | undefined,
  scheduled: string | null | undefined,
) {
  const s = normalizeStatus(status);
  return s === "draft" || (s === "" && !scheduled);
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function formatPct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function groupCount(rows: ContentRow[], keyFn: (r: ContentRow) => string) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = keyFn(r);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function safeTitle(r: ContentRow) {
  return r.title?.trim() || "Sans titre";
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

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "";

  const periodRaw = String(searchParams?.period ?? "30");
  const periodDays = periodRaw === "7" ? 7 : periodRaw === "90" ? 90 : 30;

  // On prend un échantillon raisonnable (les 800 derniers) pour calculer des KPIs rapides
  const { data, error } = await supabase
    .from("content_item")
    .select("id, title, type, status, channel, scheduled_date, created_at")
    .order("created_at", { ascending: false })
    .limit(800);

  const rows: ContentRow[] = Array.isArray(data) ? (data as ContentRow[]) : [];

  const sincePeriod = daysAgo(periodDays).getTime();
  const sincePrev = daysAgo(periodDays * 2).getTime();

  const inPeriod = rows.filter((r) => {
    const ts = r.created_at ? new Date(r.created_at).getTime() : 0;
    return ts >= sincePeriod;
  });

  const inPrev = rows.filter((r) => {
    const ts = r.created_at ? new Date(r.created_at).getTime() : 0;
    return ts < sincePeriod && ts >= sincePrev;
  });

  const totalPeriod = inPeriod.length;
  const publishedPeriod = inPeriod.filter((r) => isPublished(r.status)).length;
  const plannedPeriod = inPeriod.filter((r) =>
    isPlanned(r.status, r.scheduled_date),
  ).length;
  const draftsPeriod = inPeriod.filter((r) =>
    isDraft(r.status, r.scheduled_date),
  ).length;

  const totalPrev = inPrev.length;
  const publishedPrev = inPrev.filter((r) => isPublished(r.status)).length;
  const plannedPrev = inPrev.filter((r) =>
    isPlanned(r.status, r.scheduled_date),
  ).length;

  const completion = totalPeriod > 0 ? clamp01(publishedPeriod / totalPeriod) : 0;
  const completionPrev =
    totalPrev > 0 ? clamp01(publishedPrev / totalPrev) : 0;

  function changeBadge(current: number, prev: number) {
    const delta = current - prev;
    const isUp = delta >= 0;
    const value =
      prev === 0 ? (current === 0 ? 0 : 100) : Math.round((delta / prev) * 100);
    return { isUp, text: `${isUp ? "+" : ""}${value}%` };
  }

  const m1 = changeBadge(publishedPeriod, publishedPrev);
  const m2 = changeBadge(plannedPeriod, plannedPrev);
  const m3 = changeBadge(
    Math.round(completion * 100),
    Math.round(completionPrev * 100),
  );
  const m4 = changeBadge(totalPeriod, totalPrev);

  const metrics = [
    {
      key: "published",
      icon: CheckCircle2,
      label: "Contenus publiés",
      value: String(publishedPeriod),
      change: m1.text,
      up: m1.isUp,
    },
    {
      key: "planned",
      icon: Calendar,
      label: "Contenus planifiés",
      value: String(plannedPeriod),
      change: m2.text,
      up: m2.isUp,
    },
    {
      key: "completion",
      icon: TrendingUp,
      label: "Taux de complétion",
      value: formatPct(completion),
      change: m3.text,
      up: m3.isUp,
    },
    {
      key: "total",
      icon: FileText,
      label: "Créations sur la période",
      value: String(totalPeriod),
      change: m4.text,
      up: m4.isUp,
    },
  ];

  const byType = groupCount(inPeriod, (r) =>
    r.type?.trim() ? r.type!.trim() : "Autre",
  );
  const byChannel = groupCount(inPeriod, (r) =>
    r.channel?.trim() ? r.channel!.trim() : "—",
  );

  const topContents = inPeriod
    .filter((r) => r.id)
    .slice(0, 8)
    .map((r) => ({
      id: r.id,
      title: safeTitle(r),
      type: r.type ?? "—",
      status: r.status ?? "—",
    }));

  return (
    <AppShell userEmail={userEmail}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-display font-bold">Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Période : {periodDays} jours • Basé sur vos contenus
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border bg-background p-1">
              <Link
                href="/analytics?period=7"
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  periodDays === 7 ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                7 jours
              </Link>
              <Link
                href="/analytics?period=30"
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  periodDays === 30 ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                30 jours
              </Link>
              <Link
                href="/analytics?period=90"
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  periodDays === 90 ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                90 jours
              </Link>
            </div>

            <Button asChild variant="outline">
              <a
                href={`/api/analytics/export?period=${periodDays}`}
                target="_blank"
                rel="noreferrer"
              >
                Exporter le rapport
              </a>
            </Button>

            <Button asChild>
              <Link href="/create">
                <Sparkles className="mr-2 h-4 w-4" />
                Créer
              </Link>
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-semibold text-rose-800">Erreur</p>
            <p className="mt-1 text-sm text-rose-800">{error.message}</p>
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {metrics.map((m) => (
            <Card key={m.key} className="p-6">
              <div className="mb-4 flex items-start justify-between">
                <div className="rounded-xl bg-primary/10 p-3">
                  <m.icon className="h-6 w-6 text-primary" />
                </div>
                <Badge
                  variant={m.up ? "default" : "secondary"}
                  className="flex items-center gap-1"
                >
                  {m.up ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {m.change}
                </Badge>
              </div>
              <p className="mb-1 text-sm text-muted-foreground">{m.label}</p>
              <p className="text-3xl font-bold">{m.value}</p>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full max-w-xl grid-cols-4">
            <TabsTrigger value="overview">Aperçu</TabsTrigger>
            <TabsTrigger value="channels">Canaux</TabsTrigger>
            <TabsTrigger value="types">Types</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card className="p-6">
              <h2 className="mb-2 text-lg font-semibold">Aperçu</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Indicateurs calculés sur la période sélectionnée (sans tracking
                externe).
              </p>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-muted-foreground">Brouillons</p>
                  <p className="mt-1 text-2xl font-semibold">{draftsPeriod}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-muted-foreground">Planifiés</p>
                  <p className="mt-1 text-2xl font-semibold">{plannedPeriod}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-muted-foreground">Publiés</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {publishedPeriod}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold">
                Top contenus (récents)
              </h2>

              {topContents.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Aucun contenu sur la période.
                </div>
              ) : (
                <div className="space-y-3">
                  {topContents.map((c) => (
                    <Link
                      key={c.id}
                      href={`/contents/${c.id}`}
                      className="block rounded-xl border p-4 transition hover:bg-muted/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{c.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {c.type} • {c.status}
                          </p>
                        </div>
                        <ArrowUpRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="channels" className="space-y-6">
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold">Sources (canaux)</h2>

              {byChannel.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Aucun contenu sur la période.
                </div>
              ) : (
                <div className="space-y-3">
                  {byChannel.slice(0, 10).map((it) => (
                    <div
                      key={it.key}
                      className="flex items-center justify-between rounded-xl border px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                          <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{it.key}</p>
                          <p className="text-xs text-muted-foreground">
                            {it.count} contenu(s)
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">{it.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="types" className="space-y-6">
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold">
                Répartition par type
              </h2>

              {byType.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Aucun contenu sur la période.
                </div>
              ) : (
                <div className="space-y-3">
                  {byType.slice(0, 10).map((it) => (
                    <div
                      key={it.key}
                      className="flex items-center justify-between rounded-xl border px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{it.key}</p>
                          <p className="text-xs text-muted-foreground">
                            {it.count} contenu(s)
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">{it.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="actions" className="space-y-6">
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold">Accès rapides</h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <Button
                  asChild
                  variant="outline"
                  className="h-auto justify-between p-4"
                >
                  <Link href="/contents">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                        <FolderOpen className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">Mes contenus</p>
                        <p className="text-sm text-muted-foreground">
                          Organiser & planifier
                        </p>
                      </div>
                    </div>
                    <ArrowUpRight className="h-5 w-5 text-muted-foreground" />
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  className="h-auto justify-between p-4"
                >
                  <Link href="/create">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                        <Sparkles className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">Créer</p>
                        <p className="text-sm text-muted-foreground">
                          Générer du contenu
                        </p>
                      </div>
                    </div>
                    <ArrowUpRight className="h-5 w-5 text-muted-foreground" />
                  </Link>
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
