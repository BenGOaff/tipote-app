// components/dashboard/StarterPlanBanner.tsx
// Objectif onboarding 3.0 (A1) : rendre le “plan de départ” visible immédiatement post-onboarding
// Source de vérité : business_plan.plan_json (best-effort, fail-open)

"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, Target } from "lucide-react";

function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean).join(", ");
  return "";
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(toStr).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    const parts = s.includes("|") ? s.split("|") : s.split(",");
    return parts.map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

type StarterGoal = {
  title: string;
  why: string;
  metric: string;
  first_actions: string[];
};

function extractStarterPlan(planJson: unknown): {
  strategy_summary: string;
  strategy_goals: StarterGoal[];
  dashboard_focus: string[];
} {
  const pj: any = planJson && typeof planJson === "object" ? (planJson as any) : null;

  const summary = toStr(pj?.strategy_summary ?? pj?.summary ?? "").trim();

  const goalsRaw = Array.isArray(pj?.strategy_goals) ? pj.strategy_goals : [];
  const goals: StarterGoal[] = goalsRaw
    .map((g: any) => ({
      title: toStr(g?.title).trim(),
      why: toStr(g?.why).trim(),
      metric: toStr(g?.metric).trim(),
      first_actions: Array.isArray(g?.first_actions)
        ? g.first_actions.map(toStr).map((s: string) => s.trim()).filter(Boolean).slice(0, 5)
        : [],
    }))
    .filter((g: StarterGoal) => !!g.title);

  const focus = asStringArray(pj?.dashboard_focus ?? pj?.focus ?? pj?.focus_tags ?? []);

  return {
    strategy_summary: summary,
    strategy_goals: goals,
    dashboard_focus: focus,
  };
}

export default function StarterPlanBanner({ planJson }: { planJson: unknown | null }) {
  if (!planJson) return null;

  const extracted = extractStarterPlan(planJson);
  const hasAnything =
    !!extracted.strategy_summary ||
    (extracted.strategy_goals?.length ?? 0) > 0 ||
    (extracted.dashboard_focus?.length ?? 0) > 0;

  if (!hasAnything) return null;

  const goalsToShow = (extracted.strategy_goals ?? []).slice(0, 3);
  const focusToShow = (extracted.dashboard_focus ?? []).slice(0, 6);

  return (
    <div className="px-6 md:px-8 pt-6 md:pt-8">
      <Card className="p-6 md:p-8">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Ton plan de départ</p>
                <h2 className="text-xl md:text-2xl font-bold truncate">Ce que Tipote a compris</h2>
              </div>
            </div>

            {focusToShow.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-4">
                {focusToShow.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>
            ) : null}

            {extracted.strategy_summary ? (
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-5">
                {extracted.strategy_summary}
              </p>
            ) : null}

            {goalsToShow.length > 0 ? (
              <div className="space-y-3">
                {goalsToShow.map((g) => (
                  <div key={g.title} className="rounded-xl border border-border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Target className="w-4 h-4 text-primary" />
                          <p className="font-semibold truncate">{g.title}</p>
                        </div>
                        {g.why ? <p className="text-sm text-muted-foreground">{g.why}</p> : null}
                      </div>
                      {g.metric ? (
                        <Badge className="shrink-0" variant="secondary">
                          {g.metric}
                        </Badge>
                      ) : null}
                    </div>

                    {g.first_actions?.length ? (
                      <ul className="mt-3 space-y-1 text-sm text-muted-foreground list-disc pl-5">
                        {g.first_actions.slice(0, 3).map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="hidden md:flex flex-col gap-3 shrink-0">
            <Button asChild className="gap-2">
              <Link href="/strategy">
                Voir la stratégie <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/tasks">Voir mes tâches</Link>
            </Button>
          </div>
        </div>

        <div className="mt-5 md:hidden flex gap-3">
          <Button asChild className="flex-1 gap-2">
            <Link href="/strategy">
              Stratégie <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href="/tasks">Tâches</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
