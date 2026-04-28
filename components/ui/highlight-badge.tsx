// components/ui/highlight-badge.tsx
// Small contextual badges that turn raw numbers into a feeling.
//
//  <TopPerformerBadge />        // 🏆 Top performer
//  <TrendingBadge />            // 🔥 En forme
//  <NewBadge />                 // ✨ Nouveau
//  <NeedsAttentionBadge />      // ⚠️ À regarder
//
// Use sparingly — the whole point is that they only appear on the row
// that earned them. If they're on every row they stop meaning anything.

import * as React from "react";
import { cn } from "@/lib/utils";
import { Trophy, Flame, Sparkles, AlertCircle } from "lucide-react";

type Props = {
  className?: string;
  /** Compact mode: icon only, full label on hover via title attr. */
  compact?: boolean;
};

const baseClasses =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider";

export function TopPerformerBadge({ className, compact }: Props) {
  return (
    <span
      title="Top performer"
      className={cn(
        baseClasses,
        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
        className,
      )}
    >
      <Trophy className="w-3 h-3" />
      {!compact && <span>Top</span>}
    </span>
  );
}

export function TrendingBadge({ className, compact }: Props) {
  return (
    <span
      title="En forme — beaucoup d'activité récente"
      className={cn(
        baseClasses,
        "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
        className,
      )}
    >
      <Flame className="w-3 h-3" />
      {!compact && <span>En forme</span>}
    </span>
  );
}

export function NewBadge({ className, compact }: Props) {
  return (
    <span
      title="Nouveau"
      className={cn(
        baseClasses,
        "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
        className,
      )}
    >
      <Sparkles className="w-3 h-3" />
      {!compact && <span>Nouveau</span>}
    </span>
  );
}

export function NeedsAttentionBadge({ className, compact }: Props) {
  return (
    <span
      title="À regarder — peu d'activité"
      className={cn(
        baseClasses,
        "bg-muted text-muted-foreground",
        className,
      )}
    >
      <AlertCircle className="w-3 h-3" />
      {!compact && <span>À regarder</span>}
    </span>
  );
}
