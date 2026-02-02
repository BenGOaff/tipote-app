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
  return "À faire";
}

function formatEuroCompact(v: number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function parseEuroNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = toStr(v).replace(/\s/g, "").trim();
  if (!s) return null;

  // accepte "10000", "10.000", "10 000", "10k", "10K", "10.5k"
  const kMatch = s.match(/^(\d+(?:[.,]\d+)?)k$/i);
  if (kMatch?.[1]) {
    const base = Number(kMatch[1].replace(",", "."));
    return Number.isFinite(base) ? Math.round(base * 1000) : null;
  }

  // enlève tout sauf chiffres/./,
  const cleaned = s.replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;

  // heuristique FR: si virgule présente, elle est décimale
  let normalized = cleaned;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    // "1.234,56" => "1234.56"
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    // "1234,56" => "1234.56"
    normalized = cleaned.replace(",", ".");
  } else {
    // "1.234" peut être "1234" (grouping) => si 3 décimales après dot, on enlève
    const dotParts = cleaned.split(".");
    if (dotParts.length === 2 && dotParts[1].length === 3) {
      normalized = cleaned.replace(".", "");
    }
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? Math.round(num) : null;
}

type BizPulse = {
  // manuel
  weeklyRevenue: string;
  weeklyLeads: string;
  weeklyCalls: string;
};

function storageKey(userId: string) {
  return `tipote:dashboard:pulse:${userId}`;
}

function loadPulse(userId: string): BizPulse | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const json = JSON.parse(raw) as Partial<BizPulse> | null;
    if (!json || typeof json !== "object") return null;
    return {
      weeklyRevenue: typeof json.weeklyRevenue === "string" ? json.weeklyRevenue : "",
      weeklyLeads: typeof json.weeklyLeads === "string" ? json.weeklyLeads : "",
      weeklyCalls: typeof json.weeklyCalls === "string" ? json.weeklyCalls : "",
    };
  } catch {
    return null;
  }
}

function savePulse(userId: string, pulse: BizPulse) {
  if (!userId) return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(pulse));
  } catch {
    // ignore
  }
}

type TaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  due_date: string | null;
  priority: string | null;
  created_at: string | null;
  updated_at: string | null;
  source: string | null;
};

type ContentRowAny = Record<string, unknown>;

function pickFirstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    const s = toStr(v).trim();
    if (s) return s;
  }
  return "";
}

function normalizeTaskTitle(t: TaskRow): string {
  return pickFirstNonEmpty(t.title, (t as any)?.task, (t as any)?.name, "—") || "—";
}

function normalizeTaskDueDate(t: TaskRow): Date | null {
  return parseDate(t.due_date ?? (t as any)?.dueDate ?? (t as any)?.date_echeance);
}

function normalizeTaskStatus(t: TaskRow): string {
  return pickFirstNonEmpty(t.status, (t as any)?.statut, (t as any)?.state, "todo");
}

function normalizeTaskPriority(t: TaskRow): Priority {
  return safePriority(t.priority ?? (t as any)?.priorite ?? "medium");
}

function normalizeContentTitle(r: ContentRowAny): string {
  return pickFirstNonEmpty(
    r.title,
    (r as any)?.titre,
    (r as any)?.name,
    (r as any)?.nom,
    "—",
  ) || "—";
}

function normalizeContentType(r: ContentRowAny): string {
  return pickFirstNonEmpty(r.type, (r as any)?.type_contenu, (r as any)?.format, "Contenu") || "Contenu";
}

function normalizeContentStatus(r: ContentRowAny): string {
  return pickFirstNonEmpty(r.status, (r as any)?.statut, "draft") || "draft";
}

function normalizeContentScheduledDate(r: ContentRowAny): Date | null {
  // scheduled_date OR date_planifiee OR scheduledDate
  return (
    parseDate((r as any)?.scheduled_date) ||
    parseDate((r as any)?.date_planifiee) ||
    parseDate((r as any)?.scheduledDate) ||
    parseDate((r as any)?.published_at) ||
    parseDate((r as any)?.created_at)
  );
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

export default function TodayLovable() {
  const [isPulseOpen, setIsPulseOpen] = useState(false);

  const [nextTask, setNextTask] = useState<NextTask>({
    title: "Synchroniser ta stratégie",
    type: "Plan stratégique",
    platform: "Tipote",
    dueTime: "Aujourd'hui",
    priority: "high",
  });

  const [stats, setStats] = useState<DashboardStat[]>([
    {
      label: "Plan stratégique",
      value: "0%",
      trend: "0%",
      icon: Target,
    },
    {
      label: "Contenus planifiés",
      value: "0/7",
      trend: "+0",
      icon: Calendar,
    },
    {
      label: "Objectif engagement",
      value: "0/7",
      trend: "+0",
      icon: TrendingUp,
    },
  ]);

  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([
    {
      title: "Compléter mon onboarding",
      type: "Étape",
      day: "Aujourd'hui",
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
    weeklyRevenue: "",
    weeklyLeads: "",
    weeklyCalls: "",
  });

  const [pulseUserId, setPulseUserId] = useState<string>("");

  const now = useMemo(() => new Date(), []);
  const weekLabel = useMemo(() => formatWeekRangeLabel(now), [now]);

  const [pulseErrors, setPulseErrors] = useState<Record<keyof BizPulse, string>>({
    weeklyRevenue: "",
    weeklyLeads: "",
    weeklyCalls: "",
  });

  const pulsePreview = useMemo(() => {
    const weeklyRevenue = parseEuroNumber(bizPulse.weeklyRevenue);
    const weeklyLeads = parseEuroNumber(bizPulse.weeklyLeads);
    const weeklyCalls = parseEuroNumber(bizPulse.weeklyCalls);

    return {
      weeklyRevenue,
      weeklyLeads,
      weeklyCalls,
    };
  }, [bizPulse.weeklyCalls, bizPulse.weeklyLeads, bizPulse.weeklyRevenue]);

  const revenueToGoalRatio = useMemo(() => {
    if (!revenueGoalValue || revenueGoalValue <= 0) return 0;
    const rev = pulsePreview.weeklyRevenue;
    if (!rev || rev <= 0) return 0;

    // weekly vs monthly: approximation (x4)
    const monthlyEstimate = rev * 4;
    return clampPercent((monthlyEstimate / revenueGoalValue) * 100);
  }, [pulsePreview.weeklyRevenue, revenueGoalValue]);

  const weeklyExecutionPercent = useMemo(() => {
    // proxy motivation: calls + leads + revenue (normalised)
    const calls = pulsePreview.weeklyCalls ?? 0;
    const leads = pulsePreview.weeklyLeads ?? 0;
    const rev = pulsePreview.weeklyRevenue ?? 0;

    // targets simples
    const tCalls = 5;
    const tLeads = 25;
    const tRev = 2000;

    const a = Math.min(1, calls / tCalls);
    const b = Math.min(1, leads / tLeads);
    const c = Math.min(1, rev / tRev);

    return clampPercent(((a + b + c) / 3) * 100);
  }, [pulsePreview.weeklyCalls, pulsePreview.weeklyLeads, pulsePreview.weeklyRevenue]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    let cancelled = false;

    async function load() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user?.id) {
          // Page protégée côté serveur, mais on reste safe.
          return;
        }

        const userId = user.id;

        if (cancelled) return;

        setPulseUserId(userId);

        const fromStorage = loadPulse(userId);
        if (fromStorage) setBizPulse(fromStorage);

        const profileRes = await supabase
          .from("business_profiles")
          .select("onboarding_completed, revenue_goal_monthly")
          .eq("user_id", userId)
          .maybeSingle();

        if (!cancelled) {
          const goalRaw = (profileRes.data as any)?.revenue_goal_monthly;
          const goalNum = parseEuroNumber(goalRaw);

          setRevenueGoalValue(goalNum);
          setRevenueGoalLabel(
            goalNum ? formatEuroCompact(goalNum) : pickFirstNonEmpty(goalRaw, "—") || "—",
          );
        }

        const planRes = await supabase
          .from("business_plan")
          .select("plan_json")
          .eq("user_id", userId)
          .maybeSingle();

        const planJson = (planRes.data as any)?.plan_json ?? null;

        const selectedIndex =
          (planJson as any)?.selected_offer_pyramid_index ??
          (planJson as any)?.selectedOfferPyramidIndex ??
          null;

        // Load tasks via API (RLS-safe)
        const tasksRes = await fetch("/api/tasks", { cache: "no-store" })
          .then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => null) }))
          .catch(() => ({ ok: false, json: null as any }));

        const tasks: TaskRow[] = Array.isArray((tasksRes as any).json?.tasks)
          ? ((tasksRes as any).json.tasks as TaskRow[])
          : Array.isArray((tasksRes as any).json)
            ? ((tasksRes as any).json as TaskRow[])
            : [];

        const tasksAll = tasks;
        const tasksDone = tasksAll.filter((t) =>
          isDoneStatus(normalizeTaskStatus(t)),
        ).length;
        const tasksTotal = tasksAll.length;
        const progressionPercent = tasksTotal
          ? clampPercent((tasksDone / tasksTotal) * 100)
          : 0;

        // Weekly window
        const startW = startOfWeekMonday(now);
        const endW = endOfWeekSunday(now);

        // Content rows (schema-compat)
        const attempts: { select: string; orderCol: string }[] = [
          { select: "id,title,content,status,channel,scheduled_date,created_at,type,user_id", orderCol: "scheduled_date" },
          { select: "id,titre,contenu,statut,canal,date_planifiee,created_at,type,user_id", orderCol: "date_planifiee" },
          { select: "id,title,content,status,created_at,type,user_id", orderCol: "created_at" },
        ];

        const isSchemaError = (m: string) => {
          const s = (m || "").toLowerCase();
          return (
            s.includes("column") &&
            (s.includes("does not exist") || s.includes("not exist") || s.includes("unknown"))
          );
        };

        const isUserIdMissing = (m: string) => {
          const s = (m || "").toLowerCase();
          return isSchemaError(s) && s.includes("user_id");
        };

        async function loadContentRows() {
          for (const a of attempts) {
            // 1) essai "normal" avec user_id (meilleures perfs + pas de cross-user si RLS est permissif)
            let res = await supabase
              .from("content_item")
              .select(a.select)
              .eq("user_id", userId)
              .order(a.orderCol, { ascending: true, nullsFirst: false })
              .limit(300);

            // 2) fallback si colonne user_id manquante (cas legacy)
            if (res.error && isUserIdMissing(res.error.message)) {
              res = await supabase
                .from("content_item")
                .select(a.select)
                .order(a.orderCol, { ascending: true, nullsFirst: false })
                .limit(300);
            }

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

        const contentRows = (await loadContentRows()) as ContentRowAny[];

        // content planned this week
        const plannedThisWeek = contentRows.filter((r) => {
          const dt = normalizeContentScheduledDate(r);
          if (!dt) return false;
          return dt >= startW && dt <= endW;
        });

        const plannedCount = plannedThisWeek.length;

        // engagement goal: we cannot know, so proxy = (completed tasks this week)/(target) or (manual pulse leads/calls)
        const tasksDoneThisWeek = tasksAll.filter((t) => {
          const done = isDoneStatus(normalizeTaskStatus(t));
          if (!done) return false;
          const dt =
            parseDate((t as any)?.updated_at) ||
            parseDate((t as any)?.updatedAt) ||
            parseDate((t as any)?.created_at);
          if (!dt) return false;
          return dt >= startW && dt <= endW;
        }).length;

        // "objectif engagement" = proxy = tasks done this week / 7
        const engagementValue = `${Math.min(7, tasksDoneThisWeek)}/7`;

        const nextTodoTask = tasksAll
          .filter((t) => !isDoneStatus(normalizeTaskStatus(t)))
          .sort((a, b) => {
            const da = normalizeTaskDueDate(a)?.getTime() ?? Number.POSITIVE_INFINITY;
            const db = normalizeTaskDueDate(b)?.getTime() ?? Number.POSITIVE_INFINITY;
            if (da !== db) return da - db;
            // priority high first
            const pa = normalizeTaskPriority(a);
            const pb = normalizeTaskPriority(b);
            const w = { high: 0, medium: 1, low: 2 } as const;
            return w[pa] - w[pb];
          })[0];

        const nextDue = nextTodoTask ? normalizeTaskDueDate(nextTodoTask) : null;

        if (!cancelled) {
          setNextTask({
            title: nextTodoTask ? normalizeTaskTitle(nextTodoTask) : "Synchroniser ta stratégie",
            type: "Plan stratégique",
            platform: "Tipote",
            dueTime: nextDue ? formatDayLabel(nextDue, now) : "Aujourd'hui",
            priority: nextTodoTask ? normalizeTaskPriority(nextTodoTask) : "high",
          });

          setStats([
            {
              label: "Plan stratégique",
              value: `${progressionPercent}%`,
              trend: `${tasksDone}/${tasksTotal}`,
              icon: Target,
            },
            {
              label: "Contenus planifiés",
              value: `${plannedCount}/7`,
              trend: plannedCount > 0 ? `+${plannedCount}` : "+0",
              icon: Calendar,
            },
            {
              label: "Objectif engagement",
              value: engagementValue,
              trend: tasksDoneThisWeek > 0 ? `+${tasksDoneThisWeek}` : "+0",
              icon: TrendingUp,
            },
          ]);
        }

        // Upcoming list: mix tasks + content for week
        const upcomingCombined: CombinedUpcoming[] = [];

        // tasks (todo only, next 5 by due)
        const tasksUpcoming = tasksAll
          .filter((t) => !isDoneStatus(normalizeTaskStatus(t)))
          .map((t) => {
            const dt = normalizeTaskDueDate(t) ?? now;
            return {
              kind: "task" as const,
              title: normalizeTaskTitle(t),
              type: "Tâche",
              statusRaw: normalizeTaskStatus(t),
              dt,
              priority: normalizeTaskPriority(t),
            };
          })
          .sort((a, b) => a.dt.getTime() - b.dt.getTime())
          .slice(0, 6);

        upcomingCombined.push(...tasksUpcoming);

        // content (scheduled + draft) for week (next 6)
        const contentUpcoming = contentRows
          .map((r) => {
            const dt = normalizeContentScheduledDate(r) ?? now;
            return {
              kind: "content" as const,
              title: normalizeContentTitle(r),
              type: normalizeContentType(r),
              statusRaw: normalizeContentStatus(r),
              dt,
            };
          })
          .filter((x) => x.dt >= startW && x.dt <= endW)
          .sort((a, b) => a.dt.getTime() - b.dt.getTime())
          .slice(0, 6);

        upcomingCombined.push(...contentUpcoming);

        upcomingCombined.sort((a, b) => a.dt.getTime() - b.dt.getTime());

        const nextUpcoming: UpcomingItem[] = upcomingCombined.slice(0, 8).map((x) => {
          const day = formatDayLabel(x.dt, now);
          const time = formatTimeOrDash(x.dt);

          return {
            title: x.title,
            type: x.type,
            day,
            time,
            status:
              x.kind === "task"
                ? mapTaskStatusToUi(x.statusRaw)
                : mapContentStatusToUi(x.statusRaw),
          };
        });

        if (!cancelled) {
          setUpcoming(nextUpcoming.length ? nextUpcoming : upcoming);
        }

        // planJson validity (used for CTA)
        void selectedIndex;
      } catch (e) {
        console.error("TodayLovable load error:", e);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pulseUserId) return;
    savePulse(pulseUserId, bizPulse);
  }, [bizPulse, pulseUserId]);

  function validatePulse(next: BizPulse) {
    const errs: Record<keyof BizPulse, string> = {
      weeklyRevenue: "",
      weeklyLeads: "",
      weeklyCalls: "",
    };

    // Only revenue is "currency-ish"
    if (next.weeklyRevenue.trim()) {
      const n = parseEuroNumber(next.weeklyRevenue);
      if (n === null || !Number.isFinite(n) || n < 0) {
        errs.weeklyRevenue = "Entre un montant valide (ex: 1200, 1 200, 1.2k).";
      }
    }

    if (next.weeklyLeads.trim()) {
      const n = parseEuroNumber(next.weeklyLeads);
      if (n === null || !Number.isFinite(n) || n < 0) {
        errs.weeklyLeads = "Entre un nombre valide (ex: 10).";
      }
    }

    if (next.weeklyCalls.trim()) {
      const n = parseEuroNumber(next.weeklyCalls);
      if (n === null || !Number.isFinite(n) || n < 0) {
        errs.weeklyCalls = "Entre un nombre valide (ex: 2).";
      }
    }

    setPulseErrors(errs);
    const has = Object.values(errs).some(Boolean);
    return !has;
  }

  const priorityBadge = useMemo(() => {
    if (nextTask.priority === "high")
      return { label: "High Priority", variant: "default" as const };
    if (nextTask.priority === "low")
      return { label: "Low Priority", variant: "secondary" as const };
    return { label: "Medium Priority", variant: "outline" as const };
  }, [nextTask.priority]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30">
          <header className="h-16 border-b border-border flex items-center px-6 bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-4 flex-1">
              <h1 className="text-xl font-display font-bold">Aujourd&apos;hui</h1>
            </div>
            <Button
              variant="outline"
              onClick={() => setIsPulseOpen(true)}
              className="gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              Mettre à jour mes chiffres
            </Button>
          </header>

          <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* Hero */}
            <Card className="p-8 gradient-hero border-border/50">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-3xl font-display font-bold text-primary-foreground mb-3">
                    Ta vision stratégique
                  </h2>
                  <p className="text-primary-foreground/90 text-lg max-w-2xl">
                    Dashboard simple et actionnable : prochaine action + progrès réels.
                  </p>
                </div>
                <Brain className="w-16 h-16 text-primary-foreground/80 hidden lg:block" />
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                  <p className="text-sm text-primary-foreground/70 mb-1">
                    Objectif revenu
                  </p>
                  <p className="text-2xl font-bold text-primary-foreground">
                    {revenueGoalLabel}
                  </p>
                  <p className="text-sm text-primary-foreground/70 mt-1">
                    Estimation mensuelle à partir de tes chiffres de la semaine
                  </p>
                </div>

                <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                  <p className="text-sm text-primary-foreground/70 mb-1">
                    Progression vers l&apos;objectif
                  </p>
                  <p className="text-2xl font-bold text-primary-foreground">
                    {revenueGoalValue ? `${revenueToGoalRatio}%` : "—"}
                  </p>
                  <Progress value={revenueToGoalRatio} className="mt-3" />
                </div>

                <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                  <p className="text-sm text-primary-foreground/70 mb-1">
                    Exécution de la semaine
                  </p>
                  <p className="text-2xl font-bold text-primary-foreground">
                    {weeklyExecutionPercent}%
                  </p>
                  <Progress value={weeklyExecutionPercent} className="mt-3" />
                </div>
              </div>
            </Card>

            {/* Main grid */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Next action */}
              <Card className="p-6 lg:col-span-2">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                      <Target className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">Prochaine action recommandée</h3>
                      <p className="text-muted-foreground">
                        Concentre-toi sur 1 action à la fois.
                      </p>
                    </div>
                  </div>
                  <Badge variant={priorityBadge.variant}>{priorityBadge.label}</Badge>
                </div>

                <div className="p-6 rounded-xl bg-muted/30 border border-border/50">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="text-lg font-semibold mb-1">{nextTask.title}</h4>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          {nextTask.type}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {nextTask.dueTime}
                        </span>
                      </div>
                    </div>
                    <Button asChild className="gap-2">
                      <Link href="/strategy">
                        Commencer <ArrowRight className="w-4 h-4" />
                      </Link>
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Tipote te guide phase par phase — coche tes tâches pour voir ta progression.
                  </div>
                </div>
              </Card>

              {/* Weekly pulse */}
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl gradient-secondary flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-secondary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Progression de la semaine</h3>
                    <p className="text-sm text-muted-foreground">{weekLabel}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Revenu</span>
                      <span className="text-sm text-muted-foreground">
                        {pulsePreview.weeklyRevenue !== null
                          ? formatEuroCompact(pulsePreview.weeklyRevenue)
                          : "—"}
                      </span>
                    </div>
                    <Progress value={clampPercent(((pulsePreview.weeklyRevenue ?? 0) / 2000) * 100)} />
                  </div>

                  <div className="p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Leads</span>
                      <span className="text-sm text-muted-foreground">
                        {pulsePreview.weeklyLeads !== null ? pulsePreview.weeklyLeads : "—"}
                      </span>
                    </div>
                    <Progress value={clampPercent(((pulsePreview.weeklyLeads ?? 0) / 25) * 100)} />
                  </div>

                  <div className="p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Appels</span>
                      <span className="text-sm text-muted-foreground">
                        {pulsePreview.weeklyCalls !== null ? pulsePreview.weeklyCalls : "—"}
                      </span>
                    </div>
                    <Progress value={clampPercent(((pulsePreview.weeklyCalls ?? 0) / 5) * 100)} />
                  </div>

                  <Button variant="outline" className="w-full gap-2" onClick={() => setIsPulseOpen(true)}>
                    <Play className="w-4 h-4" />
                    Mettre à jour mes chiffres
                  </Button>
                </div>
              </Card>
            </div>

            {/* Stats */}
            <div className="grid md:grid-cols-3 gap-6">
              {stats.map((stat, idx) => {
                const Icon = stat.icon;
                return (
                  <Card key={idx} className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-semibold">{stat.label}</span>
                    </div>
                    <p className="text-3xl font-bold">{stat.value}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {stat.trend}
                    </p>
                    <Progress
                      value={
                        stat.label === "Plan stratégique"
                          ? clampPercent(Number(stat.value.replace("%", "")) || 0)
                          : stat.label === "Contenus planifiés"
                            ? clampPercent(((Number(stat.value.split("/")[0]) || 0) / 7) * 100)
                            : clampPercent(((Number(stat.value.split("/")[0]) || 0) / 7) * 100)
                      }
                      className="mt-3"
                    />
                  </Card>
                );
              })}
            </div>

            {/* Upcoming */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">À venir</h3>
                  <p className="text-muted-foreground">
                    Tes tâches et contenus planifiés (cette semaine).
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {upcoming.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <h4 className="font-semibold mb-1">{item.title}</h4>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{item.type}</span>
                        <span>{item.day}</span>
                        <span>{item.time}</span>
                      </div>
                    </div>
                    <Badge
                      variant={
                        item.status === "Terminé"
                          ? "default"
                          : item.status === "Planifié"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {item.status}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Button asChild className="flex-1 gap-2">
                  <Link href="/strategy">
                    Voir ma stratégie complète <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="flex-1 gap-2">
                  <Link href="/contents">
                    Voir mes contenus <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </Card>
          </div>

          {/* Pulse dialog */}
          <Dialog open={isPulseOpen} onOpenChange={setIsPulseOpen}>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-display font-bold">
                  Mettre à jour mes chiffres
                </DialogTitle>
                <DialogDescription>
                  Tes analytics ne sont pas connectables automatiquement : entre tes chiffres
                  de la semaine pour suivre ta progression vers ton objectif.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Revenu de la semaine</Label>
                  <Input
                    value={bizPulse.weeklyRevenue}
                    onChange={(e) =>
                      setBizPulse((p) => ({ ...p, weeklyRevenue: e.target.value }))
                    }
                    placeholder="ex: 1200, 1 200, 1.2k"
                  />
                  {pulseErrors.weeklyRevenue ? (
                    <p className="text-xs text-destructive">{pulseErrors.weeklyRevenue}</p>
                  ) : null}
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Leads générés</Label>
                    <Input
                      value={bizPulse.weeklyLeads}
                      onChange={(e) =>
                        setBizPulse((p) => ({ ...p, weeklyLeads: e.target.value }))
                      }
                      placeholder="ex: 10"
                    />
                    {pulseErrors.weeklyLeads ? (
                      <p className="text-xs text-destructive">{pulseErrors.weeklyLeads}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label>Appels / RDV</Label>
                    <Input
                      value={bizPulse.weeklyCalls}
                      onChange={(e) =>
                        setBizPulse((p) => ({ ...p, weeklyCalls: e.target.value }))
                      }
                      placeholder="ex: 2"
                    />
                    {pulseErrors.weeklyCalls ? (
                      <p className="text-xs text-destructive">{pulseErrors.weeklyCalls}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setIsPulseOpen(false)}>
                    Annuler
                  </Button>
                  <Button
                    onClick={() => {
                      const next = { ...bizPulse };
                      const ok = validatePulse(next);
                      if (!ok) return;
                      setIsPulseOpen(false);
                    }}
                  >
                    Enregistrer
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </SidebarProvider>
  );
}
