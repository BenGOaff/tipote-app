// components/dashboard/TodayLovable.tsx
// Dashboard "Mode Pilote" — le dashboard choisit pour l'utilisateur et le coache.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";

import Link from "next/link";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  ArrowRight,
  ChevronRight,
  BarChart3,
  FileText,
  TrendingUp,
  Target,
  Lightbulb,
} from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AnyRecord = Record<string, unknown>;

type StrategicObjective = {
  phaseKey: string;    // "startup" | "foundations" | "growth" | "scale"
  phaseNumber: number; // 0, 1, 2, 3
  focus: string;       // plan_90_days.focus (raw, may be empty)
  ctaLabelKey: string; // translation key under today.ctas
  ctaHref: string;     // "/create"
};

type PositiveMessage = {
  format: "none" | "one" | "two" | "many";
  actionKeys: string[];  // e.g. ["persona", "offre"]
  otherLabel?: string;   // for "autre" category
};

type CoachingInsight = {
  positive: PositiveMessage;
  recommendationKey: string; // key under today.coaching
  ctaLabelKey: string;       // key under today.ctas
  ctaHref: string;
};

type TaskCategory = {
  key: string;
  label: string;
  total: number;
  done: number;
};

type ProgressionData = {
  hasMetrics: boolean;
  revenue: number | null;
  salesCount: number | null;
  newSubscribers: number | null;
  conversionRate: number | null;
  contentCounts: Record<string, number>;
  totalContents: number;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean);
  return [];
}

function parseDate(v: unknown): Date | null {
  const s = toStr(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isDoneStatus(s: string): boolean {
  const low = (s || "").toLowerCase().trim();
  return low === "done" || low === "completed" || low === "fait" || low === "terminé" || low === "termine";
}

function normalizeContentType(row: any): string {
  return toStr(row?.type ?? row?.content_type ?? "").trim().toLowerCase();
}

function isSchemaError(msg: string) {
  const m = (msg || "").toLowerCase();
  return m.includes("column") || m.includes("does not exist") || m.includes("schema") || m.includes("relation");
}

function ucFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function pluralLabel(type: string, count: number): string {
  const label = ucFirst(type);
  if (count <= 1) return `${count} ${label}`;
  if (label.endsWith("s") || label.endsWith("x") || label.endsWith("z")) return `${count} ${label}`;
  return `${count} ${label}s`;
}

type ContentSchemaHint = { hasUserId?: boolean; selectIndex?: number };

function loadContentSchemaHint(userId: string): ContentSchemaHint | null {
  try {
    const raw = localStorage.getItem(`tipote_content_schema_hint:${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveContentSchemaHint(userId: string, hint: ContentSchemaHint) {
  try { localStorage.setItem(`tipote_content_schema_hint:${userId}`, JSON.stringify(hint)); } catch {}
}

/* ------------------------------------------------------------------ */
/*  Task category detection                                            */
/* ------------------------------------------------------------------ */

type CategoryDef = { key: string; label: string; keywords: string[] };

const TASK_CATEGORIES: CategoryDef[] = [
  {
    key: "persona",
    label: "persona",
    keywords: ["persona", "avatar", "client idéal", "client ideal", "cible", "portrait"],
  },
  {
    key: "offre",
    label: "offre",
    keywords: ["offre", "prix", "tarif", "positionnement", "promesse", "valeur", "proposition", "pricing", "packaging"],
  },
  {
    key: "lead_magnet",
    label: "lead magnet",
    keywords: ["lead magnet", "aimant", "capture", "quiz", "checklist", "freebie", "gratuit", "opt-in", "optin"],
  },
  {
    key: "page_vente",
    label: "page de vente",
    keywords: ["page de vente", "landing", "tunnel", "funnel", "page de capture", "sales page"],
  },
  {
    key: "email",
    label: "séquence email",
    keywords: ["email", "séquence", "sequence", "newsletter", "bienvenue", "automation", "autorépondeur"],
  },
  {
    key: "contenu",
    label: "contenu",
    keywords: ["post", "contenu", "article", "vidéo", "video", "blog", "réseaux", "publier", "rédiger", "planifier", "linkedin", "instagram", "tiktok", "facebook", "twitter", "reel", "story"],
  },
];

function categorizeTask(title: string): string | null {
  const t = title.toLowerCase();
  for (const cat of TASK_CATEGORIES) {
    for (const kw of cat.keywords) {
      if (t.includes(kw)) return cat.key;
    }
  }
  return null;
}

function buildTaskCategories(tasks: AnyRecord[]): TaskCategory[] {
  const counts: Record<string, { total: number; done: number }> = {};

  for (const cat of TASK_CATEGORIES) {
    counts[cat.key] = { total: 0, done: 0 };
  }
  counts["autre"] = { total: 0, done: 0 };

  for (const t of tasks) {
    const title = toStr(t.title ?? t.task ?? t.name).trim();
    const status = toStr(t.status ?? t.state ?? t.statut).trim();
    const catKey = categorizeTask(title) || "autre";
    counts[catKey].total++;
    if (isDoneStatus(status)) counts[catKey].done++;
  }

  return [...TASK_CATEGORIES, { key: "autre", label: "autre", keywords: [] }]
    .map((cat) => ({
      key: cat.key,
      label: cat.label,
      total: counts[cat.key].total,
      done: counts[cat.key].done,
    }))
    .filter((c) => c.total > 0);
}

/* ------------------------------------------------------------------ */
/*  Coaching engine                                                    */
/* ------------------------------------------------------------------ */

type CoachingReco = {
  recommendationKey: string;
  ctaLabelKey: string;
  ctaHref: string;
};

const COACHING_RECOS: Record<string, CoachingReco> = {
  persona: { recommendationKey: "persona", ctaLabelKey: "seeStrategy", ctaHref: "/strategy" },
  offre: { recommendationKey: "offre", ctaLabelKey: "seeStrategy", ctaHref: "/strategy" },
  lead_magnet: { recommendationKey: "lead_magnet", ctaLabelKey: "createContent", ctaHref: "/create" },
  page_vente: { recommendationKey: "page_vente", ctaLabelKey: "seeStrategy", ctaHref: "/strategy" },
  email: { recommendationKey: "email", ctaLabelKey: "createContent", ctaHref: "/create" },
  contenu: { recommendationKey: "contenu", ctaLabelKey: "createContent", ctaHref: "/create" },
};

// Priority order for recommendations
const RECO_PRIORITY = ["persona", "offre", "lead_magnet", "page_vente", "email", "contenu"];

function buildPositiveData(completedCategories: TaskCategory[]): PositiveMessage {
  if (completedCategories.length === 0) return { format: "none", actionKeys: [] };

  const slice = completedCategories.slice(0, 3);
  const actionKeys = slice.map((c) => c.key);
  const otherLabel = slice.find((c) => c.key === "autre")?.label;

  if (slice.length === 1) return { format: "one", actionKeys, otherLabel };
  if (slice.length === 2) return { format: "two", actionKeys, otherLabel };
  return { format: "many", actionKeys, otherLabel };
}

function buildCoachingInsight(categories: TaskCategory[], hasStrategy: boolean): CoachingInsight {
  if (!hasStrategy) {
    return {
      positive: { format: "none", actionKeys: [] },
      recommendationKey: "noStrategy",
      ctaLabelKey: "generateStrategy",
      ctaHref: "/strategy",
    };
  }

  // Find completed and incomplete categories
  const completed = categories.filter((c) => c.total > 0 && c.done >= c.total);
  const incomplete = categories.filter((c) => c.total > 0 && c.done < c.total);
  const positive = buildPositiveData(completed);

  // Find highest-priority incomplete category
  for (const key of RECO_PRIORITY) {
    const cat = incomplete.find((c) => c.key === key);
    if (cat) {
      const reco = COACHING_RECOS[key];
      if (reco) {
        return {
          positive,
          recommendationKey: reco.recommendationKey,
          ctaLabelKey: reco.ctaLabelKey,
          ctaHref: reco.ctaHref,
        };
      }
    }
  }

  // All tracked categories are done, or only "autre" remains
  if (incomplete.length > 0) {
    return {
      positive,
      recommendationKey: "autre",
      ctaLabelKey: "seeTasks",
      ctaHref: "/tasks",
    };
  }

  // No tasks exist at all — don't claim "all done", encourage the user to start
  const totalTasks = categories.reduce((sum, c) => sum + c.total, 0);
  if (totalTasks === 0) {
    return {
      positive: { format: "none", actionKeys: [] },
      recommendationKey: "noTasks",
      ctaLabelKey: "seeStrategy",
      ctaHref: "/strategy",
    };
  }

  // Everything genuinely done
  return {
    positive,
    recommendationKey: "allDone",
    ctaLabelKey: "createContent",
    ctaHref: "/create",
  };
}

/* ------------------------------------------------------------------ */
/*  Strategic objective from plan_json                                 */
/* ------------------------------------------------------------------ */

function buildStrategicObjective(
  planJson: AnyRecord | null,
  planCreatedAt: string | null,
  categories: TaskCategory[],
  hasStrategy: boolean,
): StrategicObjective {
  if (!hasStrategy || !planJson) {
    return {
      phaseKey: "startup",
      phaseNumber: 0,
      focus: "",  // component will use today.objective.strategyFocus
      ctaLabelKey: "generateStrategy",
      ctaHref: "/strategy",
    };
  }

  // Determine current phase
  let daysElapsed = 0;
  if (planCreatedAt) {
    const created = parseDate(planCreatedAt);
    if (created) {
      daysElapsed = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
    }
  }

  let phaseNumber = 1;
  let phaseKey = "foundations";
  if (daysElapsed > 60) { phaseNumber = 3; phaseKey = "scale"; }
  else if (daysElapsed > 30) { phaseNumber = 2; phaseKey = "growth"; }

  // Get focus from plan
  const plan90 = (planJson.plan_90_days ?? planJson.plan90 ?? planJson.plan_90) as AnyRecord | null;
  const focusRaw = toStr(plan90?.focus ?? planJson.focus ?? "");
  const focus = focusRaw; // if empty, component falls back to phase label

  // Smart CTA based on what's incomplete
  const incomplete = categories.filter((c) => c.total > 0 && c.done < c.total);
  const hasIncompleteContent = incomplete.some((c) => c.key === "contenu");
  const hasIncompleteOffer = incomplete.some((c) => c.key === "offre" || c.key === "lead_magnet" || c.key === "page_vente");

  let ctaLabelKey = "seeStrategy";
  let ctaHref = "/strategy";

  if (hasIncompleteContent && !hasIncompleteOffer) {
    ctaLabelKey = "createContents";
    ctaHref = "/create";
  } else if (incomplete.length === 0) {
    ctaLabelKey = "createContent";
    ctaHref = "/create";
  }

  return { phaseKey, phaseNumber, focus, ctaLabelKey, ctaHref };
}

/* ------------------------------------------------------------------ */
/*  Week label                                                         */
/* ------------------------------------------------------------------ */

const INTL_LOCALES: Record<string, string> = {
  fr: "fr-FR", en: "en-US", es: "es-ES", it: "it-IT", ar: "ar-SA",
};

function weekLabel(locale = "fr-FR"): string {
  const now = new Date();
  const day = now.getDay();
  const diffMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffMon);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" });
  return `${fmt.format(monday)} – ${fmt.format(sunday)}`;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function TodayLovable() {
  const t = useTranslations("today");
  const locale = useLocale();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [objective, setObjective] = useState<StrategicObjective | null>(null);
  const [coaching, setCoaching] = useState<CoachingInsight | null>(null);
  const [progression, setProgression] = useState<ProgressionData>({
    hasMetrics: false,
    revenue: null,
    salesCount: null,
    newSubscribers: null,
    conversionRate: null,
    contentCounts: {},
    totalContents: 0,
  });
  const [loading, setLoading] = useState(true);

  const currentWeekLabel = useMemo(() => weekLabel(INTL_LOCALES[locale] ?? "fr-FR"), [locale]);

  // Resolve translated positive coaching message
  const positiveText = useMemo(() => {
    if (!coaching) return "";
    const { positive } = coaching;
    if (positive.format === "none") return "";
    const labels = positive.actionKeys.map((key) => {
      if (key === "autre") return t(`positive.other`, { label: positive.otherLabel ?? key });
      return t(`positive.${key}`);
    });
    if (positive.format === "one") return t("positive.one", { item: labels[0] });
    if (positive.format === "two") return t("positive.two", { item1: labels[0], item2: labels[1] });
    const last = labels[labels.length - 1];
    const items = labels.slice(0, -1).join(", ");
    return t("positive.many", { items, last });
  }, [coaching, t]);

  useEffect(() => {
    let cancelled = false;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user?.id) return;
        const userId = user.id;
        if (cancelled) return;

        // ------ Fetch plan ------
        const planRes = await supabase
          .from("business_plan")
          .select("plan_json, created_at")
          .eq("user_id", userId)
          .maybeSingle();

        // ------ Fetch tasks directly (no project_id filter, like strategy page) ------
        let tasks: AnyRecord[] = [];
        try {
          const tasksRes = await supabase
            .from("project_tasks")
            .select("id, title, status, priority, source, created_at, updated_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: true })
            .limit(500);
          if (!tasksRes.error && Array.isArray(tasksRes.data)) {
            tasks = tasksRes.data as AnyRecord[];
          }
        } catch {
          // fail-open
        }

        // ------ Fetch metrics (may not exist) ------
        let metricsRows: AnyRecord[] = [];
        try {
          const metricsRes = await supabase
            .from("metrics")
            .select("revenue,sales_count,new_subscribers,conversion_rate")
            .eq("user_id", userId)
            .order("month", { ascending: false })
            .limit(1);
          if (!metricsRes.error && Array.isArray(metricsRes.data)) {
            metricsRows = metricsRes.data as AnyRecord[];
          }
        } catch {
          // fail-open — table may not exist
        }

        // ------ Fetch content rows (with schema fallback) ------
        const contentAttempts = [
          { select: "id,title,status,type,user_id", orderCol: "created_at" },
          { select: "id,titre,statut,type,user_id", orderCol: "created_at" },
          { select: "id,title,status,type", orderCol: "created_at" },
          { select: "id,titre,statut,type", orderCol: "created_at" },
        ];

        const hint = loadContentSchemaHint(userId) || {};
        let contentRows: AnyRecord[] = [];

        const startIdx = typeof hint.selectIndex === "number" ? hint.selectIndex : 0;
        for (let offset = 0; offset < contentAttempts.length; offset++) {
          const i = (startIdx + offset) % contentAttempts.length;
          const a = contentAttempts[i];
          const hasUid = a.select.includes("user_id");
          if (hint.hasUserId === false && hasUid) continue;

          let q = supabase.from("content_item").select(a.select)
            .order(a.orderCol as any, { ascending: false }).limit(300);
          if (hasUid && hint.hasUserId !== false) q = q.eq("user_id", userId);

          const res = await q;
          if (!res.error && Array.isArray(res.data)) {
            saveContentSchemaHint(userId, { hasUserId: hasUid || undefined, selectIndex: i });
            contentRows = res.data as unknown as AnyRecord[];
            break;
          }
          if (res.error && isSchemaError(res.error.message) && res.error.message.toLowerCase().includes("user_id")) {
            saveContentSchemaHint(userId, { ...hint, hasUserId: false, selectIndex: i });
            continue;
          }
          if (res.error && isSchemaError(res.error.message)) continue;
          break;
        }

        if (cancelled) return;

        // ------ Process data ------
        const planJson = (planRes.data?.plan_json ?? null) as AnyRecord | null;
        const planCreatedAt = toStr(planRes.data?.created_at);
        const hasStrategy = !planRes.error && !!planJson && Object.keys(planJson).length > 0;

        const categories = buildTaskCategories(tasks);

        // Strategic objective
        const obj = buildStrategicObjective(planJson, planCreatedAt || null, categories, hasStrategy);

        // Coaching insight
        const coach = buildCoachingInsight(categories, hasStrategy);

        // Metrics
        let revenue: number | null = null;
        let salesCount: number | null = null;
        let newSubscribers: number | null = null;
        let conversionRate: number | null = null;
        let hasMetrics = false;

        if (metricsRows.length > 0) {
          const m = metricsRows[0] as any;
          revenue = typeof m.revenue === "number" ? m.revenue : null;
          salesCount = typeof m.sales_count === "number" ? m.sales_count : null;
          newSubscribers = typeof m.new_subscribers === "number" ? m.new_subscribers : null;
          conversionRate = typeof m.conversion_rate === "number" ? m.conversion_rate : null;
          hasMetrics = revenue !== null || salesCount !== null || newSubscribers !== null;
        }

        // Content counts
        const contentCounts: Record<string, number> = {};
        let totalContents = 0;
        for (const c of contentRows) {
          totalContents++;
          const cType = normalizeContentType(c) || "contenu";
          contentCounts[cType] = (contentCounts[cType] || 0) + 1;
        }

        if (!cancelled) {
          setObjective(obj);
          setCoaching(coach);
          setProgression({
            hasMetrics,
            revenue,
            salesCount,
            newSubscribers,
            conversionRate,
            contentCounts,
            totalContents,
          });
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    // ── Re-fetch when tab becomes visible (covers strategy → dashboard navigation) ──
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !cancelled) {
        load();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // ── Supabase Realtime: instant sync when project_tasks change ──
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id || cancelled) return;

        realtimeChannel = supabase
          .channel("dashboard-tasks-sync")
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "project_tasks",
              filter: `user_id=eq.${user.id}`,
            },
            () => {
              if (cancelled) return;
              // Debounce rapid task toggles (e.g., checking multiple tasks quickly)
              if (debounceTimer) clearTimeout(debounceTimer);
              debounceTimer = setTimeout(() => { load(); }, 600);
            },
          )
          .subscribe();
      } catch {
        // fail-open: realtime may not be configured on this Supabase instance
      }
    })();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    };
  }, [supabase]);

  // Content summary string
  const contentSummary = useMemo(() => {
    const entries = Object.entries(progression.contentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    if (entries.length === 0) return null;
    return entries.map(([type, count]) => pluralLabel(type, count)).join(", ");
  }, [progression.contentCounts]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto bg-muted/30">
          <header className="h-16 border-b border-border flex items-center px-6 bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-4 flex-1">
              <h1 className="text-xl font-display font-bold">{t("title")}</h1>
            </div>
          </header>

          <div className="p-6 space-y-6 max-w-6xl mx-auto">
            {loading ? (
              <div className="py-20 text-center text-muted-foreground text-sm">
                {t("loading")}
              </div>
            ) : (
              <>
                {/* ================================================= */}
                {/* BLOC 1 — Ton objectif en ce moment                 */}
                {/* ================================================= */}
                {objective && (
                  <Card className="gradient-primary text-primary-foreground overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-center gap-5 p-6 md:py-8 md:px-8">
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="w-12 h-12 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
                          <Target className="w-6 h-6" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <p className="text-xs font-medium text-primary-foreground/60 uppercase tracking-wide">
                            {t("objectiveLabel")}
                          </p>
                          {objective.phaseNumber > 0 && (
                            <Badge
                              variant="secondary"
                              className="bg-primary-foreground/15 text-primary-foreground border-0 text-[10px]"
                            >
                              {t(`objective.label${ucFirst(objective.phaseKey)}`)}
                            </Badge>
                          )}
                        </div>
                        <h2 className="text-lg md:text-xl font-bold leading-snug">
                          {objective.focus || t("objective.strategyFocus")}
                        </h2>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Button asChild variant="secondary" className="gap-2 shrink-0">
                          <Link href={objective.ctaHref}>
                            {t(`ctas.${objective.ctaLabelKey}`)} <ArrowRight className="w-4 h-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}

                {/* ================================================= */}
                {/* BLOC 2+3 — Coaching + Progression (côte à côte)    */}
                {/* ================================================= */}
                <div className="grid md:grid-cols-2 gap-6">

                  {/* --- Cette semaine : coaching --- */}
                  <Card className="p-6 flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t("thisWeek")}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mb-6">
                      {currentWeekLabel}
                    </p>

                    {coaching && (
                      <div className="space-y-5 flex-1 flex flex-col">
                        {positiveText && (
                          <p className="text-sm text-foreground font-medium leading-relaxed">
                            {positiveText}
                          </p>
                        )}

                        <div className="rounded-lg bg-primary/5 border border-primary/15 p-5">
                          <p className="text-sm text-foreground leading-relaxed">
                            {ucFirst(t(`coaching.${coaching.recommendationKey}.recommendation`))} {t(`coaching.${coaching.recommendationKey}.why`)}.
                          </p>
                        </div>

                        <Button asChild variant="default" className="w-full gap-2 mt-auto">
                          <Link href={coaching.ctaHref}>
                            {t(`ctas.${coaching.ctaLabelKey}`)} <ArrowRight className="w-4 h-4" />
                          </Link>
                        </Button>
                      </div>
                    )}
                  </Card>

                  {/* --- Ta progression --- */}
                  <Card className="p-6 flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t("progressionTitle")}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mb-6">
                      {t("progressionSub")}
                    </p>

                    <div className="space-y-5 flex-1 flex flex-col">
                      {/* Contenus créés */}
                      <div className="flex items-start gap-3">
                        <FileText className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold">{t("contentsCreated")}</p>
                          {contentSummary ? (
                            <p className="text-sm text-muted-foreground">{contentSummary}</p>
                          ) : (
                            <p className="text-sm text-muted-foreground">{t("noContent")}</p>
                          )}
                        </div>
                      </div>

                      {/* Business KPIs */}
                      {progression.hasMetrics ? (
                        <div className="flex items-start gap-3">
                          <BarChart3 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold">{t("businessResults")}</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-0.5">
                              {progression.revenue !== null && (
                                <span>{progression.revenue.toLocaleString()}€</span>
                              )}
                              {progression.salesCount !== null && (
                                <span>{progression.salesCount}</span>
                              )}
                              {progression.newSubscribers !== null && (
                                <span>{progression.newSubscribers}</span>
                              )}
                              {progression.conversionRate !== null && (
                                <span>{progression.conversionRate.toFixed(1)}%</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-muted/50 border border-border/50 p-4">
                          <div className="flex items-start gap-3">
                            <BarChart3 className="w-4 h-4 text-muted-foreground/60 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {t("fillStats")}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {t("fillStatsSub")}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <Button asChild variant="outline" size="sm" className="w-full gap-2 mt-auto">
                        <Link href="/analytics">
                          {progression.hasMetrics ? t("viewStats") : t("fillStatsBtn")} <ArrowRight className="w-3 h-3" />
                        </Link>
                      </Button>
                    </div>
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
                    {t("viewStrategy")}
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