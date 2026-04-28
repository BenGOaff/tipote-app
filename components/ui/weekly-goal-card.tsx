// components/ui/weekly-goal-card.tsx
// Visual surface for the weekly goal picked by lib/weekly-goal.ts.
// Designed to drop on the Dashboard hero — one card, one CTA, one
// optional progress bar.
//
//   const goal = pickWeeklyGoal(input);
//   if (goal) <WeeklyGoalCard goal={goal} />
//
// If the input maps to no goal (rare — only when the user has hit
// every milestone we track), the parent simply skips rendering. The
// card never goes empty.

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { WeeklyGoal } from "@/lib/weekly-goal";

type Props = {
  goal: WeeklyGoal;
  className?: string;
};

export function WeeklyGoalCard({ goal, className }: Props) {
  const pct =
    typeof goal.progress === "number"
      ? Math.round(Math.max(0, Math.min(1, goal.progress)) * 100)
      : null;

  return (
    <div
      className={cn(
        // Soft tinted card — feels like guidance, not a full-blown banner.
        // bg-surface-soft is the brand-tinted surface we already defined.
        "rounded-xl bg-surface-soft border border-primary/10 p-5 sm:p-6",
        "flex flex-col sm:flex-row sm:items-center gap-4",
        "shadow-soft",
        className,
      )}
    >
      <div className="shrink-0 w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center" aria-hidden>
        <Target className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-primary">
          Objectif de la semaine
        </div>
        <h3 className="text-base sm:text-lg font-semibold leading-tight text-foreground">
          {goal.title}
        </h3>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {goal.description}
        </p>
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
          {goal.ctaLabel}
          <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
        </Link>
      </Button>
    </div>
  );
}
