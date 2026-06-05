"use client";

// components/dashboard/WallOfWins.tsx
//
// Carte "Ce mois avec Tipote" affichée en haut du dashboard. Phase 2
// de ROADMAP_RETENTION.md.
//
// RÈGLE BÉNÉ (1er juin 2026) : si `hasResults` est false (aucun lead,
// aucune vente, aucun post, aucun quiz complete, aucun partage, aucun
// milestone sur la fenêtre), on REND NULL. Un dashboard "0 partout"
// démotive et augmente le churn — c'est l'inverse de l'effet voulu.
//
// Fetch unique au mount + au changement de période. Cache-busted via
// fetch cache: "no-store" pour que le user qui débloque un milestone
// le voie au prochain refresh (sans avoir à attendre un revalidate).

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { stripHtml } from "@/lib/richText";

type Period = "month" | "30d" | "90d";

interface Stats {
  leadsCaptured: number;
  postsPublished: number;
  quizCompletes: number;
  quizShares: number;
  salesCount: number;
  salesAmountCents: number;
  hoursSavedEstimate: number;
  topQuiz: { id: string; title: string; completes: number } | null;
  milestonesUnlocked: Array<{
    key: string;
    emoji: string;
    title: string;
    unlockedAt: string;
  }>;
}

interface WallOfWinsResponse {
  ok: boolean;
  period: Period;
  hasResults: boolean;
  current: Stats;
  previous: Stats;
  range: { since: string; until: string };
  error?: string;
}

const PERIOD_LABELS: Record<Period, string> = {
  month: "Ce mois",
  "30d": "30 derniers jours",
  "90d": "90 derniers jours",
};

const NUMBER_FMT = new Intl.NumberFormat("fr-FR");
const CURRENCY_FMT = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatCount(n: number): string {
  return NUMBER_FMT.format(n);
}

function formatEur(cents: number): string {
  return CURRENCY_FMT.format(Math.round(cents / 100));
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${NUMBER_FMT.format(Math.round(h * 10) / 10)} h`;
}

function delta(current: number, previous: number): {
  label: string;
  direction: "up" | "down" | "flat";
} {
  if (previous === 0 && current === 0) return { label: "—", direction: "flat" };
  if (previous === 0) return { label: "Nouveau", direction: "up" };
  const diff = current - previous;
  if (diff === 0) return { label: "= période préc.", direction: "flat" };
  const pct = Math.round((diff / previous) * 100);
  const sign = diff > 0 ? "+" : "";
  return {
    label: `${sign}${pct} %`,
    direction: diff > 0 ? "up" : "down",
  };
}

function DeltaBadge({ value }: { value: ReturnType<typeof delta> }) {
  const Icon =
    value.direction === "up"
      ? TrendingUp
      : value.direction === "down"
        ? TrendingDown
        : Minus;
  const colorClass =
    value.direction === "up"
      ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30"
      : value.direction === "down"
        ? "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30"
        : "text-muted-foreground bg-muted/40";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${colorClass}`}
    >
      <Icon className="w-3 h-3" />
      {value.label}
    </span>
  );
}

function StatTile({
  label,
  value,
  deltaValue,
  highlight = false,
}: {
  label: string;
  value: string;
  deltaValue?: ReturnType<typeof delta>;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border ${
        highlight
          ? "border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/40 dark:bg-indigo-950/20"
          : "border-border/60 bg-background"
      } px-3 py-2.5`}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-semibold text-foreground mt-0.5 leading-tight">
        {value}
      </p>
      {deltaValue && (
        <div className="mt-1">
          <DeltaBadge value={deltaValue} />
        </div>
      )}
    </div>
  );
}

export function WallOfWins() {
  const [period, setPeriod] = useState<Period>("month");
  const [payload, setPayload] = useState<WallOfWinsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/dashboard/wall-of-wins?period=${period}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((r) => r.json())
      .then((data: WallOfWinsResponse) => {
        if (!cancelled) setPayload(data?.ok ? data : null);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const deltas = useMemo(() => {
    if (!payload?.current || !payload?.previous) return null;
    return {
      leads: delta(payload.current.leadsCaptured, payload.previous.leadsCaptured),
      posts: delta(payload.current.postsPublished, payload.previous.postsPublished),
      completes: delta(payload.current.quizCompletes, payload.previous.quizCompletes),
      sales: delta(payload.current.salesCount, payload.previous.salesCount),
      revenue: delta(
        payload.current.salesAmountCents,
        payload.previous.salesAmountCents,
      ),
    };
  }, [payload]);

  // Loading : on n'affiche RIEN (pas de skeleton) plutôt que de pre-flasher
  // la carte. Si finalement hasResults=false, l'user n'aura pas vu un
  // skeleton inutilement.
  if (loading) return null;
  if (!payload?.ok || !payload.hasResults) return null;

  const c = payload.current;
  return (
    <Card className="border-indigo-200 dark:border-indigo-800/40 bg-gradient-to-br from-indigo-50/40 via-background to-background dark:from-indigo-950/20 overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Ce que Tipote t&apos;a apporté
              </h3>
              <p className="text-xs text-muted-foreground">
                {PERIOD_LABELS[payload.period]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <Button
                key={p}
                variant={p === period ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {c.leadsCaptured > 0 && (
            <StatTile
              label="Leads"
              value={formatCount(c.leadsCaptured)}
              deltaValue={deltas?.leads}
            />
          )}
          {c.salesCount > 0 && (
            <StatTile
              label="Ventes"
              value={formatCount(c.salesCount)}
              deltaValue={deltas?.sales}
              highlight
            />
          )}
          {c.salesAmountCents > 0 && (
            <StatTile
              label="CA"
              value={formatEur(c.salesAmountCents)}
              deltaValue={deltas?.revenue}
              highlight
            />
          )}
          {c.postsPublished > 0 && (
            <StatTile
              label="Posts"
              value={formatCount(c.postsPublished)}
              deltaValue={deltas?.posts}
            />
          )}
          {c.quizCompletes > 0 && (
            <StatTile
              label="Quiz finis"
              value={formatCount(c.quizCompletes)}
              deltaValue={deltas?.completes}
            />
          )}
          {c.hoursSavedEstimate > 0 && (
            <StatTile
              label="Temps gagné"
              value={formatHours(c.hoursSavedEstimate)}
            />
          )}
        </div>

        {(c.topQuiz || c.milestonesUnlocked.length > 0) && (
          <div className="mt-4 pt-4 border-t border-indigo-100 dark:border-indigo-900/40 grid md:grid-cols-2 gap-3">
            {c.topQuiz && (
              <div className="flex items-center gap-3 rounded-lg bg-background/80 border border-border/50 px-3 py-2">
                <span className="text-base">🏆</span>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Top quiz de la période
                  </p>
                  <p className="text-sm font-medium text-foreground truncate">
                    {stripHtml(c.topQuiz.title) || c.topQuiz.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatCount(c.topQuiz.completes)} complétions
                  </p>
                </div>
              </div>
            )}
            {c.milestonesUnlocked.length > 0 && (
              <div className="rounded-lg bg-background/80 border border-border/50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Milestones débloqués
                </p>
                <ul className="mt-1 space-y-0.5">
                  {c.milestonesUnlocked.slice(0, 3).map((m) => (
                    <li
                      key={m.key}
                      className="text-sm text-foreground flex items-center gap-1.5"
                    >
                      <span>{m.emoji}</span>
                      <span className="truncate">{m.title}</span>
                    </li>
                  ))}
                  {c.milestonesUnlocked.length > 3 && (
                    <li className="text-xs text-muted-foreground pt-0.5">
                      + {c.milestonesUnlocked.length - 3} de plus
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
