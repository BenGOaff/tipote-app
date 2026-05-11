"use client";

// Widget réutilisable : "Où en es-tu sur ton objectif du mois ?"
// Affichable sur Aujourd'hui, Stratégie, Compta — partout où l'user
// a besoin de voir d'un coup d'œil sa progression.
//
// I18N: tous les strings passent par next-intl (namespace `compta.revenueGoal`).
// formatEur + monthName utilisent useLocale() pour respecter la locale
// affichée par l'utilisateur (date + devise localisées).

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Target,
  Loader2,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export interface RevenueSummary {
  fiscal_year: number;
  current_month_eur: number;
  ytd_eur: number;
  last_year_same_month_eur: number;
  delta_month_vs_last_year_pct: number | null;
  days_remaining_in_month: number;
  objective_eur: number | null;
  progress_pct: number | null;
  remaining_eur: number | null;
  source: "transactions" | "offer_metrics" | "empty";
  has_last_year_data: boolean;
}

interface Props {
  /** Si fourni, on utilise directement. Sinon on fetch côté client. */
  initial?: RevenueSummary;
  /** Variante visuelle : "full" (carte complète) ou "compact"
   *  (juste la barre + chiffre, pour intégration dans un autre composant). */
  variant?: "full" | "compact";
}

function formatEur(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function monthName(locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date());
}

export default function RevenueGoalProgress({ initial, variant = "full" }: Props) {
  const t = useTranslations("compta.revenueGoal");
  const locale = useLocale();
  const [summary, setSummary] = useState<RevenueSummary | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/business/monthly-summary");
        const json = (await res.json()) as { ok?: boolean; summary?: RevenueSummary };
        if (!cancelled && json.ok && json.summary) setSummary(json.summary);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial]);

  if (loading) {
    return variant === "full" ? (
      <Card className="p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("loadingFull")}
      </Card>
    ) : (
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t("loadingCompact")}
      </div>
    );
  }

  if (!summary) return null;

  // Cas 1 : aucun objectif fixé → invitation à en mettre un
  if (summary.objective_eur === null || summary.objective_eur <= 0) {
    if (variant === "compact") return null;
    return (
      <Card className="p-5 space-y-3 bg-muted/30 border-dashed">
        <div className="flex items-start gap-3">
          <Target className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold">{t("noObjective.title")}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t("noObjective.body")}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings?tab=positioning">
            {t("noObjective.cta")}
            <ArrowRight className="h-3.5 w-3.5 ml-2" />
          </Link>
        </Button>
      </Card>
    );
  }

  // Cas 2 : aucun encaissement encore (transactions vides ET offer_metrics vides)
  if (summary.source === "empty") {
    if (variant === "compact") return null;
    return (
      <Card className="p-5 space-y-3">
        <div className="flex items-start gap-3">
          <Target className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold">
              {t("title", { month: monthName(locale), amount: formatEur(summary.objective_eur, locale) })}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t("noTransactions.body")}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings?tab=compta">
            {t("noTransactions.cta")}
            <ArrowRight className="h-3.5 w-3.5 ml-2" />
          </Link>
        </Button>
      </Card>
    );
  }

  // Cas 3 : on a un objectif ET des encaissements → la vraie jauge
  const pct = Math.max(0, summary.progress_pct ?? 0);
  const isReached = pct >= 100;
  const isClose = pct >= 80;
  const isBehind = pct < 50 && summary.days_remaining_in_month <= 10;
  const remaining = summary.remaining_eur ?? 0;
  const days = summary.days_remaining_in_month;

  const barColor = isReached
    ? "bg-emerald-500"
    : isClose
      ? "bg-emerald-500"
      : isBehind
        ? "bg-amber-500"
        : "bg-primary";

  let mainMessage: string;
  if (isReached) {
    mainMessage = t("status.reached", {
      current: formatEur(summary.current_month_eur, locale),
      target: formatEur(summary.objective_eur, locale),
    });
  } else if (isClose) {
    mainMessage = t(days > 1 ? "status.closeMany" : "status.closeOne", {
      remaining: formatEur(remaining, locale),
      days,
    });
  } else if (isBehind) {
    mainMessage = t(days > 1 ? "status.behindMany" : "status.behindOne", {
      remaining: formatEur(remaining, locale),
      days,
    });
  } else {
    mainMessage = t(days > 1 ? "status.onTrackMany" : "status.onTrackOne", {
      remaining: formatEur(remaining, locale),
      days,
    });
  }

  if (variant === "compact") {
    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold tabular-nums">
            {formatEur(summary.current_month_eur, locale)}{" "}
            <span className="text-xs text-muted-foreground font-normal">
              / {formatEur(summary.objective_eur, locale)}
            </span>
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {Math.round(pct)} %
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Target className={`h-5 w-5 shrink-0 mt-0.5 ${isReached ? "text-emerald-600 dark:text-emerald-400" : "text-primary"}`} />
          <div>
            <h3 className="font-semibold">
              {t("title", { month: monthName(locale), amount: formatEur(summary.objective_eur, locale) })}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">{mainMessage}</p>
          </div>
        </div>
        {isReached ? (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 rounded-full px-2 py-0.5 inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            {t("reachedBadge")}
          </span>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-bold tabular-nums">
            {formatEur(summary.current_month_eur, locale)}
          </span>
          <span className="text-sm font-medium text-muted-foreground tabular-nums">
            {Math.round(pct)} %
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>
    </Card>
  );
}
