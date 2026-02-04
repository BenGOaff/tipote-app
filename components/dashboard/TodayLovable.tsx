// components/dashboard/TodayLovable.tsx
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
  ArrowRight,
  Target,
  Sparkles,
  BarChart3,
  CheckCircle2,
  Pencil,
} from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type Priority = "low" | "medium" | "high";

type NextTask = {
  title: string;
  type: string;
  platform: string;
  dueTime: string;
  priority: Priority;
  href: string;
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

function extractStarterPlan(planJson: unknown): {
  strategy_summary: string;
  strategy_goals: Array<{ title: string; why: string; metric: string; first_actions: string[] }>;
} {
  const pj: any = planJson && typeof planJson === "object" ? (planJson as any) : null;
  const summary = toStr(pj?.strategy_summary ?? pj?.summary ?? "").trim();
  const goalsRaw = Array.isArray(pj?.strategy_goals) ? pj.strategy_goals : [];
  const goals = goalsRaw
    .map((g: any) => ({
      title: toStr(g?.title).trim(),
      why: toStr(g?.why).trim(),
      metric: toStr(g?.metric).trim(),
      first_actions: Array.isArray(g?.first_actions)
        ? g.first_actions.map(toStr).map((s: string) => s.trim()).filter(Boolean).slice(0, 5)
        : [],
    }))
    .filter((g: any) => g.title);
  return { strategy_summary: summary, strategy_goals: goals };
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
  if (s === "done" || s === "completed" || s === "fait" || s === "terminé" || s === "termine")
    return "Terminé";
  if (s === "doing" || s === "in_progress" || s === "in progress" || s === "en cours")
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

function isDoneStatus(statusRaw: string): boolean {
  const s = (statusRaw || "").toLowerCase().trim();
  return s === "done" || s === "completed" || s === "fait" || s === "terminé" || s === "termine";
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

type TaskRow = Record<string, any>;
type ContentRowAny = Record<string, any>;

function normalizeContentTitle(row: ContentRowAny): string {
  return toStr(row?.title ?? row?.titre ?? row?.name ?? "Contenu").trim();
}

function normalizeContentType(row: ContentRowAny): string {
  return toStr(row?.type ?? row?.content_type ?? row?.kind ?? "Contenu").trim() || "Contenu";
}

function normalizeContentStatus(row: ContentRowAny): string {
  return toStr(row?.status ?? row?.statut ?? row?.state ?? "draft").trim();
}

function normalizeContentScheduledDate(row: ContentRowAny): Date | null {
  return parseDate(row?.scheduled_date ?? row?.date_planifiee ?? row?.scheduled_for ?? row?.date ?? null);
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

type PulseState = {
  level: number;
  label: string;
};

type FocusSettings = { focusGoal: number };

function loadPulse(userId: string): PulseState | null {
  try {
    const raw = localStorage.getItem(`tipote_pulse:${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PulseState;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.level !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePulse(userId: string, pulse: PulseState) {
  try {
    localStorage.setItem(`tipote_pulse:${userId}`, JSON.stringify(pulse));
  } catch {
    // ignore
  }
}

function loadFocusSettings(userId: string): FocusSettings | null {
  try {
    const raw = localStorage.getItem(`tipote_focus_settings:${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FocusSettings;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.focusGoal !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveFocusSettings(userId: string, settings: FocusSettings) {
  try {
    localStorage.setItem(`tipote_focus_settings:${userId}`, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function levelLabel(level: number) {
  if (level <= 1) return "Lent";
  if (level === 2) return "OK";
  if (level === 3) return "Bien";
  if (level >= 4) return "Énorme";
  return "OK";
}

function clampPulseLevel(v: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 2;
  return Math.max(1, Math.min(4, Math.round(n)));
}

function isValidGoalNumber(v: string) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
}

function parseGoalNumber(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export default function TodayLovable() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [isPulseOpen, setIsPulseOpen] = useState(false);

  const [nextTask, setNextTask] = useState<NextTask>({
    title: "Créer ta prochaine tâche",
    type: "Tâche",
    platform: "Tipote",
    dueTime: "Cette semaine",
    priority: "high",
    href: "/tasks",
  });

  const [stats, setStats] = useState<DashboardStat[]>([
    { label: "Plan stratégique", value: "0%", trend: "0/0", icon: Target },
    { label: "Contenus planifiés", value: "0/7", trend: "+0", icon: Calendar },
    { label: "Activité", value: "0/7", trend: "+0 tâche", icon: TrendingUp },
  ]);

  const [starterSummary, setStarterSummary] = useState<string>("");
  const [starterGoals, setStarterGoals] = useState<
    Array<{ title: string; why: string; metric: string; first_actions: string[] }>
  >([]);
  const [starterPlanError, setStarterPlanError] = useState<string>("");
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  const [plannedCountThisWeek, setPlannedCountThisWeek] = useState(0);
  const [tasksDoneThisWeek, setTasksDoneThisWeek] = useState(0);

  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);

  const [bizPulse, setBizPulse] = useState<PulseState>({ level: 2, label: levelLabel(2) });
  const [pulseUserId, setPulseUserId] = useState<string | null>(null);

  const [focusGoal, setFocusGoal] = useState(3);
  const [focusGoalInput, setFocusGoalInput] = useState("3");

  const [isGoalOpen, setIsGoalOpen] = useState(false);
  const [revenueGoalValue, setRevenueGoalValue] = useState<string>("");
  const [goalInput, setGoalInput] = useState("");
  const [goalError, setGoalError] = useState("");

  async function loadRevenueGoal(userId: string) {
    setGoalError("");
    try {
      const attempts = [
        { col: "revenue_goal_monthly", select: "revenue_goal_monthly" },
        { col: "target_monthly_revenue", select: "target_monthly_revenue" },
        { col: "revenue_goal", select: "revenue_goal" },
      ];

      for (const a of attempts) {
        const res = await supabase
          .from("business_profiles")
          .select(a.select)
          .eq("user_id", userId)
          .maybeSingle();

        if (!res.error) {
          const raw = (res.data as any)?.[a.col];
          const value = toStr(raw).trim();
          setRevenueGoalValue(value);
          return;
        }

        const msg = res.error.message || "";
        if (isSchemaError(msg)) continue;
        return;
      }
    } catch {
      // ignore
    }
  }

  async function saveRevenueGoal(userId: string, value: string) {
    setGoalError("");
    try {
      const isoNow = new Date().toISOString();
      const parsed = value.trim();

      const existing = await supabase
        .from("business_profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!existing.error && existing.data?.id) {
        const upd = await supabase
          .from("business_profiles")
          .update({ revenue_goal_monthly: String(parsed), updated_at: isoNow } as any)
          .eq("user_id", userId);

        if (upd.error) {
          if (isSchemaError(upd.error.message || "")) {
            setGoalError("Champ objectif indisponible côté base (schema).");
            return false;
          }
          setGoalError("Impossible d’enregistrer l’objectif (réseau/RLS).");
          return false;
        }
      } else {
        const ins = await supabase.from("business_profiles").insert({
          user_id: userId,
          revenue_goal_monthly: String(parsed),
          updated_at: isoNow,
          created_at: isoNow,
        } as any);

        if (ins.error) {
          if (isSchemaError(ins.error.message || "")) {
            setGoalError("Champ objectif indisponible côté base (schema).");
            return false;
          }
          setGoalError("Impossible d’enregistrer l’objectif (réseau/RLS).");
          return false;
        }
      }

      setRevenueGoalValue(parsed);
      return true;
    } catch {
      setGoalError("Impossible d’enregistrer l’objectif.");
      return false;
    }
  }

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

        setPulseUserId(userId);

        const fromStorage = loadPulse(userId);
        if (fromStorage) setBizPulse(fromStorage);

        const focusSettings = loadFocusSettings(userId);
        if (focusSettings?.focusGoal) {
          setFocusGoal(focusSettings.focusGoal);
          setFocusGoalInput(String(focusSettings.focusGoal));
        } else {
          setFocusGoalInput("3");
        }

        await loadRevenueGoal(userId);

        // Starter plan (business_plan.plan_json) — best-effort, non bloquant
        try {
          const { data: bpPlan, error: bpPlanErr } = await supabase
            .from("business_plan")
            .select("plan_json")
            .eq("user_id", userId)
            .maybeSingle();

          if (!bpPlanErr && bpPlan?.plan_json) {
            const extracted = extractStarterPlan((bpPlan as any).plan_json);
            if (!cancelled) {
              setStarterSummary(extracted.strategy_summary);
              setStarterGoals(extracted.strategy_goals);
            }
          }
        } catch {
          // fail-open
        }

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
        const tasksDone = tasksAll.filter((t) => isDoneStatus(normalizeTaskStatus(t))).length;
        const tasksTotal = tasksAll.length;
        const progressionPercent = tasksTotal ? clampPercent((tasksDone / tasksTotal) * 100) : 0;

        const now = new Date();
        const startW = startOfWeekMonday(now);
        const endW = endOfWeekSunday(now);

        // Content rows (schema-compat + anti-spam)
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

        const plannedThisWeek = contentRows.filter((r) => {
          const dt = normalizeContentScheduledDate(r);
          if (!dt) return false;
          return dt >= startW && dt <= endW;
        });

        const plannedCount = plannedThisWeek.length;
        setPlannedCountThisWeek(plannedCount);

        const doneThisWeek = tasksAll.filter((t) => {
          const done = isDoneStatus(normalizeTaskStatus(t));
          if (!done) return false;
          const dt =
            parseDate((t as any)?.updated_at) ||
            parseDate((t as any)?.updatedAt) ||
            parseDate((t as any)?.created_at);
          if (!dt) return false;
          return dt >= startW && dt <= endW;
        }).length;

        setTasksDoneThisWeek(doneThisWeek);

        const activityValue = `${Math.min(7, doneThisWeek)}/7`;

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

        const nextDue = nextTodoTask ? normalizeTaskDueDate(nextTodoTask) : null;

        if (!cancelled) {
          setNextTask(() => {
            if (nextTodoTask) {
              return {
                title: normalizeTaskTitle(nextTodoTask),
                type: "Tâche",
                platform: "Tipote",
                dueTime: nextDue ? formatDayLabel(nextDue, now) : "Cette semaine",
                priority: normalizeTaskPriority(nextTodoTask),
                href: "/tasks",
              };
            }

            if (plannedCount > 0) {
              return {
                title: "Planifier ton prochain contenu",
                type: "Contenu",
                platform: "Tipote",
                dueTime: "Cette semaine",
                priority: "high",
                href: "/contents",
              };
            }

            return {
              title: "Créer ta prochaine tâche",
              type: "Tâche",
              platform: "Tipote",
              dueTime: "Cette semaine",
              priority: "high",
              href: "/tasks",
            };
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
              label: "Activité",
              value: activityValue,
              trend: doneThisWeek > 0 ? `+${doneThisWeek} tâche` : "+0 tâche",
              icon: TrendingUp,
            },
          ]);

          const combined: CombinedUpcoming[] = [];

          for (const t of tasksAll) {
            const due = normalizeTaskDueDate(t);
            if (!due) continue;
            if (due < startW || due > endW) continue;
            combined.push({
              kind: "task",
              title: normalizeTaskTitle(t),
              type: "Tâche",
              statusRaw: normalizeTaskStatus(t),
              dt: due,
              priority: normalizeTaskPriority(t),
            });
          }

          for (const c of contentRows) {
            const dt = normalizeContentScheduledDate(c);
            if (!dt) continue;
            if (dt < startW || dt > endW) continue;
            combined.push({
              kind: "content",
              title: normalizeContentTitle(c),
              type: normalizeContentType(c),
              statusRaw: normalizeContentStatus(c),
              dt,
            });
          }

          combined.sort((a, b) => a.dt.getTime() - b.dt.getTime());

          const upcomingUi: UpcomingItem[] = combined.slice(0, 10).map((x) => {
            if (x.kind === "task") {
              const statusUi = mapTaskStatusToUi(x.statusRaw);
              return {
                title: x.title,
                type: x.type,
                day: formatDayLabel(x.dt, now),
                time: formatTimeOrDash(x.dt),
                status: statusUi,
              };
            }

            const statusUi = mapContentStatusToUi(x.statusRaw);
            return {
              title: x.title,
              type: x.type,
              day: formatDayLabel(x.dt, now),
              time: formatTimeOrDash(x.dt),
              status: statusUi,
            };
          });

          setUpcoming(upcomingUi);
        }
      } catch {
        // ignore
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!pulseUserId) return;
    savePulse(pulseUserId, bizPulse);
  }, [bizPulse, pulseUserId]);

  useEffect(() => {
    if (!pulseUserId) return;
    saveFocusSettings(pulseUserId, { focusGoal });
  }, [focusGoal, pulseUserId]);

  const weekLabel = useMemo(() => {
    return formatWeekRangeLabel(new Date());
  }, []);

  const pulsePercent = useMemo(() => {
    return clampPercent((bizPulse.level / 4) * 100);
  }, [bizPulse.level]);

  const focusPercent = useMemo(() => {
    return clampPercent((Math.min(7, tasksDoneThisWeek) / Math.max(1, focusGoal)) * 100);
  }, [tasksDoneThisWeek, focusGoal]);

  const refreshStarterPlan = async (userId: string) => {
    try {
      const { data: bpPlan, error: bpPlanErr } = await supabase
        .from("business_plan")
        .select("plan_json")
        .eq("user_id", userId)
        .maybeSingle();

      if (bpPlanErr) throw bpPlanErr;

      const extracted = extractStarterPlan((bpPlan as any)?.plan_json);
      setStarterSummary(extracted.strategy_summary);
      setStarterGoals(extracted.strategy_goals);
      setStarterPlanError("");
    } catch (e: any) {
      setStarterPlanError("Impossible de charger ton plan de départ.");
    }
  };

  const generateStarterPlan = async () => {
    if (isGeneratingPlan) return;
    setIsGeneratingPlan(true);
    setStarterPlanError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userId = user?.id;
      if (!userId) throw new Error("Not authenticated");

      const r = await fetch("/api/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });

      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as any)?.error || "Erreur génération stratégie");
      }

      await refreshStarterPlan(userId);
    } catch (e: any) {
      setStarterPlanError(e?.message || "Impossible de générer le plan.");
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1">
          <div className="p-6 md:p-8 space-y-8">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <div>
                <h1 className="text-3xl font-bold">Aujourd&apos;hui</h1>
                <p className="text-muted-foreground">{weekLabel}</p>
              </div>
            </div>

            {/* Hero */}
            <div className="grid lg:grid-cols-2 gap-8">
              <Card className="p-8 gradient-primary text-primary-foreground">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold mb-2">Ta prochaine action</h2>
                    <p className="text-primary-foreground/80 mb-6">
                      Reste focus : une seule action à la fois.
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
                    <Brain className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-primary-foreground/10 rounded-xl p-6 mb-6">
                  <h3 className="text-xl font-semibold mb-2">{nextTask.title}</h3>
                  <div className="flex items-center gap-4 text-primary-foreground/80">
                    <span className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      {nextTask.type}
                    </span>
                    <span>{nextTask.dueTime}</span>
                  </div>
                </div>

                <Button asChild variant="secondary" className="w-full gap-2">
                  <Link href={nextTask.href}>
                    Commencer maintenant <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </Card>

              <Card className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold mb-2">Ton focus</h2>
                    <p className="text-muted-foreground">
                      {tasksDoneThisWeek}/{focusGoal} tâches cette semaine
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Target className="w-6 h-6 text-primary" />
                  </div>
                </div>

                <Progress value={focusPercent} className="mb-6" />

                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-medium">Objectif (tâches / semaine)</div>
                  <div className="text-sm text-muted-foreground">0–7</div>
                </div>

                <Input
                  value={focusGoalInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFocusGoalInput(v);
                    if (isValidGoalNumber(v)) setFocusGoal(parseGoalNumber(v));
                  }}
                  className="mb-6"
                  inputMode="numeric"
                />

                <div className="grid grid-cols-2 gap-4">
                  <Button asChild variant="outline" className="gap-2">
                    <Link href="/tasks">Voir mes tâches</Link>
                  </Button>
                  <Button asChild variant="outline" className="h-8">
                    <Link href="/contents">Voir mes contenus</Link>
                  </Button>
                </div>
              </Card>
            </div>

            {/* Stats */}
            <div className="grid md:grid-cols-3 gap-6">
              {stats.map((stat, i) => (
                <Card key={i} className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <stat.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                      <p className="text-3xl font-bold">{stat.value}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{stat.trend}</p>
                  <Progress
                    value={
                      stat.label === "Plan stratégique"
                        ? Number(stat.value.replace("%", "")) || 0
                        : clampPercent((Number(stat.value.split("/")[0] || 0) / 7) * 100)
                    }
                    className="mt-3"
                  />
                </Card>
              ))}
            </div>

            {/* Starter plan */}
            <Card className="p-6">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Brain className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Ton plan de départ</h3>
                    <p className="text-muted-foreground">
                      Une base simple et actionnable pour démarrer (générée depuis ton onboarding).
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={generateStarterPlan}
                  disabled={isGeneratingPlan}
                >
                  <Sparkles className="w-4 h-4" />
                  {isGeneratingPlan ? "Génération…" : "Régénérer"}
                </Button>
              </div>

              {starterPlanError ? (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  {starterPlanError}
                </div>
              ) : null}

              {starterSummary || starterGoals.length ? (
                <div className="space-y-5">
                  {starterSummary ? (
                    <div className="rounded-lg bg-muted/30 p-4">
                      <p className="text-sm whitespace-pre-wrap">{starterSummary}</p>
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-3">
                    {starterGoals.slice(0, 3).map((g, idx) => (
                      <div key={idx} className="rounded-xl border border-border/50 bg-background p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <p className="font-semibold leading-snug">{g.title}</p>
                          <Badge variant="secondary" className="shrink-0">
                            Objectif
                          </Badge>
                        </div>

                        {g.why ? <p className="text-sm text-muted-foreground mb-3">{g.why}</p> : null}

                        {g.metric ? (
                          <div className="text-xs text-muted-foreground mb-3">
                            <span className="font-medium text-foreground">Mesure :</span> {g.metric}
                          </div>
                        ) : null}

                        {g.first_actions?.length ? (
                          <ul className="space-y-2 text-sm">
                            {g.first_actions.slice(0, 3).map((a, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary" />
                                <span>{a}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button asChild className="flex-1 gap-2">
                      <Link href="/strategy">
                        Voir ma stratégie <ArrowRight className="w-4 h-4" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="flex-1 gap-2">
                      <Link href="/tasks">
                        Créer mes premières tâches <ArrowRight className="w-4 h-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-muted/30 border border-border/50 p-4">
                  <p className="font-semibold mb-1">Ton plan arrive</p>
                  <p className="text-sm text-muted-foreground">
                    Clique sur <span className="font-medium text-foreground">Régénérer</span> pour générer ton plan de départ
                    depuis ton onboarding.
                  </p>
                </div>
              )}
            </Card>

            {/* Upcoming */}
            <Card className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">À venir</h3>
                  <p className="text-muted-foreground">Tes tâches et contenus planifiés (cette semaine).</p>
                </div>
              </div>

              <div className="space-y-3">
                {upcoming.length ? (
                  upcoming.map((item, index) => (
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
                  ))
                ) : (
                  <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                    <p className="font-semibold mb-1">Rien de planifié cette semaine</p>
                    <p className="text-sm text-muted-foreground">
                      Ajoute une tâche ou planifie un contenu pour voir ton planning ici.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Button asChild className="flex-1 gap-2">
                  <Link href="/strategy">
                    Voir ma stratégie complète <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="flex-1 gap-2">
                  <Link href="/calendar">
                    Voir mon calendrier <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </Card>

            {/* Pulse */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Pulse du business</h3>
                    <p className="text-muted-foreground">Comment tu te sens cette semaine ?</p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setIsPulseOpen(true)}>
                  Modifier
                </Button>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Progress value={pulsePercent} />
                </div>
                <Badge variant="secondary">{bizPulse.label}</Badge>
              </div>
            </Card>

            <Dialog open={isPulseOpen} onOpenChange={setIsPulseOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Pulse du business</DialogTitle>
                  <DialogDescription>Dis-nous ton niveau d’énergie / avance cette semaine.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Niveau (1–4)</Label>
                    <Input
                      value={String(bizPulse.level)}
                      inputMode="numeric"
                      onChange={(e) => {
                        const n = clampPulseLevel(Number(e.target.value));
                        setBizPulse({ level: n, label: levelLabel(n) });
                      }}
                    />
                  </div>
                  <Button onClick={() => setIsPulseOpen(false)}>OK</Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isGoalOpen} onOpenChange={setIsGoalOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Objectif revenu</DialogTitle>
                  <DialogDescription>Modifie ton objectif (mensuel) à tout moment.</DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Objectif (ex: 3000€)</Label>
                    <Input value={goalInput} onChange={(e) => setGoalInput(e.target.value)} />
                    {goalError ? <p className="text-sm text-destructive">{goalError}</p> : null}
                  </div>

                  <div className="flex gap-3">
                    <Button
                      className="flex-1"
                      onClick={async () => {
                        const {
                          data: { user },
                        } = await supabase.auth.getUser();
                        const userId = user?.id;
                        if (!userId) return;

                        const ok = await saveRevenueGoal(userId, goalInput);
                        if (ok) setIsGoalOpen(false);
                      }}
                    >
                      Enregistrer
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => setIsGoalOpen(false)}>
                      Annuler
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Revenue goal widget (Lovable) */}
            <Card className="p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Objectif revenu</p>
                  <p className="text-2xl font-bold">{revenueGoalValue ? revenueGoalValue : "—"}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 gap-2"
                  onClick={() => {
                    setGoalError("");
                    setGoalInput(revenueGoalValue ? String(revenueGoalValue) : goalInput || "");
                    setIsGoalOpen(true);
                  }}
                >
                  <Pencil className="w-4 h-4" />
                  Modifier
                </Button>
              </div>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
