"use client";

// Widget réutilisable : "Où en es-tu sur ton objectif du mois ?"
// Affichable sur Aujourd'hui, Stratégie, Compta — partout où l'user
// a besoin de voir d'un coup d'œil sa progression.
//
// 3 modes :
//   • initial="data" → on fetch /api/business/monthly-summary à mount
//   • initial=<summary> → données injectées par le parent (server-side
//     fetch déjà fait → pas de roundtrip réseau côté client)
//
// Vocabulaire 100% naturel : "il te reste 4 774 € à faire en 14 jours"
// plutôt que "objective progress 52% YTD delta vs LY".

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Target,
  Loader2,
  ArrowRight,
  TrendingUp,
  TrendingDown,
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

function formatEur(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function monthName(): string {
  return new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(new Date());
}

export default function RevenueGoalProgress({ initial, variant = "full" }: Props) {
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
        Calcul de tes chiffres en cours…
      </Card>
    ) : (
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Chargement…
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
            <h3 className="font-semibold">Tu n&apos;as pas d&apos;objectif mensuel</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Fixe un objectif de revenu pour que Tipote t&apos;aide à
              le suivre — combien tu veux gagner par mois, c&apos;est
              tout. Tu pourras le modifier à tout moment.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings?tab=positioning">
            Définir mon objectif
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
              Objectif {monthName()} : {formatEur(summary.objective_eur)}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Pas encore d&apos;encaissement enregistré ce mois-ci.
              Connecte ton outil de paiement (Stripe / PayPal / Mollie)
              ou ajoute des saisies manuelles dans l&apos;onglet Compta
              pour suivre ta progression en temps réel.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings?tab=compta">
            Configurer ma compta
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

  // Couleur selon l'état
  const barColor = isReached
    ? "bg-emerald-500"
    : isClose
      ? "bg-emerald-500"
      : isBehind
        ? "bg-amber-500"
        : "bg-primary";

  // Message contextuel
  let mainMessage: string;
  if (isReached) {
    mainMessage = `🎯 Objectif atteint ! Tu as fait ${formatEur(summary.current_month_eur)} sur les ${formatEur(summary.objective_eur)} prévus.`;
  } else if (isClose) {
    mainMessage = `Plus que ${formatEur(remaining)} à faire en ${summary.days_remaining_in_month} jour${summary.days_remaining_in_month > 1 ? "s" : ""} — c&apos;est jouable.`;
  } else if (isBehind) {
    mainMessage = `Il te reste ${formatEur(remaining)} à faire et seulement ${summary.days_remaining_in_month} jour${summary.days_remaining_in_month > 1 ? "s" : ""}. Mode coup de boost recommandé.`;
  } else {
    mainMessage = `Il te reste ${formatEur(remaining)} à faire en ${summary.days_remaining_in_month} jour${summary.days_remaining_in_month > 1 ? "s" : ""}.`;
  }

  if (variant === "compact") {
    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold tabular-nums">
            {formatEur(summary.current_month_eur)}{" "}
            <span className="text-xs text-muted-foreground font-normal">
              / {formatEur(summary.objective_eur)}
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
          <Target className={`h-5 w-5 shrink-0 mt-0.5 ${isReached ? "text-emerald-600" : "text-primary"}`} />
          <div>
            <h3 className="font-semibold">
              Objectif {monthName()} : {formatEur(summary.objective_eur)}
            </h3>
            <p className="text-sm text-muted-foreground mt-1" dangerouslySetInnerHTML={{ __html: mainMessage }} />
          </div>
        </div>
        {isReached ? (
          <span className="text-xs font-medium text-emerald-600 bg-emerald-100 rounded-full px-2 py-0.5 inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            Atteint
          </span>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-bold tabular-nums">
            {formatEur(summary.current_month_eur)}
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

      {/* Comparaison avec N-1 si on a la donnée */}
      {summary.has_last_year_data && summary.delta_month_vs_last_year_pct !== null ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground border-t pt-2">
          {summary.delta_month_vs_last_year_pct > 0 ? (
            <>
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              <span>
                <strong className="text-emerald-600">
                  +{summary.delta_month_vs_last_year_pct.toFixed(1)} %
                </strong>{" "}
                vs même mois {summary.fiscal_year - 1} ({formatEur(summary.last_year_same_month_eur)})
              </span>
            </>
          ) : summary.delta_month_vs_last_year_pct < 0 ? (
            <>
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
              <span>
                <strong className="text-destructive">
                  {summary.delta_month_vs_last_year_pct.toFixed(1)} %
                </strong>{" "}
                vs même mois {summary.fiscal_year - 1} ({formatEur(summary.last_year_same_month_eur)})
              </span>
            </>
          ) : (
            <span>
              Stable vs même mois {summary.fiscal_year - 1}
            </span>
          )}
        </div>
      ) : null}
    </Card>
  );
}
