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
} from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { fetchCreditsBalance } from "@/lib/credits/client";

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
  dayLabel: string; // "Lundi", "Mardi", etc.
  dateLabel: string; // "10 fév."
  items: WeekDayItem[];
};

type WeekDayItem = {
  title: string;
  status: "done" | "in_progress" | "todo" | "scheduled";
};

type ProgressData = {
  strategyPercent: number;
  weekTasksDone: number;
  weekTasksTotal: number;
  creditsRemaining: number;
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
/*  Compact progress bar component                                     */
/* ------------------------------------------------------------------ */

function ProgressBarCompact({
  label,
  value,
  max,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
}) {
  const pct = max > 0 ? clampPercent((value / max) * 100) : 0;
  const filled = Math.round(pct / 10);
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(10 - filled);

  return (
    <div className="flex items-center gap-3 text-sm font-mono">
      <span className="w-20 text-muted-foreground truncate">{label}</span>
      <span className="text-primary tracking-wider">{bar}</span>
      <span className="text-foreground font-semibold">
        {suffix ?? `${value}/${max}`}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function TodayLovable() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [nextAction, setNextAction] = useState<NextAction | null>(null);
  const [progress, setProgress] = useState<ProgressData>({
    strategyPercent: 0,
    weekTasksDone: 0,
    weekTasksTotal: 0,
    creditsRemaining: 0,
  });
  const [weekDays, setWeekDays] = useState<WeekDay[]>([]);
  const [hasStrategy, setHasStrategy] = useState(false);
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

        // ------ Fetch credits ------
        let creditsRemaining = 0;
        try {
          const creditsData = await fetchCreditsBalance();
          creditsRemaining = creditsData.total_remaining ?? 0;
        } catch {
          // fail-open
        }

        if (cancelled) return;

        // ------ Compute data ------
        const now = new Date();
        const startW = startOfWeekMonday(now);
        const endW = endOfWeekSunday(now);

        const tasksAll = tasks;
        const tasksDone = tasksAll.filter((t) => isDoneStatus(normalizeTaskStatus(t))).length;
        const tasksTotal = tasksAll.length;
        const strategyPercent = tasksTotal ? clampPercent((tasksDone / tasksTotal) * 100) : 0;

        // Week tasks
        const weekTasks = tasksAll.filter((t) => {
          const due = normalizeTaskDueDate(t);
          if (!due) return false;
          return due >= startW && due <= endW;
        });
        const weekTasksDone = weekTasks.filter((t) => isDoneStatus(normalizeTaskStatus(t))).length;
        const weekTasksTotal = weekTasks.length;

        // Next action — the dashboard chooses for the user
        const nextTodoTask = tasksAll
          .filter((t) => !isDoneStatus(normalizeTaskStatus(t)))
          .sort((a, b) => {
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

          action = {
            title: normalizeTaskTitle(nextTodoTask),
            why: "C'est ta tâche prioritaire du moment.",
            dueLabel: dayLabel,
            href: "/tasks",
            kind: "task",
          };
        } else if (!strategyExists) {
          action = {
            title: "Générer ma stratégie",
            why: "Commence par poser les bases de ton business.",
            dueLabel: "Maintenant",
            href: "/strategy",
            kind: "strategy",
          };
        } else {
          action = {
            title: "Créer mon premier contenu",
            why: "Ta stratégie est prête. Passe à l'action.",
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
            strategyPercent,
            weekTasksDone,
            weekTasksTotal,
            creditsRemaining,
          });
          setWeekDays(days);
          setHasStrategy(strategyExists);
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

  const weekHasItems = weekDays.some((d) => d.items.length > 0);

  // Today index (0 = Monday .. 6 = Sunday)
  const todayIndex = useMemo(() => {
    const day = new Date().getDay();
    return day === 0 ? 6 : day - 1;
  }, []);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1">
          <div className="p-6 md:p-8 space-y-6 max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold">Tableau de bord</h1>
            </div>

            {loading ? (
              <div className="py-20 text-center text-muted-foreground text-sm">
                Chargement...
              </div>
            ) : (
              <>
                {/* ============================================== */}
                {/* BLOC 1 — Ta prochaine action (full width hero) */}
                {/* ============================================== */}
                {nextAction && (
                  <Card className="p-0 overflow-hidden">
                    <div className="gradient-primary p-8 text-primary-foreground">
                      <p className="text-sm font-medium text-primary-foreground/70 mb-2 uppercase tracking-wide">
                        Ta prochaine action
                      </p>
                      <h2 className="text-2xl md:text-3xl font-bold mb-2">
                        {nextAction.title}
                      </h2>
                      <p className="text-primary-foreground/80 mb-1">
                        {nextAction.why}
                      </p>
                      <p className="text-sm text-primary-foreground/60">
                        {nextAction.dueLabel}
                      </p>
                    </div>
                    <div className="p-4">
                      <Button asChild className="w-full gap-2" size="lg">
                        <Link href={nextAction.href}>
                          Commencer <ArrowRight className="w-4 h-4" />
                        </Link>
                      </Button>
                    </div>
                  </Card>
                )}

                {/* ============================================== */}
                {/* BLOC 2 — Progression rapide (compact)          */}
                {/* ============================================== */}
                <Card className="p-5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
                    Progression
                  </p>
                  <div className="space-y-2">
                    <ProgressBarCompact
                      label="Stratégie"
                      value={progress.strategyPercent}
                      max={100}
                      suffix={`${progress.strategyPercent}%`}
                    />
                    <ProgressBarCompact
                      label="Semaine"
                      value={progress.weekTasksDone}
                      max={Math.max(progress.weekTasksTotal, 1)}
                      suffix={`${progress.weekTasksDone}/${progress.weekTasksTotal}`}
                    />
                    <ProgressBarCompact
                      label="Crédits"
                      value={progress.creditsRemaining}
                      max={Math.max(progress.creditsRemaining, 1)}
                      suffix={`${progress.creditsRemaining}`}
                    />
                  </div>
                </Card>

                {/* ============================================== */}
                {/* BLOC 3 — Cette semaine (timeline)              */}
                {/* ============================================== */}
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Cette semaine
                    </p>
                  </div>

                  {weekHasItems ? (
                    <div className="space-y-1">
                      {weekDays.map((day, idx) => {
                        const isToday = idx === todayIndex;
                        if (day.items.length === 0 && !isToday) return null;

                        return (
                          <div
                            key={idx}
                            className={`rounded-lg p-3 ${
                              isToday
                                ? "bg-primary/5 border border-primary/20"
                                : ""
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`text-sm font-semibold ${
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
                              <div className="space-y-1 ml-1">
                                {day.items.map((item, iIdx) => (
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
                              <p className="text-sm text-muted-foreground ml-1">
                                Rien de planifié
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg bg-muted/30 border border-border/50 p-4 text-center">
                      <p className="text-sm text-muted-foreground mb-3">
                        Tu n&apos;as rien planifié cette semaine.
                      </p>
                      <Button asChild variant="outline" size="sm" className="gap-2">
                        <Link href="/tasks">
                          Planifier une tâche <ArrowRight className="w-3 h-3" />
                        </Link>
                      </Button>
                    </div>
                  )}
                </Card>

                {/* ============================================== */}
                {/* BLOC 4 — Lien stratégie (discret)              */}
                {/* ============================================== */}
                <div className="flex items-center justify-center">
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
