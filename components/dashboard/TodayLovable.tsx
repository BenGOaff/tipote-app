// components/dashboard/TodayLovable.tsx
// Dashboard "Mode Pilote" — le dashboard choisit pour l'utilisateur et le coache.
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
  phaseLabel: string;  // "Fondations" / "Croissance" / "Scale"
  phaseNumber: number; // 1, 2, 3
  focus: string;       // plan_90_days.focus
  ctaLabel: string;    // "Créer tes premiers contenus"
  ctaHref: string;     // "/create"
};

type CoachingInsight = {
  positive: string;    // "Tu as défini ton persona et planifié tes posts, c'est top !"
  recommendation: string; // "Et si tu créais ta page de capture maintenant ?"
  why: string;         // "pour capturer des emails"
  ctaLabel: string;
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
  key: string;
  label: string;
  positive: string;
  recommendation: string;
  why: string;
  ctaLabel: string;
  ctaHref: string;
};

const COACHING_RECOS: Record<string, Omit<CoachingReco, "key" | "label" | "positive">> = {
  persona: {
    recommendation: "tu dois définir ton client idéal",
    why: "pour savoir exactement à qui tu parles et adapter ton message",
    ctaLabel: "Voir ma stratégie",
    ctaHref: "/strategy",
  },
  offre: {
    recommendation: "tu dois mettre le paquet sur la clarification de ton offre",
    why: "pour commencer à en parler avec confiance et convertir tes prospects",
    ctaLabel: "Voir ma stratégie",
    ctaHref: "/strategy",
  },
  lead_magnet: {
    recommendation: "tu dois créer ton lead magnet",
    why: "pour capturer des emails et construire une audience qualifiée",
    ctaLabel: "Créer du contenu",
    ctaHref: "/create",
  },
  page_vente: {
    recommendation: "tu dois rédiger ta page de vente",
    why: "pour lancer tes ventes rapidement et commencer à générer du chiffre",
    ctaLabel: "Voir ma stratégie",
    ctaHref: "/strategy",
  },
  email: {
    recommendation: "tu dois rédiger ta séquence email de bienvenue",
    why: "pour fidéliser ton audience dès le premier contact",
    ctaLabel: "Créer du contenu",
    ctaHref: "/create",
  },
  contenu: {
    recommendation: "tu dois planifier et créer tes prochains contenus",
    why: "pour booster ta visibilité et attirer de nouveaux prospects",
    ctaLabel: "Créer du contenu",
    ctaHref: "/create",
  },
};

// Priority order for recommendations
const RECO_PRIORITY = ["persona", "offre", "lead_magnet", "page_vente", "email", "contenu"];

function buildPositiveMessage(completedCategories: TaskCategory[]): string {
  if (completedCategories.length === 0) return "";

  const labels = completedCategories.slice(0, 3).map((c) => {
    if (c.key === "persona") return "défini ton persona";
    if (c.key === "offre") return "clarifié ton offre";
    if (c.key === "lead_magnet") return "créé ton lead magnet";
    if (c.key === "page_vente") return "rédigé ta page de vente";
    if (c.key === "email") return "préparé tes emails";
    if (c.key === "contenu") return "planifié tes contenus";
    return `avancé sur ${c.label}`;
  });

  if (labels.length === 1) return `Tu as ${labels[0]}, c'est top !`;
  if (labels.length === 2) return `Tu as ${labels[0]} et ${labels[1]}, c'est top !`;
  return `Tu as ${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}, bravo !`;
}

function buildCoachingInsight(categories: TaskCategory[], hasStrategy: boolean): CoachingInsight {
  if (!hasStrategy) {
    return {
      positive: "",
      recommendation: "Tu dois générer ta stratégie",
      why: "pour avoir un plan d'action clair et savoir exactement quoi faire chaque semaine",
      ctaLabel: "Générer ma stratégie",
      ctaHref: "/strategy",
    };
  }

  // Find completed and incomplete categories
  const completed = categories.filter((c) => c.total > 0 && c.done >= c.total);
  const incomplete = categories.filter((c) => c.total > 0 && c.done < c.total);
  const positive = buildPositiveMessage(completed);

  // Find highest-priority incomplete category
  for (const key of RECO_PRIORITY) {
    const cat = incomplete.find((c) => c.key === key);
    if (cat) {
      const reco = COACHING_RECOS[key];
      if (reco) {
        return {
          positive,
          recommendation: reco.recommendation,
          why: reco.why,
          ctaLabel: reco.ctaLabel,
          ctaHref: reco.ctaHref,
        };
      }
    }
  }

  // All tracked categories are done, or only "autre" remains
  if (incomplete.length > 0) {
    return {
      positive,
      recommendation: "tu dois continuer à avancer sur tes tâches en cours",
      why: "pour garder le rythme et atteindre tes objectifs",
      ctaLabel: "Voir mes tâches",
      ctaHref: "/tasks",
    };
  }

  // Everything done!
  return {
    positive: positive || "Toutes tes tâches sont terminées, bravo !",
    recommendation: "et si tu créais du nouveau contenu pour garder la dynamique ?",
    why: "Continue sur ta lancée pour ne pas perdre ton élan",
    ctaLabel: "Créer du contenu",
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
      phaseLabel: "Démarrage",
      phaseNumber: 0,
      focus: "Génère ta stratégie pour démarrer ton business.",
      ctaLabel: "Générer ma stratégie",
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
  let phaseLabel = "Fondations";
  if (daysElapsed > 60) { phaseNumber = 3; phaseLabel = "Scale"; }
  else if (daysElapsed > 30) { phaseNumber = 2; phaseLabel = "Croissance"; }

  // Get focus from plan
  const plan90 = (planJson.plan_90_days ?? planJson.plan90 ?? planJson.plan_90) as AnyRecord | null;
  const focusRaw = toStr(plan90?.focus ?? planJson.focus ?? "");
  const focus = focusRaw || `Phase ${phaseNumber} — ${phaseLabel}`;

  // Smart CTA based on what's incomplete
  const incomplete = categories.filter((c) => c.total > 0 && c.done < c.total);
  const hasIncompleteContent = incomplete.some((c) => c.key === "contenu");
  const hasIncompleteOffer = incomplete.some((c) => c.key === "offre" || c.key === "lead_magnet" || c.key === "page_vente");

  let ctaLabel = "Voir ma stratégie";
  let ctaHref = "/strategy";

  if (hasIncompleteContent && !hasIncompleteOffer) {
    ctaLabel = "Créer tes contenus";
    ctaHref = "/create";
  } else if (incomplete.length === 0) {
    ctaLabel = "Créer du contenu";
    ctaHref = "/create";
  }

  return { phaseLabel, phaseNumber, focus, ctaLabel, ctaHref };
}

/* ------------------------------------------------------------------ */
/*  Week label                                                         */
/* ------------------------------------------------------------------ */

function weekLabel(): string {
  const now = new Date();
  const day = now.getDay();
  const diffMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffMon);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
  return `${fmt.format(monday)} au ${fmt.format(sunday)}`;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function TodayLovable() {
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

  const currentWeekLabel = useMemo(() => weekLabel(), []);

  useEffect(() => {
    let cancelled = false;

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

        // ------ Fetch tasks via API (RLS-safe) ------
        let tasks: AnyRecord[] = [];
        try {
          const tasksApiRes = await fetch("/api/tasks", { cache: "no-store" });
          const tasksJson = await tasksApiRes.json().catch(() => null);
          tasks = Array.isArray(tasksJson?.tasks)
            ? tasksJson.tasks
            : Array.isArray(tasksJson)
              ? tasksJson
              : [];
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
    return () => { cancelled = true; };
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
                {/* BLOC 1 — Ton objectif en ce moment                 */}
                {/* ================================================= */}
                {objective && (
                  <Card className="gradient-primary text-primary-foreground overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-center gap-4 p-5 md:p-6">
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="w-10 h-10 rounded-lg bg-primary-foreground/20 flex items-center justify-center">
                          <Target className="w-5 h-5" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-xs font-medium text-primary-foreground/60 uppercase tracking-wide">
                            Ton objectif en ce moment
                          </p>
                          {objective.phaseNumber > 0 && (
                            <Badge
                              variant="secondary"
                              className="bg-primary-foreground/15 text-primary-foreground border-0 text-[10px]"
                            >
                              Phase {objective.phaseNumber} — {objective.phaseLabel}
                            </Badge>
                          )}
                        </div>
                        <h2 className="text-lg md:text-xl font-bold line-clamp-2">
                          {objective.focus}
                        </h2>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Button asChild variant="secondary" className="gap-2 shrink-0">
                          <Link href={objective.ctaHref}>
                            {objective.ctaLabel} <ArrowRight className="w-4 h-4" />
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
                  <Card className="p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Cette semaine
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mb-5">
                      {currentWeekLabel}
                    </p>

                    {coaching && (
                      <div className="space-y-4">
                        {coaching.positive && (
                          <p className="text-sm text-foreground font-medium">
                            {coaching.positive}
                          </p>
                        )}

                        <div className="rounded-lg bg-primary/5 border border-primary/15 p-4">
                          <p className="text-sm text-foreground leading-relaxed">
                            {coaching.positive ? (
                              <>
                                Et si maintenant {coaching.recommendation} {coaching.why} ?
                              </>
                            ) : (
                              <>
                                {ucFirst(coaching.recommendation)} {coaching.why}.
                              </>
                            )}
                          </p>
                        </div>

                        <Button asChild variant="default" className="w-full gap-2">
                          <Link href={coaching.ctaHref}>
                            {coaching.ctaLabel} <ArrowRight className="w-4 h-4" />
                          </Link>
                        </Button>
                      </div>
                    )}
                  </Card>

                  {/* --- Ta progression --- */}
                  <Card className="p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Ta progression
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mb-5">
                      Tes résultats concrets
                    </p>

                    <div className="space-y-4">
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
                      {progression.hasMetrics ? (
                        <div className="flex items-start gap-3">
                          <BarChart3 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold">Résultats business</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-0.5">
                              {progression.revenue !== null && (
                                <span>{progression.revenue.toLocaleString("fr-FR")}€ CA</span>
                              )}
                              {progression.salesCount !== null && (
                                <span>{progression.salesCount} vente{progression.salesCount > 1 ? "s" : ""}</span>
                              )}
                              {progression.newSubscribers !== null && (
                                <span>{progression.newSubscribers} inscrit{progression.newSubscribers > 1 ? "s" : ""}</span>
                              )}
                              {progression.conversionRate !== null && (
                                <span>{progression.conversionRate.toFixed(1)}% conversion</span>
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
                                Remplis tes statistiques
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Pour mesurer tes avancées : leads capturés, ventes, vues de tunnel...
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <Button asChild variant="outline" size="sm" className="w-full gap-2">
                        <Link href="/analytics">
                          {progression.hasMetrics ? "Voir mes statistiques" : "Remplir mes statistiques"} <ArrowRight className="w-3 h-3" />
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
