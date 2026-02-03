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
  return "Planifié";
}

function isSchemaError(msg: string): boolean {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("column") ||
    m.includes("does not exist") ||
    m.includes("unknown column") ||
    m.includes("invalid input syntax") ||
    m.includes("relation") ||
    m.includes("schema") ||
    m.includes("cannot cast")
  );
}

function formatEuroCompact(amount: number): string {
  const fmt = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
  return fmt.format(amount);
}

function parseEuroNumber(raw: unknown): number | null {
  const s = toStr(raw).trim();
  if (!s) return null;

  const normalized = s
    .toLowerCase()
    .replace(/\s/g, "")
    .replace("€", "")
    .replace(",", ".")
    .replace(/k$/, "000");

  const num = Number(normalized);
  return Number.isFinite(num) ? Math.round(num) : null;
}

type BizPulse = {
  weeklyRevenue: string;
  weeklyLeads: string;
  weeklySales: string;
  weeklyCalls?: string; // legacy support
};

type PulseField = "weeklyRevenue" | "weeklyLeads" | "weeklySales";

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

    const legacyCalls = typeof (json as any).weeklyCalls === "string" ? (json as any).weeklyCalls : "";
    const weeklySales =
      typeof (json as any).weeklySales === "string"
        ? (json as any).weeklySales
        : legacyCalls;

    return {
      weeklyRevenue: typeof json.weeklyRevenue === "string" ? json.weeklyRevenue : "",
      weeklyLeads: typeof json.weeklyLeads === "string" ? json.weeklyLeads : "",
      weeklySales,
      weeklyCalls: legacyCalls || undefined,
    };
  } catch {
    return null;
  }
}

function savePulse(userId: string, pulse: BizPulse) {
  if (!userId) return;
  try {
    const { weeklyCalls, ...rest } = pulse;
    localStorage.setItem(storageKey(userId), JSON.stringify(rest));
  } catch {
    // ignore
  }
}

type FocusSettings = { focusGoal: number };

function focusStorageKey(userId: string) {
  return `tipote:dashboard:focus:${userId}`;
}

function loadFocusSettings(userId: string): FocusSettings | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(focusStorageKey(userId));
    if (!raw) return null;
    const json = JSON.parse(raw) as Partial<FocusSettings> | null;
    if (!json || typeof json !== "object") return null;
    const n = typeof json.focusGoal === "number" ? json.focusGoal : null;
    if (!n || !Number.isFinite(n)) return null;
    const safe = Math.max(1, Math.min(14, Math.round(n)));
    return { focusGoal: safe };
  } catch {
    return null;
  }
}

function saveFocusSettings(userId: string, settings: FocusSettings) {
  if (!userId) return;
  try {
    localStorage.setItem(focusStorageKey(userId), JSON.stringify(settings));
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
  updated_at?: string | null;
  created_at?: string | null;
};

function normalizeTaskTitle(t: any): string {
  const v = toStr(t?.title ?? t?.name ?? t?.label ?? "").trim();
  return v || "Tâche";
}

function normalizeTaskStatus(t: any): string {
  return toStr(t?.status ?? t?.state ?? "").trim();
}

function normalizeTaskDueDate(t: any): Date | null {
  return parseDate(t?.due_date ?? t?.dueDate ?? t?.due_at ?? t?.dueAt ?? "");
}

function normalizeTaskPriority(t: any): Priority {
  return safePriority(t?.priority);
}

function isDoneStatus(status: string): boolean {
  const s = (status || "").toLowerCase();
  return s === "done" || s === "completed" || s === "fait" || s === "terminé" || s === "termine";
}

function normalizeContentTitle(r: any): string {
  const v = toStr(r?.title ?? r?.titre ?? r?.name ?? "").trim();
  return v || "Contenu";
}

function normalizeContentType(r: any): string {
  const v = toStr(r?.type ?? r?.channel ?? r?.canal ?? "").trim();
  return v || "Contenu";
}

function normalizeContentStatus(r: any): string {
  return toStr(r?.status ?? r?.statut ?? "").trim();
}

function normalizeContentScheduledDate(r: any): Date | null {
  return parseDate(r?.scheduled_date ?? r?.date_planifiee ?? r?.scheduledDate ?? r?.created_at ?? "");
}

type ContentRowAny = Record<string, any>;

function isObjectArray(v: unknown): v is Record<string, any>[] {
  return Array.isArray(v) && v.every((x) => x && typeof x === "object" && !Array.isArray(x));
}

type ContentSchemaHint = {
  hasUserId?: boolean;
  selectIndex?: number;
};

function schemaCacheKey(userId: string) {
  return `tipote:content_item:schema_hint:${userId}`;
}

function loadContentSchemaHint(userId: string): ContentSchemaHint | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(schemaCacheKey(userId));
    if (!raw) return null;
    const json = JSON.parse(raw) as ContentSchemaHint;
    if (!json || typeof json !== "object") return null;
    return json;
  } catch {
    return null;
  }
}

function saveContentSchemaHint(userId: string, hint: ContentSchemaHint) {
  if (!userId) return;
  try {
    localStorage.setItem(schemaCacheKey(userId), JSON.stringify(hint));
  } catch {
    // ignore
  }
}

function isGenericStringErrorArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
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

  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);

  const [revenueGoalLabel, setRevenueGoalLabel] = useState<string>("—");
  const [revenueGoalValue, setRevenueGoalValue] = useState<number | null>(null);

  const [bizPulse, setBizPulse] = useState<BizPulse>({
    weeklyRevenue: "",
    weeklyLeads: "",
    weeklySales: "",
  });

  const [pulseUserId, setPulseUserId] = useState<string>("");

  const now = useMemo(() => new Date(), []);
  const weekLabel = useMemo(() => formatWeekRangeLabel(now), [now]);

  const [pulseErrors, setPulseErrors] = useState<Record<PulseField, string>>({
    weeklyRevenue: "",
    weeklyLeads: "",
    weeklySales: "",
  });

  const pulsePreview = useMemo(() => {
    const weeklyRevenue = parseEuroNumber(bizPulse.weeklyRevenue);
    const weeklyLeads = parseEuroNumber(bizPulse.weeklyLeads);
    const weeklySales = parseEuroNumber((bizPulse.weeklySales ?? bizPulse.weeklyCalls ?? "").toString());
    return { weeklyRevenue, weeklyLeads, weeklySales };
  }, [bizPulse.weeklyCalls, bizPulse.weeklySales, bizPulse.weeklyLeads, bizPulse.weeklyRevenue]);

  const revenueToGoalRatio = useMemo(() => {
    if (!revenueGoalValue || revenueGoalValue <= 0) return 0;
    const rev = pulsePreview.weeklyRevenue;
    if (!rev || rev <= 0) return 0;
    const monthlyEstimate = rev * 4;
    return clampPercent((monthlyEstimate / revenueGoalValue) * 100);
  }, [pulsePreview.weeklyRevenue, revenueGoalValue]);

  const weeklyRevenueTarget = useMemo(() => {
    if (revenueGoalValue && revenueGoalValue > 0) return Math.max(1, Math.round(revenueGoalValue / 4));
    return 2000;
  }, [revenueGoalValue]);

  const [tasksDoneThisWeek, setTasksDoneThisWeek] = useState<number>(0);
  const [plannedCountThisWeek, setPlannedCountThisWeek] = useState<number>(0);

  const [focusGoal, setFocusGoal] = useState<number>(3);
  const [isFocusOpen, setIsFocusOpen] = useState(false);
  const [focusGoalInput, setFocusGoalInput] = useState<string>("3");

  const focusLabel = `Terminer ${focusGoal} tâches`;
  const focusPercent = useMemo(
    () => clampPercent((Math.min(focusGoal, tasksDoneThisWeek) / Math.max(1, focusGoal)) * 100),
    [focusGoal, tasksDoneThisWeek]
  );

  const weeklyExecutionPercent = useMemo(
    () => clampPercent((Math.min(7, tasksDoneThisWeek) / 7) * 100),
    [tasksDoneThisWeek]
  );

  // Goal dialog (monthly revenue goal -> supabase)
  const [isGoalOpen, setIsGoalOpen] = useState(false);
  const [goalInput, setGoalInput] = useState<string>("");
  const [goalError, setGoalError] = useState<string>("");
  const [goalSaving, setGoalSaving] = useState<boolean>(false);

  async function loadRevenueGoal(userId: string) {
    // 1) Source principale : business_profiles.revenue_goal_monthly
    const prof = await supabase
      .from("business_profiles")
      .select("revenue_goal_monthly")
      .eq("user_id", userId)
      .maybeSingle();

    if (!prof.error) {
      const raw = (prof.data as any)?.revenue_goal_monthly ?? null;
      const goalNum = parseEuroNumber(raw);
      if (goalNum && goalNum > 0) {
        setRevenueGoalValue(goalNum);
        setRevenueGoalLabel(formatEuroCompact(goalNum));
        setGoalInput(String(goalNum));
        return;
      }
    }

    // 2) Fallback : strategies.target_monthly_revenue / objective_revenue
    const strat = await supabase
      .from("strategies")
      .select("target_monthly_revenue, objective_revenue, updated_at, created_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (!strat.error) {
      const raw =
        (strat.data as any)?.target_monthly_revenue ??
        (strat.data as any)?.objective_revenue ??
        null;

      const goalNum = parseEuroNumber(raw);
      setRevenueGoalValue(goalNum && goalNum > 0 ? goalNum : null);
      setRevenueGoalLabel(goalNum && goalNum > 0 ? formatEuroCompact(goalNum) : "—");
      setGoalInput(goalNum && goalNum > 0 ? String(goalNum) : "");
      return;
    }

    setRevenueGoalValue(null);
    setRevenueGoalLabel("—");
    setGoalInput("");
  }

  async function saveRevenueGoalToSupabase(userId: string, rawInput: string) {
    const parsed = parseEuroNumber(rawInput);
    if (!parsed || parsed <= 0) {
      setGoalError("Entre un montant mensuel valide (ex: 3000, 3 000, 3k).");
      return false;
    }

    setGoalError("");
    setGoalSaving(true);

    try {
      // Step 1: does a row exist?
      const existing = await supabase
        .from("business_profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      const isoNow = new Date().toISOString();

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
        // Insert if missing
        const ins = await supabase
          .from("business_profiles")
          .insert({ user_id: userId, revenue_goal_monthly: String(parsed), onboarding_completed: true, created_at: isoNow, updated_at: isoNow } as any);

        if (ins.error) {
          if (isSchemaError(ins.error.message || "")) {
            setGoalError("Table/colonnes business_profiles indisponibles (schema).");
            return false;
          }
          setGoalError("Impossible d’enregistrer l’objectif (réseau/RLS).");
          return false;
        }
      }

      setRevenueGoalValue(parsed);
      setRevenueGoalLabel(formatEuroCompact(parsed));
      setGoalInput(String(parsed));
      return true;
    } catch {
      setGoalError("Impossible d’enregistrer l’objectif.");
      return false;
    } finally {
      setGoalSaving(false);
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
              trend: doneThisWeek > 0 ? `+${doneThisWeek} tâches` : "+0 tâche",
              icon: TrendingUp,
            },
          ]);
        }

        const upcomingCombined: CombinedUpcoming[] = [];

        const tasksUpcoming = tasksAll
          .filter((t) => !isDoneStatus(normalizeTaskStatus(t)))
          .map((t) => ({
            kind: "task" as const,
            title: normalizeTaskTitle(t),
            type: "Tâche",
            statusRaw: normalizeTaskStatus(t),
            dt: normalizeTaskDueDate(t) ?? now,
            priority: normalizeTaskPriority(t),
          }))
          .sort((a, b) => a.dt.getTime() - b.dt.getTime())
          .slice(0, 6);

        upcomingCombined.push(...tasksUpcoming);

        const contentUpcoming = contentRows
          .map((r) => ({
            kind: "content" as const,
            title: normalizeContentTitle(r),
            type: normalizeContentType(r),
            statusRaw: normalizeContentStatus(r),
            dt: normalizeContentScheduledDate(r) ?? now,
          }))
          .filter((x) => x.dt >= startW && x.dt <= endW)
          .sort((a, b) => a.dt.getTime() - b.dt.getTime())
          .slice(0, 6);

        upcomingCombined.push(...contentUpcoming);
        upcomingCombined.sort((a, b) => a.dt.getTime() - b.dt.getTime());

        const nextUpcoming: UpcomingItem[] = upcomingCombined.slice(0, 8).map((x) => ({
          title: x.title,
          type: x.type,
          day: formatDayLabel(x.dt, now),
          time: formatTimeOrDash(x.dt),
          status: x.kind === "task" ? mapTaskStatusToUi(x.statusRaw) : mapContentStatusToUi(x.statusRaw),
        }));

        if (!cancelled) setUpcoming(nextUpcoming);
      } catch (e) {
        console.error("TodayLovable load error:", e);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, supabase]);

  useEffect(() => {
    if (!pulseUserId) return;
    savePulse(pulseUserId, bizPulse);
  }, [bizPulse, pulseUserId]);

  useEffect(() => {
    if (!pulseUserId) return;
    saveFocusSettings(pulseUserId, { focusGoal });
  }, [focusGoal, pulseUserId]);

  function validatePulse(next: BizPulse) {
    const errs: Record<PulseField, string> = {
      weeklyRevenue: "",
      weeklyLeads: "",
      weeklySales: "",
    };

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
    if ((next.weeklySales ?? "").trim()) {
      const n = parseEuroNumber(next.weeklySales);
      if (n === null || !Number.isFinite(n) || n < 0) {
        errs.weeklySales = "Entre un nombre valide (ex: 3).";
      }
    }

    setPulseErrors(errs);
    return !Object.values(errs).some(Boolean);
  }

  const priorityBadge = useMemo(() => {
    if (nextTask.priority === "high") return { label: "High Priority", variant: "default" as const };
    if (nextTask.priority === "low") return { label: "Low Priority", variant: "secondary" as const };
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
            <Button variant="outline" onClick={() => setIsPulseOpen(true)} className="gap-2">
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
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-primary-foreground/70 mb-1">Objectif revenu</p>
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
                      {revenueGoalValue ? "Modifier" : "Définir"}
                    </Button>
                  </div>

                  <p className="text-2xl font-bold text-primary-foreground">{revenueGoalLabel}</p>

                  <p className="text-sm text-primary-foreground/70 mt-1">
                    Objectif mensuel (servira à calculer ta progression).
                  </p>
                </div>

                <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                  <p className="text-sm text-primary-foreground/70 mb-1">
                    Progression vers l&apos;objectif
                  </p>
                  <p className="text-2xl font-bold text-primary-foreground">{revenueToGoalRatio}%</p>
                  <div className="mt-3">
                    <Progress value={revenueToGoalRatio} />
                  </div>
                </div>

                <div className="bg-background/20 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                  <p className="text-sm text-primary-foreground/70 mb-1">Exécution de la semaine</p>
                  <p className="text-2xl font-bold text-primary-foreground">{weeklyExecutionPercent}%</p>
                  <div className="mt-3">
                    <Progress value={weeklyExecutionPercent} />
                  </div>
                </div>
              </div>
            </Card>

            {/* Main grid */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Next action */}
              <Card className="p-6 lg:col-span-2">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                      <Target className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">Prochaine action recommandée</h3>
                      <p className="text-muted-foreground">Concentre-toi sur 1 action à la fois.</p>
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
                      <Link href={nextTask.href}>
                        Commencer <ArrowRight className="w-4 h-4" />
                      </Link>
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Choisis 1 action claire, coche quand c’est fait, et Tipote met à jour ta progression.
                  </div>
                </div>
              </Card>

              {/* Focus semaine (V2) */}
              <Card className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl gradient-secondary flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-secondary-foreground" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Focus de la semaine</h3>
                      <p className="text-sm text-muted-foreground">{weekLabel}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => {
                      setFocusGoalInput(String(focusGoal));
                      setIsFocusOpen(true);
                    }}
                  >
                    Modifier
                  </Button>
                </div>

                <div className="p-4 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{focusLabel}</span>
                    <span className="text-sm text-muted-foreground">
                      {Math.min(focusGoal, tasksDoneThisWeek)}/{focusGoal}
                    </span>
                  </div>
                  <Progress value={focusPercent} />
                  <p className="text-xs text-muted-foreground mt-3">
                    Basé sur tes tâches cochées cette semaine.
                  </p>
                </div>

                <div className="mt-4 p-4 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">Contenus planifiés</span>
                    <span className="text-sm text-muted-foreground">{plannedCountThisWeek}/7</span>
                  </div>
                  <Progress value={clampPercent((plannedCountThisWeek / 7) * 100)} />
                  <div className="mt-3 flex gap-2">
                    <Button asChild variant="outline" size="sm" className="h-8">
                      <Link href="/tasks">Voir mes tâches</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="h-8">
                      <Link href="/contents">Voir mes contenus</Link>
                    </Button>
                  </div>
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
                  <Link href="/contents">
                    Voir mes contenus <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </Card>
          </div>

          {/* Revenue goal dialog */}
          <Dialog open={isGoalOpen} onOpenChange={setIsGoalOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-xl font-display font-bold">
                  Définir mon objectif revenu
                </DialogTitle>
                <DialogDescription>
                  Objectif mensuel (en €). Il sert à calculer ta progression sur le dashboard.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Objectif mensuel</Label>
                  <Input
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    placeholder="ex: 3000, 3 000, 3k"
                    inputMode="decimal"
                  />
                  {goalError ? <p className="text-xs text-destructive">{goalError}</p> : null}
                  <p className="text-xs text-muted-foreground">
                    Astuces : tu peux écrire “3k”, “3 000”, “3000€”…
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setGoalError("");
                      setIsGoalOpen(false);
                    }}
                  >
                    Annuler
                  </Button>
                  <Button
                    disabled={goalSaving || !pulseUserId}
                    onClick={async () => {
                      if (!pulseUserId) {
                        setGoalError("Session introuvable.");
                        return;
                      }
                      const ok = await saveRevenueGoalToSupabase(pulseUserId, goalInput);
                      if (ok) setIsGoalOpen(false);
                    }}
                  >
                    {goalSaving ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Focus dialog */}
          <Dialog open={isFocusOpen} onOpenChange={setIsFocusOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-xl font-display font-bold">
                  Objectif de la semaine
                </DialogTitle>
                <DialogDescription>
                  Choisis ton focus : le nombre de tâches que tu veux terminer cette semaine.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Objectif (tâches)</Label>
                  <Input
                    value={focusGoalInput}
                    onChange={(e) => setFocusGoalInput(e.target.value)}
                    placeholder="ex: 3"
                    inputMode="numeric"
                  />
                  <p className="text-xs text-muted-foreground">Entre un nombre entre 1 et 14.</p>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setIsFocusOpen(false)}>
                    Annuler
                  </Button>
                  <Button
                    onClick={() => {
                      const n = Number(String(focusGoalInput || "").trim().replace(/[^0-9]/g, ""));
                      const safe =
                        Number.isFinite(n) && n > 0 ? Math.max(1, Math.min(14, Math.round(n))) : 3;
                      setFocusGoal(safe);
                      setFocusGoalInput(String(safe));
                      setIsFocusOpen(false);
                    }}
                  >
                    Enregistrer
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Pulse dialog */}
          <Dialog open={isPulseOpen} onOpenChange={setIsPulseOpen}>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-display font-bold">
                  Mettre à jour mes chiffres
                </DialogTitle>
                <DialogDescription>
                  Tes analytics ne sont pas connectables automatiquement : entre tes chiffres de la
                  semaine pour suivre ta progression vers ton objectif.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Revenu de la semaine</Label>
                  <Input
                    value={bizPulse.weeklyRevenue}
                    onChange={(e) => setBizPulse((p) => ({ ...p, weeklyRevenue: e.target.value }))}
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
                      onChange={(e) => setBizPulse((p) => ({ ...p, weeklyLeads: e.target.value }))}
                      placeholder="ex: 10"
                    />
                    {pulseErrors.weeklyLeads ? (
                      <p className="text-xs text-destructive">{pulseErrors.weeklyLeads}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label>Ventes (optionnel)</Label>
                    <Input
                      value={bizPulse.weeklySales}
                      onChange={(e) => setBizPulse((p) => ({ ...p, weeklySales: e.target.value }))}
                      placeholder="ex: 3"
                    />
                    {pulseErrors.weeklySales ? (
                      <p className="text-xs text-destructive">{pulseErrors.weeklySales}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setIsPulseOpen(false)}>
                    Annuler
                  </Button>
                  <Button
                    onClick={() => {
                      const next = { ...bizPulse };
                      if (!validatePulse(next)) return;
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
