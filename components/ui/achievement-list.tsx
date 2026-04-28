// components/ui/achievement-list.tsx
// Visual gallery for the achievements computed in lib/achievements.ts.
// Drop in a settings page / profile page / dashboard side-rail.
//
//   <AchievementList items={detectAchievements(input)} />
//
// Locked badges render greyed out with the lock affordance, unlocked
// ones get the tone-tinted soft pill so the contrast is immediately
// readable — "I have 4 of these, the others are within reach".

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Rocket,
  Trophy,
  Globe,
  Flame,
  Compass,
  Library,
  Sparkles,
  Star,
  Lock,
  type LucideIcon,
} from "lucide-react";
import type { Achievement } from "@/lib/achievements";

const ICONS: Record<Achievement["icon"], LucideIcon> = {
  rocket: Rocket,
  trophy: Trophy,
  globe: Globe,
  flame: Flame,
  compass: Compass,
  library: Library,
  sparkles: Sparkles,
  star: Star,
};

const TONES: Record<Achievement["tone"], { bg: string; fg: string; ring: string }> = {
  primary: { bg: "bg-primary/10", fg: "text-primary", ring: "ring-primary/20" },
  amber: { bg: "bg-amber-100 dark:bg-amber-900/30", fg: "text-amber-700 dark:text-amber-300", ring: "ring-amber-200 dark:ring-amber-800" },
  emerald: { bg: "bg-emerald-100 dark:bg-emerald-900/30", fg: "text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-200 dark:ring-emerald-800" },
  violet: { bg: "bg-violet-100 dark:bg-violet-900/30", fg: "text-violet-700 dark:text-violet-300", ring: "ring-violet-200 dark:ring-violet-800" },
  rose: { bg: "bg-rose-100 dark:bg-rose-900/30", fg: "text-rose-700 dark:text-rose-300", ring: "ring-rose-200 dark:ring-rose-800" },
  sky: { bg: "bg-sky-100 dark:bg-sky-900/30", fg: "text-sky-700 dark:text-sky-300", ring: "ring-sky-200 dark:ring-sky-800" },
  cyan: { bg: "bg-cyan-100 dark:bg-cyan-900/30", fg: "text-cyan-700 dark:text-cyan-300", ring: "ring-cyan-200 dark:ring-cyan-800" },
};

type Props = {
  items: Achievement[];
  className?: string;
  /** Compact = 2-line label only, no hint. */
  compact?: boolean;
};

export function AchievementList({ items, className, compact }: Props) {
  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3", className)}>
      {items.map((a) => {
        const Icon = ICONS[a.icon] ?? Sparkles;
        const tone = TONES[a.tone] ?? TONES.primary;
        return (
          <div
            key={a.id}
            className={cn(
              "rounded-xl p-4 transition-all relative overflow-hidden",
              a.unlocked
                ? `bg-card border border-border/60 shadow-soft ring-1 ${tone.ring} hover:shadow-card`
                : "bg-surface-muted border border-border/40 opacity-70",
            )}
            title={a.hint}
          >
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center mb-3",
                a.unlocked ? `${tone.bg} ${tone.fg}` : "bg-muted text-muted-foreground",
              )}
              aria-hidden
            >
              {a.unlocked ? <Icon className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
            </div>
            <div className="space-y-0.5">
              <div className={cn("text-sm font-semibold leading-tight", a.unlocked ? "text-foreground" : "text-muted-foreground")}>
                {a.label}
              </div>
              {!compact && (
                <div className="text-[11px] text-muted-foreground leading-snug">
                  {a.hint}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Small summary chip — "4/10 réussis" — useful to drop next to the
 * grid title or in a sidebar.
 */
export function AchievementSummary({
  items,
  className,
}: {
  items: Achievement[];
  className?: string;
}) {
  const unlocked = items.filter((a) => a.unlocked).length;
  const total = items.length;
  const percent = total > 0 ? Math.round((unlocked / total) * 100) : 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <Sparkles className="w-3 h-3 text-primary" />
      <span className="tabular-nums">
        <span className="font-semibold text-foreground">{unlocked}</span>
        <span className="text-muted-foreground">/{total}</span>
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="tabular-nums">{percent}%</span>
    </span>
  );
}
