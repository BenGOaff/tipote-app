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

type NextTask = {
  title: string;
  type: string;
  platform: string;
  dueTime: string;
  priority: "high" | "medium" | "low";
};

type StatIcon = React.ComponentType<{ className?: string }>;

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
  platform: string;
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

function clampPercent(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function safePriority(v: unknown): "high" | "medium" | "low" {
  const p = toLower(v);
  if (p === "high" || p === "medium" || p === "low") return p;
  return "medium";
}

const TodayLovable = () => {
  const [nextTask, setNextTask] = useState<NextTask>({
    title: "Rédiger le post LinkedIn du jour",
    type: "Post",
    platform: "LinkedIn",
    dueTime: "09:00",
    priority: "high",
  });

  const [stats, setStats] = useState<DashboardStat[]>([
    { label: "Contenus publiés", value: "24", trend: "+12%", icon: FileText },
    { label: "Tâches complétées", value: "67%", trend: "16/24", icon: CheckCircle2 },
    { label: "Engagement", value: "2.4K", trend: "+18%", icon: TrendingUp },
    { label: "Prochaine échéance", value: "2j", trend: "Lead magnet", icon: Calendar },
  ]);

  const [planProgressPercent, setPlanProgressPercent] = useState<number>(75);
  const [plannedLabel, setPlannedLabel] = useState<string>("5/7");
  const [plannedPercent, setPlannedPercent] = useState<number>(71);

  const [engagementLabel, setEngagementLabel] = useState<string>("2.4K/3K");
  const [engagementPercent, setEngagementPercent] = useState<number>(80);

  const [upcomingItems, setUpcomingItems] = useState<UpcomingItem[]>([
    { title: "Post LinkedIn : Stratégie 2025", type: "Post", day: "Aujourd'hui", time: "09:00", status: "À faire" },
    { title: "Newsletter hebdomadaire", type: "Email", day: "Demain", time: "14:00", status: "Planifié" },
    { title: "Article blog : Guide IA", type: "Article", day: "Mercredi", time: "10:00", status: "Brouillon" },
    { title: "Finaliser lead magnet PDF", type: "Tâche", day: "Vendredi", time: "-", status: "En cours" },
  ]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = getSupabaseBrowserClient();

        // content_item (RLS)
        const contentRes = await supabase
          .from("content_item")
          .select("id, type, title, status, scheduled_date, channel, created_at")
          .order("scheduled_date", { ascending: true, nullsFirst: false })
          .limit(80);

        const contentRows: any[] = Array.isArray(contentRes.data) ? contentRes.data : [];

        // project_tasks via API (session cookies)
        const tasksStatsRes = await fetch("/api/tasks/stats", { method: "GET" }).catch(() => null);
        const tasksStatsJson = tasksStatsRes ? await tasksStatsRes.json().catch(() => null) : null;

        const tasksRes = await fetch("/api/tasks", { method: "GET" }).catch(() => null);
        const tasksJson = tasksRes ? await tasksRes.json().catch(() => null) : null;

        const taskRows: any[] = Array.isArray(tasksJson?.tasks) ? tasksJson.tasks : [];

        const now = new Date();
        const next7 = new Date(now.getTime() + 7 * 86400000);

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
            platform: toStr(r?.channel) || "—",
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
            platform: "Projet",
            statusRaw: toStr(r?.status) || "",
            dt,
            priority: safePriority(r?.priority),
          });
        }

        combined.sort((a: CombinedUpcoming, b: CombinedUpcoming) => a.dt.getTime() - b.dt.getTime());

        const first = combined[0] ?? null;
        if (!cancelled && first) {
          const day = formatDayLabel(first.dt, now);
          const time = formatTimeOrDash(first.dt);
          setNextTask({
            title: first.title,
            type: first.kind === "content" ? first.type : "Tâche",
            platform: first.kind === "content" ? first.platform : "Projet",
            dueTime: time === "-" ? day : time,
            priority: first.kind === "task" ? (first.priority ?? "medium") : "high",
          });
        }

        // Upcoming (4 items) – preserve exact list length for layout
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

        // If empty, keep previous placeholders (Lovable) instead of showing blank UI.
        if (!cancelled && mapped.length > 0) {
          while (mapped.length < 4) {
            mapped.push({ title: "—", type: "Tâche", day: "—", time: "-", status: "À faire" });
          }
          setUpcomingItems(mapped);
        }

        // Stats
        const publishedCount = contentRows.filter((r) => isPublishedStatus(r?.status)).length;

        const completionRate =
          typeof tasksStatsJson?.completionRate === "number" ? tasksStatsJson.completionRate : null;
        const totalTasks = typeof tasksStatsJson?.total === "number" ? tasksStatsJson.total : null;
        const doneTasks = typeof tasksStatsJson?.done === "number" ? tasksStatsJson.done : null;

        if (!cancelled) {
          if (completionRate !== null) setPlanProgressPercent(clampPercent(completionRate));
        }

        // Planned ratio over next 7 days (target 7)
        const plannedNext7 = combined.filter((x: CombinedUpcoming) => {
          if (x.kind !== "content") return false;
          return isPlannedStatus(x.statusRaw);
        }).length;

        const target = 7;
        const plannedPct = clampPercent((plannedNext7 / target) * 100);

        if (!cancelled) {
          setPlannedLabel(`${plannedNext7}/${target}`);
          setPlannedPercent(plannedPct);
        }

        // Next due (days)
        let nextDueValue = "—";
        let nextDueTrend = "";
        if (first) {
          const days = Math.max(
            0,
            Math.round((startOfDay(first.dt).getTime() - startOfDay(now).getTime()) / 86400000),
          );
          nextDueValue = `${days}j`;
          nextDueTrend = first.title;
        }

        const tasksValue =
          completionRate !== null ? `${clampPercent(completionRate)}%` : stats[1]?.value ?? "—";
        const tasksTrend =
          doneTasks !== null && totalTasks !== null ? `${doneTasks}/${totalTasks}` : stats[1]?.trend ?? "—";

        if (!cancelled) {
          setStats([
            { label: "Contenus publiés", value: `${publishedCount}`, trend: stats[0]?.trend ?? "", icon: FileText },
            { label: "Tâches complétées", value: tasksValue, trend: tasksTrend, icon: CheckCircle2 },
            { label: "Engagement", value: stats[2]?.value ?? "—", trend: stats[2]?.trend ?? "", icon: TrendingUp },
            { label: "Prochaine échéance", value: nextDueValue, trend: nextDueTrend || (stats[3]?.trend ?? ""), icon: Calendar },
          ]);
        }

        // Engagement stays Lovable placeholder until analytics are wired
        if (!cancelled) {
          setEngagementLabel("2.4K/3K");
          setEngagementPercent(80);
        }
      } catch (e) {
        // On ne casse jamais l'UI du dashboard : on garde les placeholders Lovable si une erreur survient
        console.error("TodayLovable load error:", e);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
