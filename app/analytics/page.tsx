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
  FolderOpen,
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

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function formatPct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function safeTitle(r: ContentRow) {
  return r.title?.trim() || "Sans titre";
}

function csvPeriod(p: string | null) {
  return p === "7" ? 7 : p === "90" ? 90 : 30;
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
  const periodDays = csvPeriod(String(searchParams?.period ?? "30"));

  // KPI rapide : on calcule sur les 800 derniers contenus
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
  const totalPrev = inPrev.length;

  const publishedPeriod = inPeriod.filter((r) => isPublished(r.status)).length;
  const publishedPrev = inPrev.filter((r) => isPublished(r.status)).length;

  const plannedPeriod = inPeriod.filter((r) =>
    isPlanned(r.status, r.scheduled_date),
  ).length;
  const plannedPrev = inPrev.filter((r) =>
    isPlanned(r.status, r.scheduled_date),
  ).length;

  const completion = totalPeriod > 0 ? clamp01(publishedPeriod / totalPeriod) : 0;
  const completionPrev =
    totalPrev > 0 ? clamp01(publishedPrev / totalPrev) : 0;

  function changeBadge(current: number, prev: number) {
    const delta = current - prev;
    const up = delta >= 0;
    const value =
      prev === 0 ? (current === 0 ? 0 : 100) : Math.round((delta / prev) * 100);
    return { up, text: `${up ? "+" : ""}${value}%` };
  }

  const mPublished = changeBadge(publishedPeriod, publishedPrev);
  const mPlanned = changeBadge(plannedPeriod, plannedPrev);
  const mCompletion = changeBadge(
    Math.round(completion * 100),
    Math.round(completionPrev * 100),
  );
  const mTotal = changeBadge(totalPeriod, totalPrev);

  const metrics = [
    {
      label: "Contenus publiés",
      value: String(publishedPeriod),
      change: mPublished.text,
      trend: mPublished.up ? "up" : "down",
      icon: CheckCircle2,
    },
    {
      label: "Contenus planifiés",
      value: String(plannedPeriod),
      change: mPlanned.text,
      trend: mPlanned.up ? "up" : "down",
      icon: Calendar,
    },
    {
      label: "Taux de complétion",
      value: formatPct(completion),
      change: mCompletion.text,
      trend: mCompletion.up ? "up" : "down",
      icon: TrendingUp,
    },
    {
      label: "Créations sur la période",
      value: String(totalPeriod),
      change: mTotal.text,
      trend: mTotal.up ? "up" : "down",
      icon: FileText,
    },
  ] as const;

  // Mini chart 14 jours (créations / jour)
  const days = 14;
  const dayBuckets: number[] = Array.from({ length: days }, () => 0);
  const dayStart = daysAgo(days - 1).getTime();
  for (const r of rows) {
    const ts = r.created_at ? new Date(r.created_at).getTime() : 0;
    if (ts < dayStart) continue;
    const idx = Math.floor(
      (startOfDay(new Date(ts)).getTime() - dayStart) / (24 * 60 * 60 * 1000),
    );
    if (idx >= 0 && idx < days) dayBuckets[idx] += 1;
  }
  const maxBucket = Math.max(1, ...dayBuckets);
  const heights = dayBuckets.map((v) => Math.round((v / maxBucket) * 100));

  // Channels + Types
  const byChannelMap = new Map<string, number>();
  const byTypeMap = new Map<string, number>();
  for (const r of inPeriod) {
    const ch = r.channel?.trim() ? r.channel!.trim() : "—";
    byChannelMap.set(ch, (byChannelMap.get(ch) ?? 0) + 1);

    const t = r.type?.trim() ? r.type!.trim() : "Autre";
    byTypeMap.set(t, (byTypeMap.get(t) ?? 0) + 1);
  }

  const byChannel = Array.from(byChannelMap.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const byType = Array.from(byTypeMap.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const topContents = inPeriod.slice(0, 5).map((r) => ({
    id: r.id,
    title: safeTitle(r),
    type: r.type ?? "—",
    status: r.status ?? "—",
  }));

  const periodButtons = [
    { days: 7, label: "7 jours" },
    { days: 30, label: "30 jours" },
    { days: 90, label: "90 jours" },
  ];

  return (
    <AppShell
      userEmail={userEmail}
      headerTitle="Analytics"
      headerRight={
        <Button asChild variant="outline">
          <a
            href={`/api/analytics/export?period=${periodDays}`}
            target="_blank"
            rel="noreferrer"
          >
            Exporter le rapport
          </a>
        </Button>
      }
      contentClassName="flex-1 p-0"
    >
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Period Selector */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold">Vos performances</h2>
            <p className="text-muted-foreground">
              Suivez et optimisez vos résultats
            </p>
          </div>

          <div className="flex gap-2">
            {periodButtons.map((p) => {
              const active = periodDays === p.days;
              return (
                <Button
                  key={p.days}
                  asChild
                  variant={active ? "default" : "outline"}
                  size="sm"
                >
                  <Link href={`/analytics?period=${p.days}`}>{p.label}</Link>
                </Button>
              );
            })}
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-semibold text-rose-800">Erreur</p>
            <p className="mt-1 text-sm text-rose-800">{error.message}</p>
          </div>
        ) : null}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            const up = metric.trend === "up";
            return (
              <Card key={metric.label} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-xl bg-primary/10">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <Badge
                    variant={up ? "default" : "secondary"}
                    className="flex items-center gap-1"
                  >
                    {up ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {metric.change}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-1">
                  {metric.label}
                </p>
                <p className="text-3xl font-bold">{metric.value}</p>
              </Card>
            );
          })}
        </div>

        {/* Charts Section */}
        <Tabs defaultValue="engagement" className="w-full">
          <TabsList>
            <TabsTrigger value="engagement">Engagement</TabsTrigger>
            <TabsTrigger value="traffic">Trafic</TabsTrigger>
            <TabsTrigger value="conversions">Conversions</TabsTrigger>
            <TabsTrigger value="social">Réseaux sociaux</TabsTrigger>
          </TabsList>

          <TabsContent value="engagement" className="space-y-6 mt-6">
            <Card className="p-6">
              <h3 className="text-lg font-bold mb-6">
                Créations au fil du temps (14 jours)
              </h3>
              <div className="h-64 flex items-end justify-between gap-2">
                {heights.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-gradient-to-t from-primary/30 to-primary/70 rounded-t-lg hover:opacity-80 transition-opacity cursor-pointer"
                    style={{ height: `${Math.max(6, h)}%` }}
                    title={`${dayBuckets[i]} création(s)`}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                <span>J-13</span>
                <span>J-10</span>
                <span>J-7</span>
                <span>J-4</span>
                <span>Aujourd’hui</span>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">Contenus récents</h3>
                <Button asChild variant="outline" size="sm">
                  <Link href="/contents">
                    Voir tout <ArrowUpRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>

              <div className="space-y-3">
                {topContents.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Aucun contenu sur la période.
                  </div>
                ) : (
                  topContents.map((c) => (
                    <Link
                      key={c.id}
                      href={`/contents/${c.id}`}
                      className="flex items-center justify-between p-4 rounded-xl border border-border bg-background/60 hover:bg-background transition"
                    >
                      <div>
                        <p className="font-medium">{c.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {c.type} • {c.status}
                        </p>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
                    </Link>
                  ))
                )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="traffic" className="space-y-6 mt-6">
            <Card className="p-6">
              <h3 className="text-lg font-bold mb-6">
                Répartition par canal
              </h3>

              {byChannel.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Aucun contenu sur la période.
                </div>
              ) : (
                <div className="space-y-4">
                  {byChannel.map((it) => {
                    const pct =
                      totalPeriod > 0
                        ? Math.round((it.count / totalPeriod) * 100)
                        : 0;
                    return (
                      <div key={it.source}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{it.source}</span>
                          <span className="text-sm text-muted-foreground">
                            {pct}% • {it.count}
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="conversions" className="space-y-6 mt-6">
            <Card className="p-6">
              <h3 className="text-lg font-bold mb-6">Répartition par type</h3>

              {byType.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Aucun contenu sur la période.
                </div>
              ) : (
                <div className="space-y-4">
                  {byType.map((it) => {
                    const pct =
                      totalPeriod > 0
                        ? Math.round((it.count / totalPeriod) * 100)
                        : 0;
                    return (
                      <div key={it.source}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{it.source}</span>
                          <span className="text-sm text-muted-foreground">
                            {pct}% • {it.count}
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="social" className="space-y-6 mt-6">
            <Card className="p-6">
              <h3 className="text-lg font-bold mb-6">Actions recommandées</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link
                  href="/create"
                  className="p-4 rounded-xl border border-border bg-background hover:bg-background/80 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Créer du contenu</p>
                        <p className="text-sm text-muted-foreground">
                          Augmenter votre régularité
                        </p>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>

                <Link
                  href="/contents"
                  className="p-4 rounded-xl border border-border bg-background hover:bg-background/80 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <FolderOpen className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Planifier</p>
                        <p className="text-sm text-muted-foreground">
                          Transformer les brouillons en publis
                        </p>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
