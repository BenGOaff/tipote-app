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
import { useTranslations } from "next-intl";
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
  const t = useTranslations("highlightBadge");
  return (
    <span
      title={t("topPerformer")}
      className={cn(
        baseClasses,
        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
        className,
      )}
    >
      <Trophy className="w-3 h-3" />
      {!compact && <span>{t("top")}</span>}
    </span>
  );
}

export function TrendingBadge({ className, compact }: Props) {
  const t = useTranslations("highlightBadge");
  return (
    <span
      title={t("trendingTitle")}
      className={cn(
        baseClasses,
        "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
        className,
      )}
    >
      <Flame className="w-3 h-3" />
      {!compact && <span>{t("trending")}</span>}
    </span>
  );
}

export function NewBadge({ className, compact }: Props) {
  const t = useTranslations("highlightBadge");
  return (
    <span
      title={t("newTitle")}
      className={cn(
        baseClasses,
        "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
        className,
      )}
    >
      <Sparkles className="w-3 h-3" />
      {!compact && <span>{t("newLabel")}</span>}
    </span>
  );
}

export function NeedsAttentionBadge({ className, compact }: Props) {
  const t = useTranslations("highlightBadge");
  return (
    <span
      title={t("needsAttentionTitle")}
      className={cn(
        baseClasses,
        "bg-muted text-muted-foreground",
        className,
      )}
    >
      <AlertCircle className="w-3 h-3" />
      {!compact && <span>{t("needsAttention")}</span>}
    </span>
  );
}
