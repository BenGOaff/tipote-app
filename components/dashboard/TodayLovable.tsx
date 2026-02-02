"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Brain,
  TrendingUp,
  Calendar,
  FileText,
  CheckCircle2,
  ArrowRight,
  Target,
  Sparkles,
  Play,
  BarChart3,
} from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type Priority = "low" | "medium" | "high";

type NextTask = {
  title: string;
  type: string;
  platform: string;
  dueTime: string;
  priority: Priority;
};

type DashboardStat = {
  label: string;
  value: string;
  trend: string;
  icon: any;
};

type UpcomingItem = {
  title: string;
  type: string;
  day: string;
  time: string;
  status: "À faire" | "Planifié" | "En cours" | "Terminé";
};

type CombinedUpcoming = {
  kind: "content" | "task";
  title: string;
  type: string;
  statusRaw: string;
  dt: Date;
  priority?: Priority;
};

function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean).join(", ");
  return "";
}

function clampPercent(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function parseDate(v: unknown): Date | null {
  const s = toStr(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 (Sun) -> 6 (Sat)
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function endOfWeekSunday(d: Date): Date {
  const start = startOfWeekMonday(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function formatWeekRangeLabel(now: Date): string {
  const start = startOfWeekMonday(now);
  const end = endOfWeekSunday(now);
  const fmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" });
  return `Cette semaine (${fmt.format(start)} → ${fmt.format(end)})`;
}

function formatDayLabel(dt: Date, now: Date): string {
  const d0 = startOfDay(dt).getTime();
  const n0 = startOfDay(now).getTime();
  const diff = Math.round((d0 - n0) / 86400000);

  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  if (diff > 1 && diff < 7) return "Cette semaine";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(dt);
}

function formatTimeOrDash(dt: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

function safePriority(v: unknown): Priority {
  const s = toStr(v).toLowerCase().trim();
  if (s === "high") return "high";
  if (s === "low") return "low";
  return "medium";
}

function mapTaskStatusToUi(statusRaw: string): UpcomingItem["status"] {
  const s = (statusRaw || "").toLowerCase().trim();
  if (
    s === "done" ||
    s === "completed" ||
    s === "fait" ||
    s === "terminé" ||
    s === "termine"
  )
    return "Terminé";
  if (
    s === "doing" ||
    s === "in_progress" ||
    s === "in progress" ||
    s === "en cours"
  )
    return "En cours";
  return "À faire";
}

function mapContentStatusToUi(statusRaw: string): UpcomingItem["status"] {
  const s = (statusRaw || "").toLowerCase().trim();
  if (s === "published" || s === "publié" || s === "publie") return "Terminé";
  if (s === "scheduled" || s === "planifié" || s === "planifie") return "Planifié";
  if (s === "draft" || s === "brouillon") return "À faire";
  return "Planifié";
}

function isDoneStatus(v: unknown) {
  const s = toStr(v).toLowerCase().trim();
  return (
    s === "done" ||
    s === "completed" ||
    s === "fait" ||
    s === "terminé" ||
    s === "termine"
  );
}

function pyramidsLookUseful(pyramids: unknown) {
  if (!Array.isArray(pyramids) || pyramids.length === 0) return false;
  const first = pyramids[0] as any;
  return !!(
    first?.lead_magnet ||
    first?.low_ticket ||
    first?.high_ticket ||
    first?.leadMagnet ||
    first?.midTicket ||
    first?.highTicket
  );
}

function parseEuroGoalToNumber(goal: string): number | null {
  const s = (goal || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return null;

  const m = s.match(/([0-9]+(?:[\.,][0-9]+)?)\s*(k)?/i);
  if (!m) return null;

  const raw = m[1].replace(",", ".");
  const base = Number(raw);
  if (!Number.isFinite(base)) return null;

  const hasK = !!m[2];
  const val = hasK ? base * 1000 : base;
  if (!Number.isFinite(val) || val <= 0) return null;

  return Math.round(val);
}

function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

type BizPulse = {
  revenue: number | null;
  leads: number | null;
  sales: number | null;
};

const BIZPULSE_STORAGE_PREFIX = "tipote:bizpulse:";

const TodayLovable = () => {
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
    { label: "Activité", value: "0", trend: "0%", icon: TrendingUp },
    { label: "Prochaine échéance", value: "—", trend: "—", icon: Calendar },
  ]);

  const [weekLabel, setWeekLabel] = useState<string>(formatWeekRangeLabel(new Date()));

  const [weeklyGoalTasks, setWeeklyGoalTasks] = useState<number>(3);
  const [weeklyDoneTasks, setWeeklyDoneTasks] = useState<number>(0);

  const [weeklyGoalContents, setWeeklyGoalContents] = useState<number>(3);
  const [weeklyPlannedContents, setWeeklyPlannedContents] = useState<number>(0);
  const [weeklyPublishedContents, setWeeklyPublishedContents] = useState<number>(0);

  const [weeklyPlanPercent, setWeeklyPlanPercent] = useState<number>(0);

  const [planProgressPercent, setPlanProgressPercent] = useState<number>(0);
  void planProgressPercent;

  const [upcomingItems, setUpcomingItems] = useState<UpcomingItem[]>([
    {
      title: "Compléter l'onboarding",
      type: "Tâche",
      day: "Aujourd'hui",
      time: "-",
      status: "À faire",
    },
    {
      title: "Générer ma stratégie",
      type: "Tâche",
      day: "Aujourd'hui",
      time: "-",
      status: "À faire",
    },
    {
      title: "Choisir ma pyramide d'offres",
      type: "Tâche",
      day: "Cette semaine",
      time: "-",
      status: "À faire",
    },
    {
      title: "Créer mon 1er contenu",
      type: "Tâche",
      day: "Cette semaine",
      time: "-",
      status: "À faire",
    },
  ]);

  const [revenueGoalLabel, setRevenueGoalLabel] = useState<string>("—");
  const [revenueGoalValue, setRevenueGoalValue] = useState<number | null>(null);
  const [bizPulse, setBizPulse] = useState<BizPulse>({
    revenue: null,
    leads: null,
    sales: null,
  });
  const [isBizDialogOpen, setIsBizDialogOpen] = useState(false);

  const bizMonthKey = useMemo(() => monthKey(new Date()), []);
  const bizStorageKey = useMemo(
    () => `${BIZPULSE_STORAGE_PREFIX}${bizMonthKey}`,
    [bizMonthKey],
  );

  useEffect(() => {
    try {
      const raw =
        typeof window !== "undefined" ? window.localStorage.getItem(bizStorageKey) : null;
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<BizPulse> | null;
      if (!parsed) return;
      setBizPulse({
        revenue: typeof parsed.revenue === "number" ? parsed.revenue : null,
        leads: typeof parsed.leads === "number" ? parsed.leads : null,
        sales: typeof parsed.sales === "number" ? parsed.sales : null,
      });
    } catch {
      // silent
    }
  }, [bizStorageKey]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = getSupabaseBrowserClient();

        const now = new Date();
        setWeekLabel(formatWeekRangeLabel(now));
        const weekStart = startOfWeekMonday(now);
        const weekEnd = endOfWeekSunday(now);

        const profileRes = await supabase
          .from("business_profiles")
          .select("onboarding_completed, revenue_goal_monthly")
          .maybeSingle();

        const onboardingCompleted = !!profileRes.data?.onboarding_completed;

        const rgm = toStr((profileRes.data as any)?.revenue_goal_monthly).trim();
        const goalNumber = rgm ? parseEuroGoalToNumber(rgm) : null;

        if (!cancelled) {
          setRevenueGoalLabel(rgm || "—");
          setRevenueGoalValue(goalNumber);
        }

        const planRes = await supabase.from("business_plan").select("plan_json").maybeSingle();
        const planJson = (planRes.data?.plan_json ?? null) as any;

        const selectedIdx =
          typeof planJson?.selected_offer_pyramid_index === "number"
            ? planJson.selected_offer_pyramid_index
            : null;

        const pyramidsOk = pyramidsLookUseful(planJson?.offer_pyramids);

        type Attempt = { select: string; orderCol: string };

        const isSchemaError = (m: string) => {
          const s = (m || "").toLowerCase();
          return (
            s.includes("column") &&
            (s.includes("does not exist") || s.includes("not exist") || s.includes("unknown"))
          );
        };

        const attempts: Attempt[] = [
          {
            select:
              "id, type, title:titre, status:statut, scheduled_date:date_planifiee, channel:canal, created_at",
            orderCol: "date_planifiee",
          },
          {
            select: "id, type, title, status, scheduled_date, channel, created_at",
            orderCol: "scheduled_date",
          },
          {
            select: "id, type, title:titre, status:statut, created_at",
            orderCol: "created_at",
          },
          {
            select: "id, type, title, status, created_at",
            orderCol: "created_at",
          },
        ];

        async function loadContentRows() {
          for (const a of attempts) {
            const res = await supabase
              .from("content_item")
              .select(a.select)
              .order(a.orderCol, { ascending: true, nullsFirst: false })
              .limit(300);

            if (!res.error) {
              return Array.isArray(res.data) ? res.data : [];
            }

            if (!isSchemaError(res.error.message)) {
              console.error("TodayLovable content_item error:", res.error);
              return [];
            }
          }
          return [];
        }

        const contentRows: any[] = await loadContentRows();

        const tasksStatsRes = await fetch("/api/tasks/stats", { method: "GET" }).catch(
          () => null,
        );
        const tasksStatsJson = tasksStatsRes
          ? await tasksStatsRes.json().catch(() => null)
          : null;

        const tasksRes = await fetch("/api/tasks", { method: "GET" }).catch(() => null);
        const tasksJson = tasksRes ? await tasksRes.json().catch(() => null) : null;

        const taskRows: any[] = Array.isArray(tasksJson?.tasks) ? tasksJson.tasks : [];

        const combined: CombinedUpcoming[] = [];

        for (const r of contentRows) {
          const dt = parseDate(r?.scheduled_date);
          if (!dt) continue;
          const t = dt.getTime();
          if (t < weekStart.getTime() || t > weekEnd.getTime()) continue;

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
          if (t < weekStart.getTime() || t > weekEnd.getTime()) continue;

          combined.push({
            kind: "task",
            title: toStr(r?.title) || "Sans titre",
            type: "Tâche",
            statusRaw: toStr(r?.status) || "",
            dt,
            priority: safePriority(r?.priority),
          });
        }

        combined.sort((a, b) => a.dt.getTime() - b.dt.getTime());
        const firstUpcoming = combined[0] ?? null;

        const undoneTasks = (taskRows || []).filter((t) => !isDoneStatus(t?.status));
        undoneTasks.sort((a, b) => {
          const da = parseDate(a?.due_date);
          const db = parseDate(b?.due_date);
          const ta = da ? da.getTime() : Number.POSITIVE_INFINITY;
          const tb = db ? db.getTime() : Number.POSITIVE_INFINITY;
          if (ta !== tb) return ta - tb;

          const ca = parseDate(a?.created_at);
          const cb = parseDate(b?.created_at);
          const tca = ca ? ca.getTime() : 0;
          const tcb = cb ? cb.getTime() : 0;
          return tca - tcb;
        });
        const nextUndoneTask = undoneTasks[0] ?? null;

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
          } else if (nextUndoneTask) {
            const due = parseDate(nextUndoneTask?.due_date);
            const day = due ? formatDayLabel(due, now) : "Cette semaine";
            const time = due ? formatTimeOrDash(due) : "-";
            setNextTask({
              title: toStr(nextUndoneTask?.title) || "Tâche",
              type: "Tâche",
              platform: "Projet",
              dueTime: time === "-" ? day : time,
              priority: safePriority(nextUndoneTask?.priority),
            });
          } else if (firstUpcoming) {
            const day = formatDayLabel(firstUpcoming.dt, now);
            const time = formatTimeOrDash(firstUpcoming.dt);
            setNextTask({
              title: firstUpcoming.title,
              type: firstUpcoming.kind === "content" ? firstUpcoming.type : "Tâche",
              platform: firstUpcoming.kind === "content" ? "Contenu" : "Projet",
              dueTime: time === "-" ? day : time,
              priority:
                firstUpcoming.kind === "task" ? firstUpcoming.priority ?? "medium" : "high",
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

        if (!cancelled) {
          if (combined.length > 0) {
            const mapped: UpcomingItem[] = combined.slice(0, 4).map((x) => {
              const day = formatDayLabel(x.dt, now);
              const time = formatTimeOrDash(x.dt);
              const status =
                x.kind === "content"
                  ? mapContentStatusToUi(x.statusRaw)
                  : mapTaskStatusToUi(x.statusRaw);

              return {
                title: x.title,
                type: x.kind === "content" ? x.type : "Tâche",
                day,
                time,
                status,
              };
            });
            setUpcomingItems(mapped);
          }
        }

        const prevWeekStart = new Date(weekStart);
        prevWeekStart.setDate(prevWeekStart.getDate() - 7);
        const prevWeekEnd = new Date(weekEnd);
        prevWeekEnd.setDate(prevWeekEnd.getDate() - 7);

        const isPublished = (r: any) => {
          const s = toStr(r?.status).toLowerCase().trim();
          return s === "published" || s === "publié" || s === "publie";
        };

        const publishedTotal = contentRows.filter(isPublished).length;

        const publishedThisWeek = contentRows.filter((r) => {
          if (!isPublished(r)) return false;
          const dt = parseDate(r?.created_at) || parseDate(r?.scheduled_date);
          if (!dt) return false;
          const t = dt.getTime();
          return t >= weekStart.getTime() && t <= weekEnd.getTime();
        }).length;

        const publishedPrevWeek = contentRows.filter((r) => {
          if (!isPublished(r)) return false;
          const dt = parseDate(r?.created_at) || parseDate(r?.scheduled_date);
          if (!dt) return false;
          const t = dt.getTime();
          return t >= prevWeekStart.getTime() && t <= prevWeekEnd.getTime();
        }).length;

        const publishedDelta =
          publishedPrevWeek > 0
            ? Math.round(((publishedThisWeek - publishedPrevWeek) / publishedPrevWeek) * 100)
            : publishedThisWeek > 0
              ? 100
              : 0;

        const plannedThisWeek = contentRows.filter((r) => {
          const dt = parseDate(r?.scheduled_date);
          if (!dt) return false;
          const t = dt.getTime();
          return t >= weekStart.getTime() && t <= weekEnd.getTime();
        }).length;

        const totalTasks =
          typeof tasksStatsJson?.total === "number" ? tasksStatsJson.total : taskRows.length;
        const doneTasks =
          typeof tasksStatsJson?.done === "number"
            ? tasksStatsJson.done
            : taskRows.filter((t) => isDoneStatus(t?.status)).length;

        const completionRate =
          typeof tasksStatsJson?.completionRate === "number"
            ? tasksStatsJson.completionRate
            : totalTasks > 0
              ? Math.round((doneTasks / totalTasks) * 100)
              : 0;

        const doneThisWeek = taskRows.filter((t) => {
          if (!isDoneStatus(t?.status)) return false;
          const dt = parseDate(t?.updated_at) || parseDate(t?.created_at);
          if (!dt) return false;
          const tt = dt.getTime();
          return tt >= weekStart.getTime() && tt <= weekEnd.getTime();
        }).length;

        const donePrevWeek = taskRows.filter((t) => {
          if (!isDoneStatus(t?.status)) return false;
          const dt = parseDate(t?.updated_at) || parseDate(t?.created_at);
          if (!dt) return false;
          const tt = dt.getTime();
          return tt >= prevWeekStart.getTime() && tt <= prevWeekEnd.getTime();
        }).length;

        const activityThisWeek = doneThisWeek + publishedThisWeek;
        const activityPrevWeek = donePrevWeek + publishedPrevWeek;
        const activityDelta =
          activityPrevWeek > 0
            ? Math.round(((activityThisWeek - activityPrevWeek) / activityPrevWeek) * 100)
            : activityThisWeek > 0
              ? 100
              : 0;

        const todoCount = taskRows.filter((t) => !isDoneStatus(t?.status)).length;
        const goalTasks = todoCount > 0 ? Math.min(3, todoCount) : 0;
        const goalContents = 3;

        const planWeekPercent =
          goalTasks > 0 ? clampPercent((doneThisWeek / goalTasks) * 100) : 0;

        if (!cancelled) {
          const planPct = clampPercent(completionRate);
          setPlanProgressPercent(planPct);

          setWeeklyGoalTasks(goalTasks);
          setWeeklyDoneTasks(doneThisWeek);

          setWeeklyGoalContents(goalContents);
          setWeeklyPlannedContents(plannedThisWeek);
          setWeeklyPublishedContents(publishedThisWeek);

          setWeeklyPlanPercent(planWeekPercent);

          let nextDueValue = "—";
          let nextDueTrend = "—";
          if (firstUpcoming) {
            const days = Math.max(
              0,
              Math.round(
                (startOfDay(firstUpcoming.dt).getTime() - startOfDay(now).getTime()) /
                  86400000,
              ),
            );
            nextDueValue = `${days}j`;
            nextDueTrend = firstUpcoming.title || "—";
          }

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
              label: "Activité",
              value: `${activityThisWeek}`,
              trend: `${activityDelta >= 0 ? "+" : ""}${activityDelta}%`,
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
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const primaryHref = useMemo(() => {
    const t = (nextTask.type || "").toLowerCase();
    if (t.includes("onboarding")) return "/onboarding";
    if (t.includes("stratégie") || t.includes("strategie")) return "/strategy";
    if (t.includes("tâche") || t.includes("tache")) return "/strategy";
    if (t.includes("contenu")) return "/create";
    return "/create";
  }, [nextTask.type]);

  const weeklyGoalTasksLabel = useMemo(() => {
    if (weeklyGoalTasks <= 0) return "0";
    return `${Math.min(weeklyDoneTasks, weeklyGoalTasks)}/${weeklyGoalTasks}`;
  }, [weeklyDoneTasks, weeklyGoalTasks]);

  const weeklyGoalContentsLabel = useMemo(() => {
    return `${Math.min(weeklyPublishedContents, weeklyGoalContents)}/${weeklyGoalContents}`;
  }, [weeklyPublishedContents, weeklyGoalContents]);

  const weeklyPlannedLabel = useMemo(() => {
    return `${weeklyPlannedContents}/${weeklyGoalContents}`;
  }, [weeklyPlannedContents, weeklyGoalContents]);

  const businessProgressPercent = useMemo(() => {
    if (!revenueGoalValue || !bizPulse.revenue || revenueGoalValue <= 0) return 0;
    return clampPercent((bizPulse.revenue / revenueGoalValue) * 100);
  }, [bizPulse.revenue, revenueGoalValue]);

  const handleSaveBizPulse = () => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(bizStorageKey, JSON.stringify(bizPulse));
      }
    } catch {
      // silent
    }
    setIsBizDialogOpen(false);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto">
          <header className="h-16 border-b border-border flex items-center px-6 bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-4 flex-1">
              <h1 className="text-xl font-display font-bold">Aujourd&apos;hui</h1>
            </div>

            <Link href="/credits">
              <Button variant="outline" className="hidden sm:inline-flex">
                <Sparkles className="w-4 h-4 mr-2" />
                Mes crédits
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
                    <Badge className="bg-background/20 text-primary-foreground border-none">
                      {nextTask.type}
                    </Badge>
                    <Badge className="bg-background/20 text-primary-foreground border-none">
                      {nextTask.platform}
                    </Badge>
                    <span className="text-primary-foreground/80 text-sm">
                      Planifié pour {nextTask.dueTime}
                    </span>
                  </div>

                  <div className="flex gap-3">
                    <Link href={primaryHref}>
                      <Button variant="secondary" size="lg">
                        <Play className="w-4 h-4 mr-2" />
                        Commencer
                      </Button>
                    </Link>
                    <Link href="/strategy">
                      <Button
                        variant="ghost"
                        className="text-primary-foreground hover:bg-background/10"
                      >
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
              {/* This Week */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold">Cette semaine</h3>
                    <p className="text-sm text-muted-foreground">Ton focus et tes objectifs</p>
                  </div>
                  <Badge variant="outline">{weekLabel}</Badge>
                </div>

                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Objectif tâches</span>
                      <span className="text-sm font-medium">{weeklyGoalTasksLabel}</span>
                    </div>
                    <Progress value={weeklyPlanPercent} className="h-2" />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Contenus publiés</span>
                      <span className="text-sm font-medium">{weeklyGoalContentsLabel}</span>
                    </div>
                    <Progress
                      value={clampPercent(
                        (weeklyPublishedContents / Math.max(1, weeklyGoalContents)) * 100,
                      )}
                      className="h-2"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Contenus planifiés</span>
                      <span className="text-sm font-medium">{weeklyPlannedLabel}</span>
                    </div>
                    <Progress
                      value={clampPercent(
                        (weeklyPlannedContents / Math.max(1, weeklyGoalContents)) * 100,
                      )}
                      className="h-2"
                    />
                  </div>
                </div>

                <div className="mt-6 grid gap-3">
                  <Link href={primaryHref} className="block">
                    <Button className="w-full">
                      Continuer
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>

                  <Link href="/strategy" className="block">
                    <Button variant="outline" className="w-full">
                      Voir ma stratégie complète
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>

                {/* Business pulse */}
                <div className="mt-8 pt-6 border-t border-border">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <BarChart3 className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">Objectif du mois</p>
                        <p className="text-sm text-muted-foreground">{revenueGoalLabel}</p>
                      </div>
                    </div>

                    <Button variant="outline" onClick={() => setIsBizDialogOpen(true)}>
                      Renseigner
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Réalisé</span>
                      <span className="text-sm font-medium">
                        {bizPulse.revenue !== null ? `${bizPulse.revenue}€` : "—"}
                        {revenueGoalValue ? ` / ${revenueGoalValue}€` : ""}
                      </span>
                    </div>
                    <Progress value={businessProgressPercent} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      Astuce : renseigne tes chiffres 1 fois par semaine (ça suffit).
                    </p>
                  </div>
                </div>
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
                          <p className="font-semibold group-hover:text-primary transition-colors">
                            Créer du contenu
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Posts, emails, articles, vidéos...
                          </p>
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
                          <p className="font-semibold group-hover:text-primary transition-colors">
                            Voir mes contenus
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Liste & calendrier éditorial
                          </p>
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
                          <p className="font-semibold group-hover:text-primary transition-colors">
                            Ma stratégie
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Plan d&apos;action & checklist
                          </p>
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
                  <div
                    key={i}
                    className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-shrink-0">
                      <Badge
                        variant={
                          item.status === "À faire"
                            ? "default"
                            : item.status === "Planifié"
                              ? "secondary"
                              : "outline"
                        }
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
                      className={`w-5 h-5 flex-shrink-0 ${
                        item.status === "En cours" ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                  </div>
                ))}
              </div>
            </Card>

            <Dialog open={isBizDialogOpen} onOpenChange={setIsBizDialogOpen}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Renseigner tes chiffres</DialogTitle>
                  <DialogDescription>
                    30 secondes, 1 fois par semaine. Ces chiffres restent privés et servent à
                    visualiser ta progression.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Chiffre d&apos;affaires (ce mois-ci)</Label>
                    <Input
                      inputMode="numeric"
                      placeholder="ex : 1200"
                      value={bizPulse.revenue ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, "");
                        setBizPulse((p) => ({ ...p, revenue: v ? Number(v) : null }));
                      }}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Leads (optionnel)</Label>
                    <Input
                      inputMode="numeric"
                      placeholder="ex : 45"
                      value={bizPulse.leads ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, "");
                        setBizPulse((p) => ({ ...p, leads: v ? Number(v) : null }));
                      }}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Ventes (optionnel)</Label>
                    <Input
                      inputMode="numeric"
                      placeholder="ex : 3"
                      value={bizPulse.sales ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, "");
                        setBizPulse((p) => ({ ...p, sales: v ? Number(v) : null }));
                      }}
                    />
                  </div>
                </div>

                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setIsBizDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button onClick={handleSaveBizPulse}>Enregistrer</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default TodayLovable;
