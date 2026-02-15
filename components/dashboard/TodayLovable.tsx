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
  recap: string;       // real recap of done tasks + contextual message
  suggestion: string;  // next step suggestion (grey box)
  ctaLabel: string;
  ctaHref: string;
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
/*  Coaching engine — contextual, human, based on real task data       */
/* ------------------------------------------------------------------ */

function buildCoachingInsight(
  tasks: AnyRecord[],
  firstName: string,
  hasStrategy: boolean,
  planCreatedAt: string | null,
  totalContents: number,
): CoachingInsight {
  // --- No strategy yet ---
  if (!hasStrategy) {
    const name = firstName || "toi";
    return {
      recap: `Salut ${name} ! Tu n'as pas encore de stratégie. C'est la première étape pour savoir exactement quoi faire et dans quel ordre.`,
      suggestion: "Génère ta stratégie personnalisée pour obtenir un plan d'action clair adapté à ton business.",
      ctaLabel: "Générer ma stratégie",
      ctaHref: "/strategy",
    };
  }

  const total = tasks.length;
  const doneTasks = tasks.filter((t) => isDoneStatus(toStr(t.status ?? t.state ?? t.statut)));
  const doneCount = doneTasks.length;
  const todoTasks = tasks.filter((t) => !isDoneStatus(toStr(t.status ?? t.state ?? t.statut)));
  const todoCount = todoTasks.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Days since plan creation
  let daysSincePlan = 0;
  if (planCreatedAt) {
    const d = parseDate(planCreatedAt);
    if (d) daysSincePlan = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  }

  // Done task titles for recap
  const doneTaskTitles = doneTasks
    .map((t) => toStr(t.title ?? t.task ?? t.name).trim())
    .filter(Boolean);

  // Next suggested task (first todo task, ordered by due_date from API)
  const nextTask = todoTasks[0];
  const nextTaskTitle = nextTask ? toStr(nextTask.title ?? nextTask.task ?? nextTask.name).trim() : "";

  const name = firstName || "toi";

  // --- Brand new user (just got plan, 0 tasks done) ---
  if (doneCount === 0 && daysSincePlan <= 3) {
    return {
      recap: `Bienvenue ${name} ! Ta stratégie est prête avec ${total} tâches pour atteindre tes objectifs. C'est le moment de passer à l'action.`,
      suggestion: nextTaskTitle
        ? `Commence par « ${nextTaskTitle} » — c'est ta première étape. Des suggestions t'attendent dans ta stratégie !`
        : "Ouvre ta stratégie et découvre tes premières tâches, c'est parti !",
      ctaLabel: "Voir ma stratégie",
      ctaHref: "/strategy",
    };
  }

  // --- No progress after a while ---
  if (doneCount === 0 && daysSincePlan > 3) {
    return {
      recap: `Salut ${name} ! Ta stratégie t'attend avec ${total} tâches à accomplir. Pas encore de tâche cochée, mais ce n'est jamais trop tard pour s'y mettre.`,
      suggestion: nextTaskTitle
        ? `Et si tu commençais par « ${nextTaskTitle} » ? Un petit pas aujourd'hui, de grands résultats demain.`
        : "Ouvre ta stratégie et coche ta première tâche, tu verras, ça fait du bien !",
      ctaLabel: "Voir ma stratégie",
      ctaHref: "/strategy",
    };
  }

  // --- All done ---
  if (doneCount >= total && total > 0) {
    let recap = `Bravo ${name} ! Tu as terminé les ${total} tâches de ta stratégie.`;
    if (totalContents > 0) {
      recap += ` Et ${totalContents} contenu${totalContents > 1 ? "s" : ""} créé${totalContents > 1 ? "s" : ""} en plus !`;
    }
    recap += " Continue sur ta lancée !";
    return {
      recap,
      suggestion: "Tu as bouclé ta stratégie, c'est le moment de créer du nouveau contenu et de maintenir ta dynamique !",
      ctaLabel: "Créer du contenu",
      ctaHref: "/create",
    };
  }

  // --- In progress ---
  let recap = "";
  if (doneTaskTitles.length <= 3) {
    recap = `Tu as terminé ${doneCount}/${total} tâche${doneCount > 1 ? "s" : ""} : ${doneTaskTitles.join(", ")}. `;
  } else {
    const shown = doneTaskTitles.slice(0, 3);
    recap = `Tu as terminé ${doneCount}/${total} tâche${doneCount > 1 ? "s" : ""}, dont ${shown.join(", ")} et ${doneCount - 3} autre${doneCount - 3 > 1 ? "s" : ""}. `;
  }

  if (totalContents > 0) {
    recap += `${totalContents} contenu${totalContents > 1 ? "s" : ""} créé${totalContents > 1 ? "s" : ""}. `;
  }

  // Tone based on progress percentage
  if (pct < 25) {
    recap += "C'est un bon début, continue !";
  } else if (pct < 50) {
    recap += "Tu avances bien, garde le rythme !";
  } else if (pct < 75) {
    recap += "Beau travail, tu es sur la bonne voie !";
  } else {
    recap += "Tu y es presque, encore un petit effort !";
  }

  // Suggestion box
  let suggestion = "";
  if (nextTaskTitle) {
    suggestion = `Prochaine étape : « ${nextTaskTitle} ». Il te reste ${todoCount} tâche${todoCount > 1 ? "s" : ""} (${pct}% complété).`;
  } else {
    suggestion = `Il te reste ${todoCount} tâche${todoCount > 1 ? "s" : ""}. Continue à avancer dans ta stratégie !`;
  }

  return {
    recap,
    suggestion,
    ctaLabel: "Voir ma stratégie",
    ctaHref: "/strategy",
  };
}

/* ------------------------------------------------------------------ */
/*  Strategic objective from plan_json                                 */
/* ------------------------------------------------------------------ */

function buildStrategicObjective(
  planJson: AnyRecord | null,
  hasStrategy: boolean,
  tasks: AnyRecord[],
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

  const total = tasks.length;
  const doneCount = tasks.filter((t) => isDoneStatus(toStr(t.status ?? t.state ?? t.statut))).length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Phase based on actual progress (not days elapsed)
  let phaseNumber = 1;
  let phaseLabel = "Fondations";
  if (pct > 66) { phaseNumber = 3; phaseLabel = "Scale"; }
  else if (pct > 33) { phaseNumber = 2; phaseLabel = "Croissance"; }

  // Get focus from plan
  const plan90 = (planJson.plan_90_days ?? planJson.plan90 ?? planJson.plan_90) as AnyRecord | null;
  const focusRaw = toStr(plan90?.focus ?? planJson.focus ?? "");
  const focus = focusRaw
    ? `${focusRaw} — ${doneCount}/${total} tâches (${pct}%)`
    : `${doneCount}/${total} tâches terminées (${pct}%)`;

  const allDone = doneCount >= total && total > 0;

  return {
    phaseLabel,
    phaseNumber,
    focus,
    ctaLabel: allDone ? "Créer du contenu" : "Voir ma stratégie",
    ctaHref: allDone ? "/create" : "/strategy",
  };
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

        // ------ Fetch business profile (first_name) ------
        let firstName = "";
        try {
          const profileRes = await supabase
            .from("business_profiles")
            .select("first_name")
            .eq("user_id", userId)
            .maybeSingle();
          if (!profileRes.error && profileRes.data) {
            firstName = toStr((profileRes.data as AnyRecord).first_name).trim();
          }
        } catch {
          // fail-open
        }

        // ------ Process data ------
        const planJson = (planRes.data?.plan_json ?? null) as AnyRecord | null;
        const planCreatedAt = toStr(planRes.data?.created_at);
        const hasStrategy = !planRes.error && !!planJson && Object.keys(planJson).length > 0;

        // Strategic objective (uses real task progress)
        const obj = buildStrategicObjective(planJson, hasStrategy, tasks);

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

        // Coaching insight (needs totalContents, so built after content counts)
        const coach = buildCoachingInsight(tasks, firstName, hasStrategy, planCreatedAt || null, totalContents);

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
                    <div className="flex flex-col md:flex-row md:items-center gap-5 p-6 md:py-8 md:px-8">
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="w-12 h-12 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
                          <Target className="w-6 h-6" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
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
                        <h2 className="text-lg md:text-xl font-bold leading-snug">
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

                  {/* --- Ton coaching --- */}
                  <Card className="p-6 flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Ton coaching
                      </p>
                    </div>

                    {coaching && (
                      <div className="space-y-5 flex-1 flex flex-col">
                        <p className="text-sm text-foreground font-medium leading-relaxed">
                          {coaching.recap}
                        </p>

                        <div className="rounded-lg bg-muted/60 border border-border/50 p-5">
                          <p className="text-sm text-foreground leading-relaxed">
                            {coaching.suggestion}
                          </p>
                        </div>

                        <Button asChild variant="default" className="w-full gap-2 mt-auto">
                          <Link href={coaching.ctaHref}>
                            {coaching.ctaLabel} <ArrowRight className="w-4 h-4" />
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
                        Ta progression
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mb-6">
                      Tes résultats concrets
                    </p>

                    <div className="space-y-5 flex-1 flex flex-col">
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

                      <Button asChild variant="outline" size="sm" className="w-full gap-2 mt-auto">
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
