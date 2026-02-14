// components/dashboard/TodayLovable.tsx
// Dashboard "Mode Pilote" — 4 blocs max, le dashboard choisit pour l'utilisateur.
"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  ArrowRight,
  Play,
  CheckCircle2,
  Clock,
  CalendarDays,
  ChevronRight,
  Zap,
  BarChart3,
  FileText,
} from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Priority = "low" | "medium" | "high";

type NextAction = {
  title: string;
  why: string;
  dueLabel: string;
  href: string;
  kind: "task" | "strategy" | "content";
};

type WeekDay = {
  dayLabel: string;
  dateLabel: string;
  items: WeekDayItem[];
};

type WeekDayItem = {
  title: string;
  status: "done" | "in_progress" | "todo" | "scheduled";
};

type ProgressData = {
  weekTasksDone: number;
  weekTasksTotal: number;
  totalTasks: number;
  contentCounts: Record<string, number>; // { post: 3, article: 2, quiz: 1, ... }
  totalContents: number;
  // Business KPIs (latest month from metrics table)
  revenue: number | null;
  salesCount: number | null;
  newSubscribers: number | null;
  conversionRate: number | null;
  hasMetrics: boolean;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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
  const day = x.getDay();
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

function safePriority(v: unknown): Priority {
  const s = toStr(v).toLowerCase().trim();
  if (s === "high") return "high";
  if (s === "low") return "low";
  return "medium";
}

function isDoneStatus(statusRaw: string): boolean {
  const s = (statusRaw || "").toLowerCase().trim();
  return s === "done" || s === "completed" || s === "fait" || s === "terminé" || s === "termine";
}

function isInProgressStatus(statusRaw: string): boolean {
  const s = (statusRaw || "").toLowerCase().trim();
  return s === "doing" || s === "in_progress" || s === "in progress" || s === "en cours";
}

function isScheduledStatus(statusRaw: string): boolean {
  const s = (statusRaw || "").toLowerCase().trim();
  return s === "scheduled" || s === "planifié" || s === "planifie";
}

function normalizeTaskTitle(row: any): string {
  return toStr(row?.title ?? row?.task ?? row?.name ?? "").trim() || "Tâche";
}

function normalizeTaskStatus(row: any): string {
  return toStr(row?.status ?? row?.state ?? row?.statut ?? "").trim();
}

function normalizeTaskPriority(row: any): Priority {
  return safePriority(row?.priority ?? row?.importance ?? "medium");
}

function normalizeTaskDueDate(row: any): Date | null {
  return parseDate(row?.due_date ?? row?.scheduled_for ?? row?.date ?? row?.scheduledDate ?? null);
}

function normalizeContentTitle(row: any): string {
  return toStr(row?.title ?? row?.titre ?? row?.name ?? "Contenu").trim();
}

function normalizeContentType(row: any): string {
  return toStr(row?.type ?? row?.content_type ?? row?.kind ?? "").trim().toLowerCase();
}

function normalizeContentStatus(row: any): string {
  return toStr(row?.status ?? row?.statut ?? row?.state ?? "draft").trim();
}

function normalizeContentScheduledDate(row: any): Date | null {
  return parseDate(row?.scheduled_date ?? row?.date_planifiee ?? row?.scheduled_for ?? row?.date ?? null);
}

function isSchemaError(msg: string) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("column") ||
    m.includes("does not exist") ||
    m.includes("unknown column") ||
    m.includes("invalid input") ||
    m.includes("schema") ||
    m.includes("relation") ||
    m.includes("could not find")
  );
}

function isObjectArray(v: unknown): v is Record<string, any>[] {
  return Array.isArray(v) && v.every((x) => !!x && typeof x === "object" && !Array.isArray(x));
}

function isGenericStringErrorArray(v: unknown): boolean {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

type ContentSchemaHint = { hasUserId?: boolean; selectIndex?: number };

function loadContentSchemaHint(userId: string): ContentSchemaHint | null {
  try {
    const raw = localStorage.getItem(`tipote_content_schema_hint:${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ContentSchemaHint;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveContentSchemaHint(userId: string, hint: ContentSchemaHint) {
  try {
    localStorage.setItem(`tipote_content_schema_hint:${userId}`, JSON.stringify(hint));
  } catch {
    // ignore
  }
}

type TaskRow = Record<string, any>;
type ContentRowAny = Record<string, any>;

/** Detect if a task title suggests content creation */
function isContentRelatedTask(title: string): boolean {
  const t = title.toLowerCase();
  return (
    t.includes("post") ||
    t.includes("contenu") ||
    t.includes("article") ||
    t.includes("newsletter") ||
    t.includes("email") ||
    t.includes("vidéo") ||
    t.includes("video") ||
    t.includes("reel") ||
    t.includes("story") ||
    t.includes("linkedin") ||
    t.includes("instagram") ||
    t.includes("twitter") ||
    t.includes("tiktok") ||
    t.includes("rédiger") ||
    t.includes("publier") ||
    t.includes("écrire")
  );
}

/** Capitalize first letter */
function ucFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Pluralize a French content type label */
function pluralLabel(type: string, count: number): string {
  const label = ucFirst(type);
  if (count <= 1) return `${count} ${label}`;
  // Simple French plural
  if (label.endsWith("s") || label.endsWith("x") || label.endsWith("z")) {
    return `${count} ${label}`;
  }
  return `${count} ${label}s`;
}

/* ------------------------------------------------------------------ */
/*  Day-of-week helpers                                                */
/* ------------------------------------------------------------------ */

const DAYS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

function buildWeekDays(
  now: Date,
  tasks: TaskRow[],
  contentRows: ContentRowAny[],
): WeekDay[] {
  const monday = startOfWeekMonday(now);
  const days: WeekDay[] = [];

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + i);
    const dayStart = startOfDay(dayDate);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const items: WeekDayItem[] = [];

    for (const t of tasks) {
      const due = normalizeTaskDueDate(t);
      if (!due || due < dayStart || due > dayEnd) continue;
      const statusRaw = normalizeTaskStatus(t);
      items.push({
        title: normalizeTaskTitle(t),
        status: isDoneStatus(statusRaw)
          ? "done"
          : isInProgressStatus(statusRaw)
            ? "in_progress"
            : "todo",
      });
    }

    for (const c of contentRows) {
      const dt = normalizeContentScheduledDate(c);
      if (!dt || dt < dayStart || dt > dayEnd) continue;
      const statusRaw = normalizeContentStatus(c);
      items.push({
        title: normalizeContentTitle(c),
        status: isDoneStatus(statusRaw)
          ? "done"
          : isScheduledStatus(statusRaw)
            ? "scheduled"
            : "todo",
      });
    }

    days.push({
      dayLabel: DAYS_FR[i],
      dateLabel: dateFmt.format(dayDate),
      items,
    });
  }

  return days;
}

/* ------------------------------------------------------------------ */
/*  Status icon for timeline                                           */
/* ------------------------------------------------------------------ */

function StatusIcon({ status }: { status: WeekDayItem["status"] }) {
  if (status === "done") {
    return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
  }
  if (status === "in_progress") {
    return <Play className="w-4 h-4 text-blue-500 shrink-0" />;
  }
  if (status === "scheduled") {
    return <Clock className="w-4 h-4 text-amber-500 shrink-0" />;
  }
  return <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function TodayLovable() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [nextAction, setNextAction] = useState<NextAction | null>(null);
  const [progress, setProgress] = useState<ProgressData>({
    weekTasksDone: 0,
    weekTasksTotal: 0,
    totalTasks: 0,
    contentCounts: {},
    totalContents: 0,
    revenue: null,
    salesCount: null,
    newSubscribers: null,
    conversionRate: null,
    hasMetrics: false,
  });
  const [weekDays, setWeekDays] = useState<WeekDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user?.id) return;
        const userId = user.id;
        if (cancelled) return;

        // ------ Fetch tasks via API ------
        const tasksRes = await fetch("/api/tasks", { cache: "no-store" })
          .then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => null) }))
          .catch(() => ({ ok: false, json: null as any }));

        const tasks: TaskRow[] = Array.isArray((tasksRes as any).json?.tasks)
          ? ((tasksRes as any).json.tasks as TaskRow[])
          : Array.isArray((tasksRes as any).json)
            ? ((tasksRes as any).json as TaskRow[])
            : [];

        // ------ Fetch content rows ------
        const attempts: { select: string; orderCol: string }[] = [
          { select: "id,title,content,status,channel,scheduled_date,created_at,type,user_id", orderCol: "scheduled_date" },
          { select: "id,titre,contenu,statut,canal,date_planifiee,created_at,type,user_id", orderCol: "date_planifiee" },
          { select: "id,title,content,status,created_at,type,user_id", orderCol: "created_at" },
          { select: "id,title,content,status,channel,scheduled_date,created_at,type", orderCol: "scheduled_date" },
          { select: "id,titre,contenu,statut,canal,date_planifiee,created_at,type", orderCol: "date_planifiee" },
          { select: "id,title,content,status,created_at,type", orderCol: "created_at" },
        ];

        const hint = loadContentSchemaHint(userId) || {};

        async function loadContentRows(): Promise<unknown[]> {
          const startIndex = typeof hint.selectIndex === "number" ? hint.selectIndex : 0;
          for (let offset = 0; offset < attempts.length; offset++) {
            const i = (startIndex + offset) % attempts.length;
            const a = attempts[i];
            const includesUserId = a.select.includes("user_id");
            if (hint.hasUserId === false && includesUserId) continue;

            let q = supabase
              .from("content_item")
              .select(a.select)
              .order(a.orderCol as any, { ascending: true, nullsFirst: false })
              .limit(300);

            if (includesUserId && hint.hasUserId !== false) {
              q = q.eq("user_id", userId);
            }

            const res = await q;
            if (!res.error) {
              saveContentSchemaHint(userId, {
                hasUserId: includesUserId ? true : hint.hasUserId,
                selectIndex: i,
              });
              return Array.isArray(res.data) ? (res.data as unknown[]) : [];
            }

            const msg = res.error.message || "";
            if (isSchemaError(msg) && msg.toLowerCase().includes("user_id")) {
              saveContentSchemaHint(userId, { ...hint, hasUserId: false, selectIndex: i });
              continue;
            }
            if (isSchemaError(msg)) continue;
            return [];
          }
          return [];
        }

        const rawContentRows = await loadContentRows();
        const contentRows: ContentRowAny[] = (() => {
          if (isGenericStringErrorArray(rawContentRows)) return [];
          if (isObjectArray(rawContentRows)) return rawContentRows as ContentRowAny[];
          return [];
        })();

        // ------ Fetch business_plan ------
        let strategyExists = false;
        try {
          const { data: bpPlan, error: bpPlanErr } = await supabase
            .from("business_plan")
            .select("plan_json")
            .eq("user_id", userId)
            .maybeSingle();

          if (!bpPlanErr && bpPlan?.plan_json) {
            strategyExists = true;
          }
        } catch {
          // fail-open
        }

        // ------ Fetch latest metrics (business KPIs) ------
        let revenue: number | null = null;
        let salesCount: number | null = null;
        let newSubscribers: number | null = null;
        let conversionRate: number | null = null;
        let hasMetrics = false;

        try {
          const { data: metricsRows, error: metricsErr } = await supabase
            .from("metrics")
            .select("revenue,sales_count,new_subscribers,conversion_rate")
            .eq("user_id", userId)
            .order("month", { ascending: false })
            .limit(1);

          if (!metricsErr && metricsRows && metricsRows.length > 0) {
            const m = metricsRows[0] as any;
            revenue = typeof m.revenue === "number" ? m.revenue : null;
            salesCount = typeof m.sales_count === "number" ? m.sales_count : null;
            newSubscribers = typeof m.new_subscribers === "number" ? m.new_subscribers : null;
            conversionRate = typeof m.conversion_rate === "number" ? m.conversion_rate : null;
            hasMetrics = revenue !== null || salesCount !== null || newSubscribers !== null;
          }
        } catch {
          // fail-open — metrics table may not exist
        }

        if (cancelled) return;

        // ------ Compute data ------
        const now = new Date();
        const startW = startOfWeekMonday(now);
        const endW = endOfWeekSunday(now);

        const tasksAll = tasks;
        const tasksTotal = tasksAll.length;

        // Week tasks
        const weekTasks = tasksAll.filter((t: TaskRow) => {
          const due = normalizeTaskDueDate(t);
          if (!due) return false;
          return due >= startW && due <= endW;
        });
        const weekTasksDone = weekTasks.filter((t: TaskRow) => isDoneStatus(normalizeTaskStatus(t))).length;
        const weekTasksTotal = weekTasks.length;

        // Content counts by type
        const contentCounts: Record<string, number> = {};
        let totalContents = 0;
        for (const c of contentRows) {
          totalContents++;
          const cType = normalizeContentType(c) || "contenu";
          contentCounts[cType] = (contentCounts[cType] || 0) + 1;
        }

        // Next action — the dashboard chooses for the user
        const nextTodoTask = tasksAll
          .filter((t: TaskRow) => !isDoneStatus(normalizeTaskStatus(t)))
          .sort((a: TaskRow, b: TaskRow) => {
            const da = normalizeTaskDueDate(a)?.getTime() ?? Number.POSITIVE_INFINITY;
            const db = normalizeTaskDueDate(b)?.getTime() ?? Number.POSITIVE_INFINITY;
            if (da !== db) return da - db;
            const pa = normalizeTaskPriority(a);
            const pb = normalizeTaskPriority(b);
            const w = { high: 0, medium: 1, low: 2 } as const;
            return w[pa] - w[pb];
          })[0];

        let action: NextAction;

        if (nextTodoTask) {
          const taskTitle = normalizeTaskTitle(nextTodoTask);
          const due = normalizeTaskDueDate(nextTodoTask);
          const dayLabel = due
            ? (() => {
                const d0 = startOfDay(due).getTime();
                const n0 = startOfDay(now).getTime();
                const diff = Math.round((d0 - n0) / 86400000);
                if (diff === 0) return "Aujourd'hui";
                if (diff === 1) return "Demain";
                if (diff > 1 && diff < 7) return DAYS_FR[due.getDay() === 0 ? 6 : due.getDay() - 1];
                return dateFmt.format(due);
              })()
            : "Cette semaine";

          const href = isContentRelatedTask(taskTitle) ? "/create" : "/tasks";

          action = {
            title: taskTitle,
            why: "C'est ta prochaine tâche prioritaire. Concentre-toi dessus avant de passer au reste.",
            dueLabel: dayLabel,
            href,
            kind: "task",
          };
        } else if (!strategyExists) {
          action = {
            title: "Générer ma stratégie",
            why: "Tu n'as pas encore de plan d'action. Crée ta stratégie pour savoir exactement quoi faire.",
            dueLabel: "Maintenant",
            href: "/strategy",
            kind: "strategy",
          };
        } else if (tasksTotal === 0) {
          action = {
            title: "Créer ma première tâche",
            why: "Ta stratégie est prête. Transforme-la en actions concrètes en ajoutant tes premières tâches.",
            dueLabel: "Maintenant",
            href: "/tasks",
            kind: "task",
          };
        } else {
          action = {
            title: "Créer un nouveau contenu",
            why: "Toutes tes tâches sont terminées. Continue sur ta lancée en créant du contenu.",
            dueLabel: "Maintenant",
            href: "/create",
            kind: "content",
          };
        }

        // Week timeline
        const days = buildWeekDays(now, tasksAll, contentRows);

        if (!cancelled) {
          setNextAction(action);
          setProgress({
            weekTasksDone,
            weekTasksTotal,
            totalTasks: tasksTotal,
            contentCounts,
            totalContents,
            revenue,
            salesCount,
            newSubscribers,
            conversionRate,
            hasMetrics,
          });
          setWeekDays(days);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const weekHasItems = weekDays.some((d: WeekDay) => d.items.length > 0);

  const todayIndex = useMemo(() => {
    const day = new Date().getDay();
    return day === 0 ? 6 : day - 1;
  }, []);

  // Build content summary string: "7 posts, 3 articles, 1 quiz"
  const contentSummary = useMemo(() => {
    const entries = Object.entries(progress.contentCounts)
      .sort((a, b) => b[1] - a[1]) // most frequent first
      .slice(0, 4); // max 4 types shown
    if (entries.length === 0) return null;
    return entries.map(([type, count]) => pluralLabel(type, count)).join(", ");
  }, [progress.contentCounts]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto bg-muted/30">
          <header className="h-16 border-b border-border flex items-center px-6 bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-4 flex-1">
              <h1 className="text-xl font-display font-bold">Tableau de bord</h1>
            </div>
          </header>

          <div className="p-6 space-y-6 max-w-6xl mx-auto">
            {loading ? (
              <div className="py-20 text-center text-muted-foreground text-sm">
                Chargement...
              </div>
            ) : (
              <>
                {/* ================================================= */}
                {/* BLOC 1 — Ta prochaine action (barre horizontale)   */}
                {/* ================================================= */}
                {nextAction && (
                  <Card className="gradient-primary text-primary-foreground overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-center gap-4 p-5 md:p-6">
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="w-10 h-10 rounded-lg bg-primary-foreground/20 flex items-center justify-center">
                          <Zap className="w-5 h-5" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-primary-foreground/60 uppercase tracking-wide mb-0.5">
                          Ta prochaine action
                        </p>
                        <h2 className="text-lg md:text-xl font-bold truncate">
                          {nextAction.title}
                        </h2>
                        <p className="text-sm text-primary-foreground/70 mt-0.5 line-clamp-1">
                          {nextAction.why}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge
                          variant="secondary"
                          className="bg-primary-foreground/15 text-primary-foreground border-0 text-xs"
                        >
                          {nextAction.dueLabel}
                        </Badge>
                        <Button asChild variant="secondary" className="gap-2 shrink-0">
                          <Link href={nextAction.href}>
                            Commencer <ArrowRight className="w-4 h-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}

                {/* ================================================= */}
                {/* BLOC 2+3 — Progression + Cette semaine (côte à côte) */}
                {/* ================================================= */}
                <div className="grid md:grid-cols-2 gap-6">

                  {/* --- Progression --- */}
                  <Card className="p-5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
                      Progression
                    </p>

                    <div className="space-y-4">
                      {/* Tâches effectuées */}
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold">
                            Tâches effectuées cette semaine
                          </p>
                          <p className="text-2xl font-bold tabular-nums">
                            {progress.weekTasksDone}
                            <span className="text-base font-normal text-muted-foreground">
                              /{progress.weekTasksTotal}
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Contenus créés */}
                      <div className="flex items-start gap-3">
                        <FileText className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold">Contenus créés</p>
                          {contentSummary ? (
                            <p className="text-sm text-muted-foreground">{contentSummary}</p>
                          ) : (
                            <p className="text-sm text-muted-foreground">Aucun contenu pour le moment</p>
                          )}
                        </div>
                      </div>

                      {/* Business KPIs */}
                      {progress.hasMetrics ? (
                        <div className="flex items-start gap-3">
                          <BarChart3 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold">Résultats business</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-0.5">
                              {progress.revenue !== null && (
                                <span>{progress.revenue.toLocaleString("fr-FR")}€ CA</span>
                              )}
                              {progress.salesCount !== null && (
                                <span>{progress.salesCount} vente{progress.salesCount > 1 ? "s" : ""}</span>
                              )}
                              {progress.newSubscribers !== null && (
                                <span>{progress.newSubscribers} inscrit{progress.newSubscribers > 1 ? "s" : ""}</span>
                              )}
                              {progress.conversionRate !== null && (
                                <span>{progress.conversionRate.toFixed(1)}% conversion</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <BarChart3 className="w-4 h-4 text-muted-foreground/50 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Pas encore de données business
                            </p>
                          </div>
                        </div>
                      )}

                      <Button asChild variant="outline" size="sm" className="w-full gap-2 mt-1">
                        <Link href="/analytics">
                          Mettre à jour mes statistiques <ArrowRight className="w-3 h-3" />
                        </Link>
                      </Button>
                    </div>
                  </Card>

                  {/* --- Cette semaine --- */}
                  <Card className="p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <CalendarDays className="w-4 h-4 text-muted-foreground" />
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Cette semaine
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Tes tâches et contenus planifiés jour par jour.
                    </p>

                    {weekHasItems ? (
                      <div className="space-y-1 max-h-[280px] overflow-y-auto">
                        {weekDays.map((day: WeekDay, idx: number) => {
                          const isToday = idx === todayIndex;
                          if (day.items.length === 0 && !isToday) return null;

                          return (
                            <div
                              key={idx}
                              className={`rounded-lg p-2.5 ${
                                isToday
                                  ? "bg-primary/5 border border-primary/20"
                                  : ""
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-0.5">
                                <span
                                  className={`text-xs font-semibold ${
                                    isToday ? "text-primary" : "text-foreground"
                                  }`}
                                >
                                  {day.dayLabel}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {day.dateLabel}
                                </span>
                                {isToday && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    Aujourd&apos;hui
                                  </Badge>
                                )}
                              </div>

                              {day.items.length > 0 ? (
                                <div className="space-y-0.5 ml-1">
                                  {day.items.map((item: WeekDayItem, iIdx: number) => (
                                    <div
                                      key={iIdx}
                                      className="flex items-center gap-2 text-sm"
                                    >
                                      <StatusIcon status={item.status} />
                                      <span
                                        className={
                                          item.status === "done"
                                            ? "line-through text-muted-foreground"
                                            : "text-foreground"
                                        }
                                      >
                                        {item.title}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground ml-1">
                                  Rien de planifié
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-lg bg-muted/30 border border-border/50 p-4 text-center">
                        {progress.totalTasks > 0 ? (
                          <>
                            <p className="text-sm text-muted-foreground mb-2">
                              Tes tâches existent mais ne sont pas encore planifiées cette semaine.
                            </p>
                            <Button asChild variant="outline" size="sm" className="gap-2">
                              <Link href="/tasks">
                                Ajouter des dates <ArrowRight className="w-3 h-3" />
                              </Link>
                            </Button>
                          </>
                        ) : (
                          <>
                            <p className="text-sm text-muted-foreground mb-2">
                              Aucune tâche pour le moment.
                            </p>
                            <Button asChild variant="outline" size="sm" className="gap-2">
                              <Link href="/tasks">
                                Créer une tâche <ArrowRight className="w-3 h-3" />
                              </Link>
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </Card>
                </div>

                {/* ================================================= */}
                {/* BLOC 4 — Lien stratégie (discret)                  */}
                {/* ================================================= */}
                <div className="flex items-center justify-center pt-2">
                  <Link
                    href="/strategy"
                    className="group flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Voir ma stratégie complète
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}