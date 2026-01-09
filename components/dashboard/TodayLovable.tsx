"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Brain,
  TrendingUp,
  Calendar,
  FileText,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Target,
  Play,
  BarChart3,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type StatIcon = React.ComponentType<{ className?: string }>;

type NextTask = {
  title: string;
  type: string;
  platform: string;
  dueTime: string;
  priority: "high" | "medium" | "low";
};

type DashboardStat = {
  label: string;
  value: string;
  trend: string;
  icon: StatIcon;
};

type UpcomingItem = {
  title: string;
  type: string;
  day: string;
  time: string;
  status: "À faire" | "Planifié" | "Brouillon" | "En cours" | "Terminé";
};

type CombinedUpcoming = {
  kind: "content" | "task";
  title: string;
  type: string;
  statusRaw: string;
  dt: Date;
  priority?: "high" | "medium" | "low";
};

function toStr(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

function toLower(v: unknown): string {
  return toStr(v).toLowerCase();
}

function safePriority(v: unknown): "high" | "medium" | "low" {
  const p = toLower(v);
  if (p === "high" || p === "medium" || p === "low") return p;
  return "medium";
}

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = toStr(v);
  if (!s) return null;
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function pctDelta(curr: number, prev: number) {
  if (prev <= 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

function clampPercent(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function isPublishedStatus(s: unknown): boolean {
  const v = toLower(s);
  return v === "published" || v === "publié" || v === "publie";
}

function isPlannedStatus(s: unknown): boolean {
  const v = toLower(s);
  return v === "scheduled" || v === "planned" || v === "planifié" || v === "planifie";
}

function isDraftStatus(s: unknown): boolean {
  const v = toLower(s);
  return v === "draft" || v === "brouillon";
}

function isDoingStatus(s: unknown): boolean {
  const v = toLower(s);
  return v === "doing" || v === "in_progress" || v === "en cours" || v === "encours";
}

function isDoneStatus(s: unknown): boolean {
  const v = toLower(s);
  return v === "done" || v === "completed" || v === "fait" || v === "terminé" || v === "termine";
}

function mapContentStatusToUi(raw: string): UpcomingItem["status"] {
  if (isPlannedStatus(raw)) return "Planifié";
  if (isDraftStatus(raw)) return "Brouillon";
  if (isPublishedStatus(raw)) return "Terminé";
  return "À faire";
}

function mapTaskStatusToUi(raw: string): UpcomingItem["status"] {
  if (isDoneStatus(raw)) return "Terminé";
  if (isDoingStatus(raw)) return "En cours";
  return "À faire";
}

function formatDayLabel(date: Date, now: Date): string {
  const d0 = startOfDay(now).getTime();
  const d1 = startOfDay(date).getTime();
  const diffDays = Math.round((d1 - d0) / 86400000);

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Demain";

  const weekdays = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  return weekdays[date.getDay()] ?? "Cette semaine";
}

function formatTimeOrDash(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (hh === "00" && mm === "00") return "-";
  return `${hh}:${mm}`;
}

function pyramidsLookUseful(pyramids: unknown): boolean {
  if (!Array.isArray(pyramids) || pyramids.length < 3) return false;
  const p0 = pyramids[0] as any;
  const p1 = pyramids[1] as any;
  const p2 = pyramids[2] as any;

  const ok = (p: any) => {
    const name = typeof p?.name === "string" ? p.name.trim() : "";
    const sum = typeof p?.strategy_summary === "string" ? p.strategy_summary.trim() : "";
    return name.length > 0 && sum.length > 0;
  };

  return ok(p0) && ok(p1) && ok(p2);
}

const TodayLovable = () => {
  // Ne plus afficher “LinkedIn du jour” par défaut : neutral/guide
  const [nextTask, setNextTask] = useState<NextTask>({
    title: "Découvrir Tipote et démarrer",
    type: "Onboarding",
    platform: "Tipote",
    dueTime: "Maintenant",
    priority: "high",
  });

  const [stats, setStats] = useState<DashboardStat[]>([
    { label: "Contenus publiés", value: "0", trend: "0%", icon: FileText },
    { label: "Tâches complétées", value: "0%", trend: "0/0", icon: CheckCircle2 },
    { label: "Engagement", value: "0", trend: "0%", icon: TrendingUp },
    { label: "Prochaine échéance", value: "—", trend: "—", icon: Calendar },
  ]);

  // Progression : on remplace l’objectif fake “2.4K/3K” par un proxy cohérent : contenus publiés sur 7 jours / objectif 7
  const [planProgressPercent, setPlanProgressPercent] = useState<number>(0);
  const [plannedLabel, setPlannedLabel] = useState<string>("0/7");
  const [plannedPercent, setPlannedPercent] = useState<number>(0);
  const [engagementLabel, setEngagementLabel] = useState<string>("0/7");
  const [engagementPercent, setEngagementPercent] = useState<number>(0);

  const [upcomingItems, setUpcomingItems] = useState<UpcomingItem[]>([
    { title: "Compléter l'onboarding", type: "Tâche", day: "Aujourd'hui", time: "-", status: "À faire" },
    { title: "Générer ma stratégie", type: "Tâche", day: "Aujourd'hui", time: "-", status: "À faire" },
    { title: "Choisir ma pyramide d'offres", type: "Tâche", day: "Cette semaine", time: "-", status: "À faire" },
    { title: "Créer mon 1er contenu", type: "Tâche", day: "Cette semaine", time: "-", status: "À faire" },
  ]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = getSupabaseBrowserClient();

        // 0) Lire état onboarding + plan (pour proposer une “première action” logique)
        const profileRes = await supabase
          .from("business_profiles")
          .select("onboarding_completed")
          .maybeSingle();

        const onboardingCompleted = !!profileRes.data?.onboarding_completed;

        const planRes = await supabase
          .from("business_plan")
          .select("plan_json")
          .maybeSingle();

        const planJson = (planRes.data?.plan_json ?? null) as any;
        const selectedIdx = typeof planJson?.selected_offer_pyramid_index === "number" ? planJson.selected_offer_pyramid_index : null;
        const pyramidsOk = pyramidsLookUseful(planJson?.offer_pyramids);

        // 1) content_item
        const contentRes = await supabase
          .from("content_item")
          .select("id, type, title, status, scheduled_date, channel, created_at")
          .order("scheduled_date", { ascending: true, nullsFirst: false })
          .limit(200);

        const contentRows: any[] = Array.isArray(contentRes.data) ? contentRes.data : [];

        // 2) project_tasks via API (cookies)
        const tasksStatsRes = await fetch("/api/tasks/stats", { method: "GET" }).catch(() => null);
        const tasksStatsJson = tasksStatsRes ? await tasksStatsRes.json().catch(() => null) : null;

        const tasksRes = await fetch("/api/tasks", { method: "GET" }).catch(() => null);
        const tasksJson = tasksRes ? await tasksRes.json().catch(() => null) : null;

        const taskRows: any[] = Array.isArray(tasksJson?.tasks) ? tasksJson.tasks : [];

        const now = new Date();
        const next7 = new Date(now.getTime() + 7 * 86400000);

        // A) Construire upcoming réels (contenus planifiés + tâches datées)
        const combined: CombinedUpcoming[] = [];

        for (const r of contentRows) {
          const dt = parseDate(r?.scheduled_date);
          if (!dt) continue;
          const t = dt.getTime();
          if (t < startOfDay(now).getTime() || t > next7.getTime()) continue;

          combined.push({
            kind: "content",
            title: toStr(r?.title) || "Sans titre",
            type: toStr(r?.type) || "Contenu",
            statusRaw: toStr(r?.status) || "",
            dt,
          });
        }

        for (const r of taskRows) {
          const dt = parseDate(r?.due_date);
          if (!dt) continue;
          const t = dt.getTime();
          if (t < startOfDay(now).getTime() || t > next7.getTime()) continue;

          combined.push({
            kind: "task",
            title: toStr(r?.title) || "Sans titre",
            type: "Tâche",
            statusRaw: toStr(r?.status) || "",
            dt,
            priority: safePriority(r?.priority),
          });
        }

        combined.sort((a: CombinedUpcoming, b: CombinedUpcoming) => a.dt.getTime() - b.dt.getTime());
        const first = combined[0] ?? null;

        // B) Première action prioritaire (logique produit) :
        // - onboarding incomplet => onboarding
        // - onboarding ok mais stratégie pas générée => “Générer ma stratégie”
        // - pyramides générées mais pas choisies => “Choisir ma pyramide”
        // - sinon => prochain contenu/tâche datée (ou fallback)
        if (!cancelled) {
          if (!onboardingCompleted) {
            setNextTask({
              title: "Compléter l'onboarding",
              type: "Onboarding",
              platform: "Tipote",
              dueTime: "Maintenant",
              priority: "high",
            });
          } else if (!pyramidsOk) {
            setNextTask({
              title: "Générer ma stratégie",
              type: "Stratégie",
              platform: "Tipote",
              dueTime: "Maintenant",
              priority: "high",
            });
          } else if (selectedIdx === null) {
            setNextTask({
              title: "Choisir ma pyramide d'offres",
              type: "Stratégie",
              platform: "Tipote",
              dueTime: "Maintenant",
              priority: "high",
            });
          } else if (first) {
            const day = formatDayLabel(first.dt, now);
            const time = formatTimeOrDash(first.dt);
            setNextTask({
              title: first.title,
              type: first.kind === "content" ? first.type : "Tâche",
              platform: first.kind === "content" ? "Contenu" : "Projet",
              dueTime: time === "-" ? day : time,
              priority: first.kind === "task" ? (first.priority ?? "medium") : "high",
            });
          } else {
            setNextTask({
              title: "Créer mon 1er contenu",
              type: "Contenu",
              platform: "Tipote",
              dueTime: "Maintenant",
              priority: "high",
            });
          }
        }

        // C) “À venir cette semaine”
        if (!cancelled) {
          if (combined.length > 0) {
            const mapped: UpcomingItem[] = combined.slice(0, 4).map((x: CombinedUpcoming) => {
              const day = formatDayLabel(x.dt, now);
              const time = formatTimeOrDash(x.dt);
              const status =
                x.kind === "content" ? mapContentStatusToUi(x.statusRaw) : mapTaskStatusToUi(x.statusRaw);

              return {
                title: x.title,
                type: x.kind === "content" ? x.type : "Tâche",
                day,
                time,
                status,
              };
            });

            while (mapped.length < 4) {
              mapped.push({ title: "—", type: "Tâche", day: "—", time: "-", status: "À faire" });
            }
            setUpcomingItems(mapped);
          } else {
            // Pas de data : on montre une checklist d’arrivée (sans changer le layout)
            const fallback: UpcomingItem[] = [];
            if (!onboardingCompleted) {
              fallback.push({ title: "Compléter l'onboarding", type: "Tâche", day: "Aujourd'hui", time: "-", status: "À faire" });
            } else {
              if (!pyramidsOk) {
                fallback.push({ title: "Générer ma stratégie", type: "Tâche", day: "Aujourd'hui", time: "-", status: "À faire" });
              } else if (selectedIdx === null) {
                fallback.push({ title: "Choisir ma pyramide d'offres", type: "Tâche", day: "Aujourd'hui", time: "-", status: "À faire" });
              }
              fallback.push({ title: "Créer mon 1er contenu", type: "Tâche", day: "Cette semaine", time: "-", status: "À faire" });
              fallback.push({ title: "Planifier la semaine", type: "Tâche", day: "Cette semaine", time: "-", status: "À faire" });
            }

            while (fallback.length < 4) {
              fallback.push({ title: "—", type: "Tâche", day: "—", time: "-", status: "À faire" });
            }

            setUpcomingItems(fallback.slice(0, 4));
          }
        }

        // D) Stats + Progress (vraies données / proxys cohérents)
        // Contenus publiés : total + delta 7j vs 7j précédents
        const start7 = startOfDay(daysAgo(6));
        const prevStart7 = startOfDay(daysAgo(13));
        const prevEnd7 = startOfDay(daysAgo(7));

        const publishedTotal = contentRows.filter((r) => isPublishedStatus(r?.status)).length;

        const published7 = contentRows.filter((r) => {
          if (!isPublishedStatus(r?.status)) return false;
          const d = parseDate(r?.created_at) ?? parseDate(r?.scheduled_date);
          if (!d) return false;
          return d.getTime() >= start7.getTime();
        }).length;

        const publishedPrev7 = contentRows.filter((r) => {
          if (!isPublishedStatus(r?.status)) return false;
          const d = parseDate(r?.created_at) ?? parseDate(r?.scheduled_date);
          if (!d) return false;
          const t = d.getTime();
          return t >= prevStart7.getTime() && t < prevEnd7.getTime();
        }).length;

        const publishedDelta = pctDelta(published7, publishedPrev7);

        // Tâches : completionRate + done/total
        const completionRate =
          typeof tasksStatsJson?.completionRate === "number" ? tasksStatsJson.completionRate : 0;
        const totalTasks = typeof tasksStatsJson?.total === "number" ? tasksStatsJson.total : 0;
        const doneTasks = typeof tasksStatsJson?.done === "number" ? tasksStatsJson.done : 0;

        // Engagement proxy : contenus publiés 7j (objectif 7)
        const engagementGoal = 7;
        const engagementCurr = published7;
        const engagementPrev = publishedPrev7;
        const engagementDelta = pctDelta(engagementCurr, engagementPrev);

        // Contenus planifiés : sur 7j (objectif 7)
        const plannedNext7 = contentRows.filter((r) => {
          const dt = parseDate(r?.scheduled_date);
          if (!dt) return false;
          const t = dt.getTime();
          if (t < startOfDay(now).getTime() || t > next7.getTime()) return false;
          return isPlannedStatus(r?.status);
        }).length;

        // Prochaine échéance : si on a une vraie échéance (contenu/tâche), sinon "—"
        let nextDueValue = "—";
        let nextDueTrend = "—";
        if (first) {
          const days = Math.max(
            0,
            Math.round((startOfDay(first.dt).getTime() - startOfDay(now).getTime()) / 86400000),
          );
          nextDueValue = `${days}j`;
          nextDueTrend = first.title || "—";
        }

        if (!cancelled) {
          const planPct = clampPercent(completionRate);
          setPlanProgressPercent(planPct);

          const plannedPct = clampPercent((plannedNext7 / 7) * 100);
          setPlannedLabel(`${plannedNext7}/7`);
          setPlannedPercent(plannedPct);

          const engagementPct = clampPercent((engagementCurr / engagementGoal) * 100);
          setEngagementLabel(`${engagementCurr}/${engagementGoal}`);
          setEngagementPercent(engagementPct);

          setStats([
            {
              label: "Contenus publiés",
              value: `${publishedTotal}`,
              trend: `${publishedDelta >= 0 ? "+" : ""}${publishedDelta}%`,
              icon: FileText,
            },
            {
              label: "Tâches complétées",
              value: `${planPct}%`,
              trend: `${doneTasks}/${totalTasks}`,
              icon: CheckCircle2,
            },
            {
              label: "Engagement",
              value: `${engagementCurr}`,
              trend: `${engagementDelta >= 0 ? "+" : ""}${engagementDelta}%`,
              icon: TrendingUp,
            },
            {
              label: "Prochaine échéance",
              value: nextDueValue,
              trend: nextDueTrend,
              icon: Calendar,
            },
          ]);
        }
      } catch (e) {
        console.error("TodayLovable load error:", e);
        // Ne jamais casser l’UI : on garde les valeurs initiales (mais elles ne sont plus “LinkedIn/2.4K”)
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto">
          <header className="h-16 border-b border-border flex items-center px-6 bg-background/95 backdrop-blur-sm sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-4 flex-1">
              <h1 className="text-xl font-display font-bold">Aujourd'hui</h1>
            </div>
            <Link href="/analytics">
              <Button variant="outline" size="sm">
                <BarChart3 className="w-4 h-4 mr-2" />
                Analytics détaillés
              </Button>
            </Link>
          </header>

          <div className="p-6 space-y-6 max-w-6xl mx-auto">
            {/* Welcome Card with Next Action */}
            <Card className="p-8 gradient-hero border-border/50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-background/20 backdrop-blur-sm flex items-center justify-center">
                      <Target className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="text-primary-foreground/80 text-sm">Ta prochaine action</p>
                      <h2 className="text-2xl font-bold text-primary-foreground">{nextTask.title}</h2>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-6">
                    <Badge className="bg-background/20 text-primary-foreground border-none">{nextTask.type}</Badge>
                    <Badge className="bg-background/20 text-primary-foreground border-none">{nextTask.platform}</Badge>
                    <span className="text-primary-foreground/80 text-sm">Planifié pour {nextTask.dueTime}</span>
                  </div>

                  <div className="flex gap-3">
                    <Link href="/create">
                      <Button variant="secondary" size="lg">
                        <Play className="w-4 h-4 mr-2" />
                        Créer en 1 clic
                      </Button>
                    </Link>
                    <Link href="/strategy">
                      <Button variant="ghost" className="text-primary-foreground hover:bg-background/10">
                        Voir la stratégie
                      </Button>
                    </Link>
                  </div>
                </div>
                <Brain className="w-20 h-20 text-primary-foreground/30 hidden lg:block" />
              </div>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map((stat, index) => (
                <Card key={index} className="p-5 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2.5 rounded-xl bg-muted">
                      <stat.icon className="w-5 h-5 text-primary" />
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {stat.trend}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </Card>
              ))}
            </div>

            {/* Progress & Actions */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Weekly Progress */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold">Progression de la semaine</h3>
                  <Badge variant="outline">Semaine 50</Badge>
                </div>

                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Plan stratégique</span>
                      <span className="text-sm font-medium">{planProgressPercent}%</span>
                    </div>
                    <Progress value={planProgressPercent} className="h-2" />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Contenus planifiés</span>
                      <span className="text-sm font-medium">{plannedLabel}</span>
                    </div>
                    <Progress value={plannedPercent} className="h-2" />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Objectif engagement</span>
                      <span className="text-sm font-medium">{engagementLabel}</span>
                    </div>
                    <Progress value={engagementPercent} className="h-2" />
                  </div>
                </div>

                <Link href="/strategy" className="block mt-6">
                  <Button variant="outline" className="w-full">
                    Voir ma stratégie complète
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </Card>

              {/* Quick Actions */}
              <Card className="p-6">
                <h3 className="text-lg font-bold mb-6">Actions rapides</h3>

                <div className="space-y-3">
                  <Link href="/create" className="block">
                    <div className="p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold group-hover:text-primary transition-colors">Créer du contenu</p>
                          <p className="text-sm text-muted-foreground">Posts, emails, articles, vidéos...</p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </Link>

                  <Link href="/contents" className="block">
                    <div className="p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl gradient-secondary flex items-center justify-center flex-shrink-0">
                          <Calendar className="w-5 h-5 text-secondary-foreground" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold group-hover:text-primary transition-colors">Voir mes contenus</p>
                          <p className="text-sm text-muted-foreground">Liste & calendrier éditorial</p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </Link>

                  <Link href="/strategy" className="block">
                    <div className="p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
                          <Target className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold group-hover:text-primary transition-colors">Ma stratégie</p>
                          <p className="text-sm text-muted-foreground">Plan d'action & checklist</p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </Link>
                </div>
              </Card>
            </div>

            {/* Upcoming Tasks */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">À venir cette semaine</h3>
                <Link href="/contents">
                  <Button variant="ghost" size="sm">
                    Tout voir
                  </Button>
                </Link>
              </div>

              <div className="space-y-3">
                {upcomingItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex-shrink-0">
                      <Badge
                        variant={item.status === "À faire" ? "default" : item.status === "Planifié" ? "secondary" : "outline"}
                      >
                        {item.type}
                      </Badge>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.day} {item.time !== "-" && `• ${item.time}`}
                      </p>
                    </div>
                    <CheckCircle2
                      className={`w-5 h-5 flex-shrink-0 ${item.status === "En cours" ? "text-primary" : "text-muted-foreground"}`}
                    />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default TodayLovable;
