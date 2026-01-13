// components/analytics/AnalyticsLovableClient.tsx
"use client";

import Link from "next/link";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Mail,
  MousePointer,
  Eye,
  ArrowUpRight,
} from "lucide-react";

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function pct(n: number, d: number) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return Math.round((n / d) * 100);
}

function trendVariant(delta: number): "default" | "destructive" {
  return delta >= 0 ? "default" : "destructive";
}

function labelStatus(s?: string | null) {
  const v = (s || "").toLowerCase().trim();
  if (!v) return "—";
  if (v.includes("publish")) return "Publié";
  if (v.includes("sched")) return "Planifié";
  if (v.includes("draft")) return "Brouillon";
  return s || "—";
}

function labelType(t?: string | null) {
  const v = (t || "").toLowerCase().trim();
  if (!v) return "—";
  if (v === "post") return "Post";
  if (v === "email") return "Email";
  if (v === "article") return "Article";
  if (v === "video") return "Vidéo";
  if (v === "offer") return "Offre";
  if (v === "funnel") return "Funnel";
  return t || "—";
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AnalyticsLovableClient(props: {
  periodDays: number;
  kpis: {
    publishedNow: number;
    publishedPrev: number;
    scheduledNow: number;
    scheduledPrev: number;
    totalNow: number;
    totalPrev: number;
    tasksDone: number;
    tasksTotal: number;
    tasksPct: number;
    deltaPublished: number;
    deltaScheduled: number;
    deltaAll: number;
  };
  bars: number[];
  topContents: Array<{
    id: string;
    title: string;
    type: string;
    channel: string;
    status: string;
    scheduledAt?: string | null;
    createdAt?: string | null;
  }>;
  trafficSources: Array<{
    source: string;
    percentage: number;
    visitors: string;
    color?: string;
  }>;
  nextScheduled: {
    id: string;
    title: string;
    type: string;
    channel: string;
    status: string;
    scheduledAt: string;
  } | null;
}) {
  const { periodDays, kpis, bars, topContents, trafficSources, nextScheduled } = props;

  const metrics = [
    {
      label: "Contenus publiés",
      value: String(kpis.publishedNow),
      change: `${kpis.deltaPublished >= 0 ? "+" : ""}${kpis.deltaPublished}%`,
      delta: kpis.deltaPublished,
      icon: Mail,
      color: "text-primary",
    },
    {
      label: "Tâches complétées",
      value: `${kpis.tasksPct}%`,
      change: `${kpis.tasksDone}/${kpis.tasksTotal}`,
      delta: 0,
      icon: MousePointer,
      color: "text-success",
    },
    {
      label: "Contenus planifiés",
      value: String(kpis.scheduledNow),
      change: `${kpis.deltaScheduled >= 0 ? "+" : ""}${kpis.deltaScheduled}%`,
      delta: kpis.deltaScheduled,
      icon: Users,
      color: "text-secondary",
    },
    {
      label: "Total contenus",
      value: String(kpis.totalNow),
      change: `${kpis.deltaAll >= 0 ? "+" : ""}${kpis.deltaAll}%`,
      delta: kpis.deltaAll,
      icon: Eye,
      color: "text-primary",
    },
  ];

  const periodButtons: Array<{ days: number; label: string }> = [
    { days: 7, label: "7 jours" },
    { days: 30, label: "30 jours" },
    { days: 90, label: "90 jours" },
  ];

  const topChannel = trafficSources?.[0]?.source || "—";
  const publishRate = pct(kpis.publishedNow, Math.max(1, kpis.totalNow));
  const scheduledRate = pct(kpis.scheduledNow, Math.max(1, kpis.totalNow));

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30">
          <header className="h-16 border-b border-border flex items-center px-6 bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-4 flex-1">
              <h1 className="text-xl font-display font-bold">Analytics</h1>
            </div>
            <Button variant="outline" asChild>
              <Link href="/analytics?export=1">Exporter le rapport</Link>
            </Button>
          </header>

          <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* Period Selector */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-display font-bold">Vos performances</h2>
                <p className="text-muted-foreground">Suivez et optimisez vos résultats</p>
              </div>
              <div className="flex gap-2">
                {periodButtons.map((b) => (
                  <Button
                    key={b.days}
                    asChild
                    variant={periodDays === b.days ? "default" : "outline"}
                    size="sm"
                  >
                    <Link href={`/analytics?period=${b.days}`}>{b.label}</Link>
                  </Button>
                ))}
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {metrics.map((metric, i) => (
                <Card key={i} className="p-6 hover:shadow-md transition-all duration-200">
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className={`w-10 h-10 rounded-xl bg-muted flex items-center justify-center ${metric.color}`}
                    >
                      <metric.icon className="w-5 h-5" />
                    </div>
                    <Badge
                      variant={trendVariant(metric.delta)}
                      className="flex items-center gap-1"
                    >
                      {metric.delta >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {metric.change}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">{metric.label}</p>
                  <p className="text-3xl font-bold">{metric.value}</p>
                </Card>
              ))}
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
                  <h3 className="text-lg font-bold mb-6">Engagement au fil du temps</h3>
                  <div className="h-64 flex items-end justify-between gap-2">
                    {(bars.length ? bars : [65, 72, 68, 80, 75, 88, 82, 90, 85, 92, 88, 95, 90, 98]).map(
                      (height, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-gradient-to-t from-primary to-primary/50 rounded-t-lg hover:opacity-80 transition-opacity cursor-pointer"
                          style={{ height: `${clamp(height, 5, 100)}%` }}
                        />
                      )
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                    <span>Jan</span>
                    <span>Fév</span>
                    <span>Mar</span>
                    <span>Avr</span>
                  </div>
                </Card>

                <div className="grid md:grid-cols-2 gap-6">
                  <Card className="p-6">
                    <h3 className="text-lg font-bold mb-6">Top contenus</h3>
                    <div className="space-y-4">
                      {topContents.slice(0, 4).map((c) => (
                        <Link key={c.id} href={`/contents/${c.id}`} className="block">
                          <div className="flex items-start justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                            <div className="flex-1">
                              <p className="font-medium mb-1">{c.title}</p>
                              <p className="text-sm text-muted-foreground">
                                {c.channel} • {labelType(c.type)} • {labelStatus(c.status)}
                              </p>
                            </div>
                            <ArrowUpRight className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" />
                          </div>
                        </Link>
                      ))}
                      {!topContents.length && (
                        <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                          Pas encore de contenus sur la période.
                        </div>
                      )}
                    </div>
                  </Card>

                  <Card className="p-6">
                    <h3 className="text-lg font-bold mb-6">Sources de trafic</h3>
                    <div className="space-y-4">
                      {(trafficSources.length
                        ? trafficSources
                        : [
                            { source: "—", percentage: 100, visitors: "0", color: "bg-muted-foreground/30" },
                          ]
                      ).map((source, i) => (
                        <div key={`${source.source}-${i}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{source.source}</span>
                            <span className="text-sm text-muted-foreground">
                              {clamp(source.percentage, 0, 100)}% • {source.visitors}
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${source.color || "bg-primary"} rounded-full transition-all duration-500`}
                              style={{ width: `${clamp(source.percentage, 0, 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="traffic">
                <Card className="p-12 text-center">
                  <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Sur {periodDays} jours : {kpis.totalNow} contenus • canal principal : {topChannel}
                  </p>
                </Card>
              </TabsContent>

              <TabsContent value="conversions">
                <Card className="p-12 text-center">
                  <MousePointer className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Taux de publication : {publishRate}% • taux de planification : {scheduledRate}%
                  </p>
                </Card>
              </TabsContent>

              <TabsContent value="social">
                <Card className="p-12 text-center">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Répartition par canaux :{" "}
                    {(trafficSources.length ? trafficSources.slice(0, 3) : []).map((s, idx) => (
                      <span key={`${s.source}-${idx}`}>
                        {idx > 0 ? " • " : ""}
                        {s.source} {clamp(s.percentage, 0, 100)}%
                      </span>
                    ))}
                    {!trafficSources.length && "—"}
                  </p>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Goals Progress */}
            <Card className="p-6">
              <h3 className="text-lg font-bold mb-6">Progression des objectifs</h3>
              <div className="space-y-6">
                {[
                  {
                    label: "Objectif exécution (tâches)",
                    current: `${kpis.tasksDone}`,
                    target: `${kpis.tasksTotal}`,
                    progress: clamp(kpis.tasksPct, 0, 100),
                  },
                  {
                    label: "Objectif contenus publiés (période)",
                    current: `${kpis.publishedNow}`,
                    target: `${Math.max(kpis.publishedPrev, kpis.publishedNow, 1)}`,
                    progress: clamp(
                      pct(kpis.publishedNow, Math.max(1, Math.max(kpis.publishedPrev, kpis.publishedNow, 1))),
                      0,
                      100
                    ),
                  },
                  {
                    label: "Objectif contenus planifiés (période)",
                    current: `${kpis.scheduledNow}`,
                    target: `${Math.max(kpis.scheduledPrev, kpis.scheduledNow, 1)}`,
                    progress: clamp(
                      pct(kpis.scheduledNow, Math.max(1, Math.max(kpis.scheduledPrev, kpis.scheduledNow, 1))),
                      0,
                      100
                    ),
                  },
                ].map((goal, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{goal.label}</span>
                      <span className="text-sm text-muted-foreground">
                        {goal.current} / {goal.target}
                      </span>
                    </div>
                    <div className="relative">
                      <div className="h-3 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full gradient-primary rounded-full transition-all duration-500"
                          style={{ width: `${clamp(goal.progress, 0, 100)}%` }}
                        />
                      </div>
                      <span className="absolute -right-0 -top-7 text-xs font-medium text-primary">
                        {clamp(goal.progress, 0, 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Update Reminder */}
            <Card className="p-6 gradient-hero border-border/50">
              <div className="flex items-start justify-between">
                <div className="w-full">
                  <h3 className="text-xl font-bold text-primary-foreground mb-2">
                    Mettre à jour vos données
                  </h3>
                  <p className="text-primary-foreground/90 mb-4">
                    Prochaine publication planifiée :{" "}
                    {nextScheduled ? (
                      <>
                        <span className="font-semibold">{nextScheduled.title}</span> •{" "}
                        {labelType(nextScheduled.type)} • {nextScheduled.channel} •{" "}
                        {formatDateTime(nextScheduled.scheduledAt)}
                      </>
                    ) : (
                      "aucune pour l’instant."
                    )}
                  </p>
                  <Button asChild variant="secondary">
                    <Link href="/contents">Mettre à jour maintenant</Link>
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
