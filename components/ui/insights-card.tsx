"use client";

// components/ui/insights-card.tsx
// Visual surface for the rule-based insights from lib/insights.ts.
// Pass the array straight from computeInsights() and the component
// figures out the rest — including the i18n lookup.
//
// I18N: Insight carries a messageKey + params, never raw strings.

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Insight } from "@/lib/insights";

const TONES: Record<
  Insight["tone"],
  { icon: React.ComponentType<{ className?: string }>; bg: string; fg: string }
> = {
  warning: { icon: AlertTriangle, bg: "bg-amber-100 dark:bg-amber-900/30", fg: "text-amber-700 dark:text-amber-300" },
  success: { icon: CheckCircle2, bg: "bg-emerald-100 dark:bg-emerald-900/30", fg: "text-emerald-700 dark:text-emerald-300" },
  info: { icon: Lightbulb, bg: "bg-sky-100 dark:bg-sky-900/30", fg: "text-sky-700 dark:text-sky-300" },
  primary: { icon: Sparkles, bg: "bg-primary/10", fg: "text-primary" },
};

type Props = {
  insights: Insight[];
  className?: string;
};

export function InsightsList({ insights, className }: Props) {
  const t = useTranslations("dashboard.insights");
  if (insights.length === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
      <div className="space-y-2">
        {insights.map((i) => {
          const tone = TONES[i.tone] ?? TONES.primary;
          const Icon = tone.icon;

          const params: Record<string, string | number> = { ...i.params };
          if (i.messageKey === "quietProject") {
            const kindKey = i.params.kind === "survey" ? "titleSurvey" : "titleQuiz";
            params.kind = t(`quietProject.${kindKey}`);
          }
          if ("name" in i.params && !params.name) {
            params.name = t("untitled");
          }

          const title = t(`${i.messageKey}.title`, params);
          const bodyKey = i.bodyVariant
            ? i.bodyVariant === "one"
              ? "bodyOne"
              : "bodyMany"
            : "body";
          const body = t(`${i.messageKey}.${bodyKey}`, params);
          const cta = t(`${i.messageKey}.cta`);

          return (
            <div
              key={i.id}
              className={cn(
                "rounded-xl bg-card border border-border/60 shadow-soft p-4",
                "flex items-start gap-3",
              )}
            >
              <div
                className={cn(
                  "shrink-0 w-9 h-9 rounded-full flex items-center justify-center",
                  tone.bg,
                  tone.fg,
                )}
                aria-hidden
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="text-sm font-semibold text-foreground leading-tight">
                  {title}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
              </div>
              <Button asChild size="sm" variant="ghost" className="rounded-full shrink-0 -my-1">
                <Link href={i.ctaHref}>
                  {cta}
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
