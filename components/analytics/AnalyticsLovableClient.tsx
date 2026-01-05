// components/analytics/AnalyticsLovableClient.tsx
"use client";

import Link from "next/link";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Users, Mail, MousePointer, Eye, ArrowUpRight } from "lucide-react";

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}


function trendIcon(delta: number) {
  return delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />;
}

function trendBadgeVariant(delta: number) {
  return delta >= 0 ? "default" : "destructive";
}

function labelStatus(s: string) {
  const x = (s ?? "").toLowerCase();
  if (x === "published" || x === "publie" || x === "publié") return "Publié";
  if (x === "scheduled" || x === "planifie" || x === "planifié") return "Planifié";
  if (x === "draft" || x === "brouillon") return "Brouillon";
  return s || "—";
}

function labelType(t: string) {
  const x = (t ?? "").toLowerCase();
  if (x === "post") return "Post";
  if (x === "email") return "Email";
  if (x === "blog") return "Blog";
  if (x === "video_script") return "Script vidéo";
  if (x === "funnel") return "Funnel";
  return t || "—";
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
  bars: number[]; // 14 values [8..100]
  topContents: Array<{
    id: string;
    title: string;
    channel: string;
    status: string;
    scheduled_date: string | null;
    created_at: string | null;
  }>;
  trafficSources: Array<{ source: string; percentage: number; visitors: string }>;
  nextScheduled: null | {
    id: string;
    title: string;
    type: string;
    channel: string;
    status: string;
    scheduledAt: string;
  };
}) {
  const { periodDays, kpis, bars, topContents, trafficSources, nextScheduled } = props;

  // Mapping “Lovable cards” → Tipote data (vraies données, labels cohérents)
  const metrics = [
    {
      label: "Contenus publiés",
      value: String(kpis.publishedNow),
      change: `${kpis.deltaPublished >= 0 ? "+" : ""}${kpis.deltaPublished}%`,
      trend: kpis.deltaPublished >= 0 ? "up" : "down",
      icon: Mail,
      color: "text-primary",
    },
    {
      label: "Tâches complétées",
      value: `${kpis.tasksPct}%`,
      change: `${kpis.tasksDone}/${kpis.tasksTotal}`,
      trend: "up" as const,
      icon: MousePointer,
      color: "text-success",
    },
    {
      label: "Contenus planifiés",
      value: String(kpis.scheduledNow),
      change: `${kpis.deltaScheduled >= 0 ? "+" : ""}${kpis.deltaScheduled}%`,
      trend: kpis.deltaScheduled >= 0 ? "up" : "down",
      icon: Users,
      color: "text-secondary",
    },
    {
      label: "Total contenus",
      value: String(kpis.totalNow),
      change: `${kpis.deltaAll >= 0 ? "+" : ""}${kpis.deltaAll}%`,
      trend: kpis.deltaAll >= 0 ? "up" : "down",
      icon: Eye,
      color: "text-primary",
    },
  ];

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

            <Button asChild variant="outline">
              <a href={`/api/analytics/export?period=${periodDays}`} target="_blank" rel="noreferrer">
                Exporter le rapport
              </a>
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
                <Button asChild variant="outline" size="sm">
                  <Link href="/analytics?period=7">7 jours</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/analytics?period=30">30 jours</Link>
                </Button>
                <Button asChild variant={periodDays === 90 ? "default" : "outline"} size="sm">
                  <Link href="/analytics?period=90">90 jours</Link>
                </Button>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {metrics.map((metric, i) => (
                <Card key={i} className="p-6 hover:shadow-md transition-all duration-200">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl bg-muted flex items-center justify-center ${metric.color}`}>
                      <metric.icon className="w-5 h-5" />
                    </div>

                    <Badge
                      variant={trendBadgeVariant(metric.trend === "down" ? -1 : 1)}
                      className="flex items-center gap-1"
                    >
                      {metric.trend === "down" ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
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
                {/* “Engagement” proxy chart */}
                <Card className="p-6">
                  <h3 className="text-lg font-bold mb-6">Engagement au fil du temps</h3>
                  <div className="h-64 flex items-end justify-between gap-2">
                    {bars.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-gradient-to-t from-primary to-primary/50 rounded-t-lg hover:opacity-80 transition-opacity cursor-pointer"
                        style={{ height: `${h}%` }}
                        title={`${h}%`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                    <span>-14j</span>
                    <span>-10j</span>
                    <span>-7j</span>
                    <span>Aujourd’hui</span>
                  </div>
                </Card>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Top contents (proxy: derniers contenus) */}
                  <Card className="p-6">
                    <h3 className="text-lg font-bold mb-6">Top contenus</h3>
                    <div className="space-y-4">
                      {topContents.slice(0, 4).map((c) => (
                        <Link
                          key={c.id}
                          href={`/contents/${c.id}`}
                          className="block"
                        >
                          <div className="flex items-start justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                            <div className="flex-1">
                              <p className="font-medium mb-1">{c.title}</p>
                              <p className="text-sm text-muted-foreground">
                                {c.channel} • {labelStatus(c.status)}
                              </p>
                            </div>
                            <ArrowUpRight className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </Card>

                  {/* Traffic sources (proxy: channels repartition) */}
                  <Card className="p-6">
                    <h3 className="text-lg font-bold mb-6">Sources de trafic</h3>
                    <div className="space-y-4">
                      {(trafficSources.length ? trafficSources : [{ source: "—", percentage: 100, visitors: "0" }]).map(
                        (source, i) => (
                          <div key={i}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">{source.source}</span>
                              <span className="text-sm text-muted-foreground">
                                {source.percentage}% • {source.visitors}
                              </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all duration-500"
                                style={{ width: `${source.percentage}%` }}
                              />
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="traffic">
                <Card className="p-12 text-center">
                  <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Données de trafic à venir</p>
                </Card>
              </TabsContent>

              <TabsContent value="conversions">
                <Card className="p-12 text-center">
                  <MousePointer className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Données de conversion à venir</p>
                </Card>
              </TabsContent>

              <TabsContent value="social">
                <Card className="p-12 text-center">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Analytics réseaux sociaux à venir</p>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Goals Progress (proxy: tasks + content cadence) */}
            <Card className="p-6">
              <h3 className="text-lg font-bold mb-6">Progression des objectifs</h3>
              <div className="space-y-6">
                {[
                  {
                    label: "Objectif exécution (tâches)",
                    current: `${kpis.tasksDone}`,
                    target: `${kpis.tasksTotal}`,
                    progress: kpis.tasksPct,
                  },
                  {
                    label: "Objectif contenus publiés (période)",
                    current: `${kpis.publishedNow}`,
                    target: `${Math.max(kpis.publishedNow, kpis.publishedPrev, 1)}`,
                    progress: clamp(
                      Math.round(
                        (kpis.publishedNow /
                          Math.max(kpis.publishedNow, kpis.publishedPrev, 1)) *
                          100
                      ),
                      0,
                      100
                    ),
                  },
                  {
                    label: "Objectif contenus planifiés (période)",
                    current: `${kpis.scheduledNow}`,
                    target: `${Math.max(kpis.scheduledNow, kpis.scheduledPrev, 1)}`,
                    progress: clamp(
                      Math.round(
                        (kpis.scheduledNow /
                          Math.max(kpis.scheduledNow, kpis.scheduledPrev, 1)) *
                          100
                      ),
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
                          style={{ width: `${goal.progress}%` }}
                        />
                      </div>
                      <span className="absolute -right-0 -top-7 text-xs font-medium text-primary">
                        {goal.progress}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Next scheduled (bonus card, utile “Tipote vrai”) */}
            {nextScheduled && (
              <Card className="p-6">
                <h3 className="text-lg font-bold mb-4">Prochaine échéance</h3>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Badge variant="secondary">{labelType(nextScheduled.type)}</Badge>
                  <Badge variant="outline">{nextScheduled.channel || "—"}</Badge>
                  <Badge variant="outline">{labelStatus(nextScheduled.status)}</Badge>
                </div>
                <div className="text-xl font-bold mb-2">{nextScheduled.title}</div>
                <div className="text-sm text-muted-foreground">
                  {new Date(nextScheduled.scheduledAt).toLocaleString("fr-FR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button asChild className="w-full">
                    <Link href={`/contents/${nextScheduled.id}`}>Ouvrir</Link>
                  </Button>
                  <Button asChild variant="secondary" className="w-full">
                    <Link href="/strategy">Voir stratégie</Link>
                  </Button>
                </div>
              </Card>
            )}

            {/* Update Reminder */}
            <Card className="p-6 gradient-hero border-border/50">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-primary-foreground mb-2">Mettre à jour vos données</h3>
                  <p className="text-primary-foreground/90 mb-4">
                    Pensez à synchroniser vos tâches et à planifier vos contenus : l’IA pourra analyser vos résultats et adapter votre stratégie.
                  </p>
                  <Button asChild variant="secondary">
                    <Link href="/tasks">Mettre à jour maintenant</Link>
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
