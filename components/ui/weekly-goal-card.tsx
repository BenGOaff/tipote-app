"use client";

// components/ui/weekly-goal-card.tsx
// Visual surface for the weekly goal picked by lib/weekly-goal.ts.
//
//   const goal = pickWeeklyGoal(input);
//   if (goal) <WeeklyGoalCard goal={goal} />
//
// I18N: WeeklyGoal carries a messageKey + params; this component
// looks up `dashboard.weeklyGoal.{messageKey}.{title,desc,cta}` so the
// card always renders in the user's locale.

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { WeeklyGoal } from "@/lib/weekly-goal";

type Props = {
  goal: WeeklyGoal;
  className?: string;
};

export function WeeklyGoalCard({ goal, className }: Props) {
  const t = useTranslations("dashboard.weeklyGoal");

  const pct =
    typeof goal.progress === "number"
      ? Math.round(Math.max(0, Math.min(1, goal.progress)) * 100)
      : null;

  const title = t(`${goal.messageKey}.title`);
  const desc = t(`${goal.messageKey}.desc`, goal.params ?? {});
  const cta = t(`${goal.messageKey}.cta`);

  return (
    <div
      className={cn(
        "rounded-xl bg-surface-soft border border-primary/10 p-5 sm:p-6",
        "flex flex-col sm:flex-row sm:items-center gap-4",
        "shadow-soft",
        className,
      )}
    >
      <div
        className="shrink-0 w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center"
        aria-hidden
      >
        <Target className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-primary">
          {t("objectiveLabel")}
        </div>
        <h3 className="text-base sm:text-lg font-semibold leading-tight text-foreground">
          {title}
        </h3>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{desc}</p>
        {pct !== null && (
          <div className="pt-2">
            <div className="h-1.5 w-full rounded-full bg-card overflow-hidden">
              <div
                className="h-full bg-primary transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">{pct}%</div>
          </div>
        )}
      </div>
      <Button asChild size="sm" className="shrink-0 rounded-full">
        <Link href={goal.ctaHref}>
          {cta}
          <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
        </Link>
      </Button>
    </div>
  );
}
