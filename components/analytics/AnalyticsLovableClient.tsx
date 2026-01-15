// components/analytics/AnalyticsLovableClient.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";

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

import { useTutorial } from "@/hooks/useTutorial";
import { ContextualTooltip } from "@/components/tutorial/ContextualTooltip";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

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

/**
 * NOTE: on accepte ici les 2 shapes:
 * - Lovable/Tipote UI: scheduledAt / createdAt + type
 * - DB (content_item): scheduled_date / created_at (snake_case) + type parfois absent
 * => On normalise à l'affichage, sans casser la page analytics qui passe les champs DB.
 */
type TopContentInput = {
  id: string;
  title: string;
  channel: string;
  status: string;

  // "type" peut manquer selon la requête côté page.tsx
  type?: string | null;

  // camelCase (UI)
  scheduledAt?: string | null | undefined;
  createdAt?: string | null | undefined;

  // snake_case (DB)
  scheduled_date?: string | null | undefined;
  created_at?: string | null | undefined;
};

type NextScheduledInput =
  | {
      id: string;
      title: string;
      channel: string;
      status: string;
      type?: string | null;

      scheduledAt?: string | null | undefined;
      scheduled_date?: string | null | undefined;
    }
  | null;

function getScheduledAt(
  c: TopContentInput | (NextScheduledInput extends infer T ? T : never),
) {
  const anyC: any = c as any;
  return (anyC?.scheduledAt ?? anyC?.scheduled_date ?? null) as string | null;
}

function getCreatedAt(c: TopContentInput) {
  const anyC: any = c as any;
  return (anyC?.createdAt ?? anyC?.created_at ?? null) as string | null;
}

function getType(
  c: TopContentInput | (NextScheduledInput extends infer T ? T : never),
) {
  const anyC: any = c as any;
  return (anyC?.type ?? null) as string | null;
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
  topContents: TopContentInput[];
  trafficSources: Array<{
    source: string;
    percentage: number;
    visitors: string;
    color?: string;
  }>;
  nextScheduled: NextScheduledInput;
}) {
  const { periodDays, kpis, bars, topContents, trafficSources, nextScheduled } =
    props;

  const { markContextSeen } = useTutorial();
  const { toast } = useToast();

  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isUpdatingMetrics, setIsUpdatingMetrics] = useState(false);
  const [metricsForm, setMetricsForm] = useState({
    emailOpenRate: "",
    conversionRate: "",
    newSubscribers: "",
    pageViews: "",
  });

  const handleMetricsUpdate = async () => {
    setIsUpdatingMetrics(true);
    try {
      const payload = {
        emailOpenRate: metricsForm.emailOpenRate,
        conversionRate: metricsForm.conversionRate,
        newSubscribers: metricsForm.newSubscribers,
        pageViews: metricsForm.pageViews,
      };

      const res = await fetch("/api/analytics/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // fallback localStorage (ne bloque pas l’UX si la table n’existe pas encore)
        try {
          localStorage.setItem(
            "tipote_analytics_metrics_latest",
            JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }),
          );
        } catch {
          // ignore
        }
      }

      toast({
        title: "Métriques mises à jour !",
        description:
          "Vos données ont été enregistrées. L'IA va adapter vos recommandations.",
      });

      markContextSeen("first_analytics_visit");
      setIsUpdateModalOpen(false);
      setMetricsForm({
        emailOpenRate: "",
        conversionRate: "",
        newSubscribers: "",
        pageViews: "",
      });
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message || "Impossible d'enregistrer vos métriques.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingMetrics(false);
    }
  };

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
    <DashboardLayout
      title="Analytics"
      showAnalyticsLink={false}
      headerActions={
        <Button variant="outline" asChild size="sm">
          <Link href="/analytics?export=1">Exporter le rapport</Link>
        </Button>
      }
      contentClassName="p-6 space-y-6 max-w-7xl mx-auto"
    >
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">Vos performances</h2>
          <p className="text-muted-foreground">
            Suivez et optimisez vos résultats
          </p>
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
          <Card
            key={i}
            className="p-6 hover:shadow-md transition-all duration-200"
          >
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
            <h3 className="text-lg font-bold mb-6">
              Engagement au fil du temps
            </h3>
            <div className="h-64 flex items-end justify-between gap-2">
              {(bars.length
                ? bars
                : [
                    65, 72, 68, 80, 75, 88, 82, 90, 85, 92, 88, 95, 90, 98,
                  ]
              ).map((height, i) => (
                <div
                  key={i}
                  className="flex-1 bg-gradient-to-t from-primary to-primary/50 rounded-t-lg hover:opacity-80 transition-opacity cursor-pointer"
                  style={{ height: `${clamp(height, 5, 100)}%` }}
                />
              ))}
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
                {topContents.slice(0, 4).map((c) => {
                  const type = getType(c);
                  return (
                    <Link
                      key={c.id}
                      href={`/contents/${c.id}`}
                      className="block"
                    >
                      <div className="flex items-start justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex-1">
                          <p className="font-medium mb-1">{c.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {c.channel} • {labelType(type)} •{" "}
                            {labelStatus(c.status)}
                          </p>
                          {getCreatedAt(c) ? (
                            <p className="text-xs text-muted-foreground mt-1">
                              Créé : {formatDateTime(getCreatedAt(c))}
                            </p>
                          ) : null}
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" />
                      </div>
                    </Link>
                  );
                })}
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
                      {
                        source: "—",
                        percentage: 100,
                        visitors: "0",
                        color: "bg-muted-foreground/30",
                      },
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
                        className={`h-full ${
                          source.color || "bg-primary"
                        } rounded-full transition-all duration-500`}
                        style={{
                          width: `${clamp(source.percentage, 0, 100)}%`,
                        }}
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
              Sur {periodDays} jours : {kpis.totalNow} contenus • canal principal
              : {topChannel}
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="conversions">
          <Card className="p-12 text-center">
            <MousePointer className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Taux de publication : {publishRate}% • taux de planification :{" "}
              {scheduledRate}%
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="social">
          <Card className="p-12 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Répartition par canaux:{" "}
              {(trafficSources.length ? trafficSources.slice(0, 3) : []).map(
                (s, idx) => (
                  <span key={`${s.source}-${idx}`}>
                    {idx > 0 ? " • " : ""}
                    {s.source} {clamp(s.percentage, 0, 100)}%
                  </span>
                ),
              )}
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
                pct(
                  kpis.publishedNow,
                  Math.max(1, Math.max(kpis.publishedPrev, kpis.publishedNow, 1)),
                ),
                0,
                100,
              ),
            },
            {
              label: "Objectif contenus planifiés (période)",
              current: `${kpis.scheduledNow}`,
              target: `${Math.max(kpis.scheduledPrev, kpis.scheduledNow, 1)}`,
              progress: clamp(
                pct(
                  kpis.scheduledNow,
                  Math.max(
                    1,
                    Math.max(kpis.scheduledPrev, kpis.scheduledNow, 1),
                  ),
                ),
                0,
                100,
              ),
            },
          ].map((goal, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{goal.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {goal.current} / {goal.target}
                  </span>
                  <span className="text-xs font-medium text-primary whitespace-nowrap">
                    ({clamp(goal.progress, 0, 100)}%)
                  </span>
                </div>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full gradient-primary rounded-full transition-all duration-500"
                  style={{ width: `${clamp(goal.progress, 0, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Update Reminder */}
      <ContextualTooltip
        contextKey="first_analytics_visit"
        message="Mets à jour tes métriques chaque semaine pour des recommandations plus précises."
        position="top"
      >
        <Card className="p-6 gradient-hero border-border/50">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xl font-bold text-primary-foreground mb-2">
                Mettre à jour vos données
              </h3>
              <p className="text-primary-foreground/90 mb-4">
                N&apos;oubliez pas de mettre à jour vos métriques chaque semaine
                pour que l&apos;IA puisse analyser vos résultats et adapter
                votre stratégie
                {nextScheduled ? (
                  <>
                    . Prochaine publication planifiée :{" "}
                    <span className="font-semibold">{nextScheduled.title}</span>{" "}
                    • {labelType(getType(nextScheduled as any))} •{" "}
                    {nextScheduled.channel} •{" "}
                    {formatDateTime(getScheduledAt(nextScheduled as any))}
                  </>
                ) : null}
              </p>
              <Button
                variant="secondary"
                onClick={() => setIsUpdateModalOpen(true)}
              >
                Mettre à jour maintenant
              </Button>
            </div>
          </div>
        </Card>
      </ContextualTooltip>

      {/* Modal de mise à jour des métriques */}
      <Dialog open={isUpdateModalOpen} onOpenChange={setIsUpdateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mettre à jour vos métriques</DialogTitle>
            <DialogDescription>
              Entrez vos dernières données pour que l&apos;IA puisse affiner vos
              recommandations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emailOpenRate">
                Taux d&apos;ouverture emails (%)
              </Label>
              <Input
                id="emailOpenRate"
                type="number"
                placeholder="ex: 34.2"
                value={metricsForm.emailOpenRate}
                onChange={(e) =>
                  setMetricsForm((prev) => ({
                    ...prev,
                    emailOpenRate: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="conversionRate">Taux de conversion (%)</Label>
              <Input
                id="conversionRate"
                type="number"
                placeholder="ex: 8.7"
                value={metricsForm.conversionRate}
                onChange={(e) =>
                  setMetricsForm((prev) => ({
                    ...prev,
                    conversionRate: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newSubscribers">Nouveaux abonnés</Label>
              <Input
                id="newSubscribers"
                type="number"
                placeholder="ex: 1247"
                value={metricsForm.newSubscribers}
                onChange={(e) =>
                  setMetricsForm((prev) => ({
                    ...prev,
                    newSubscribers: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pageViews">Pages vues</Label>
              <Input
                id="pageViews"
                type="number"
                placeholder="ex: 12400"
                value={metricsForm.pageViews}
                onChange={(e) =>
                  setMetricsForm((prev) => ({
                    ...prev,
                    pageViews: e.target.value,
                  }))
                }
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsUpdateModalOpen(false)}
                disabled={isUpdatingMetrics}
              >
                Annuler
              </Button>
              <Button
                className="flex-1"
                onClick={handleMetricsUpdate}
                disabled={isUpdatingMetrics}
              >
                {isUpdatingMetrics ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
