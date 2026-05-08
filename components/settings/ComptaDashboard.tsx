"use client";

// Tableau de bord compta — version "lecture business simple".
// Pas de tableau de transactions (l'user va sur Stripe pour ça),
// pas de jargon ("MRR" → "revenus récurrents", "churn" → "clients
// perdus", "YTD" → "depuis janvier"). Focus 100% sur les indicateurs
// qui éclairent une décision business.

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  CalendarDays,
  RefreshCw,
  Repeat,
  Undo2,
  UserPlus,
  UserMinus,
  Trophy,
  Loader2,
  Info,
  ExternalLink,
  Gauge,
} from "lucide-react";

interface DashboardData {
  ok: boolean;
  fiscal_year: number;
  accounting_status: string | null;
  ae_activity_type: string | null;
  metrics: {
    month_eur_cents: number;
    ytd_eur_cents: number;
    rolling_12mo_eur_cents: number;
    last_month_eur_cents: number;
    last_year_same_month_eur_cents: number;
    last_year_ytd_eur_cents: number;
    delta_month_vs_last_year_pct: number | null;
    delta_month_vs_last_month_pct: number | null;
    delta_ytd_vs_last_year_pct: number | null;
    mrr_eur_cents: number;
    mrr_last_month_eur_cents: number;
    delta_mrr_pct: number | null;
    recurring_customers_count: number;
    ytd_refunded_eur_cents: number;
    ytd_gross_eur_cents: number;
    refund_rate_ytd_pct: number;
    month_refunded_eur_cents: number;
    month_gross_eur_cents: number;
    month_sales_eur_cents: number;
    month_affiliate_eur_cents: number;
    ytd_sales_eur_cents: number;
    ytd_affiliate_eur_cents: number;
    customers_current_month_count: number;
    customers_last_month_count: number;
    new_customers_count: number;
    churned_customers_count: number;
    churn_rate_pct: number;
  };
  monthly_comparison: Array<{
    month_label: string;
    month_index: number;
    current_year_eur_cents: number;
    last_year_eur_cents: number;
  }>;
  top_products_month: Array<{
    name: string;
    amount_eur_cents: number;
    count: number;
  }>;
  vat_threshold: {
    activity_label: string;
    base_eur: number;
    major_eur: number;
    current_eur: number;
    percent_base: number;
    percent_major: number;
    over_base: boolean;
    over_major: boolean;
  } | null;
  rates: {
    currencies: string[];
    rates: Record<string, number>;
    fetched_at: string | null;
  };
  total_count: number;
}

function formatEur(cents: number, opts: { decimals?: boolean } = {}): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(cents / 100);
}

function formatPct(n: number | null): string {
  if (n === null) return "—";
  const rounded = Math.round(n * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)} %`;
}

export default function ComptaDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/compta/dashboard");
      const json = (await res.json()) as DashboardData & { error?: string };
      if (!json.ok) {
        setError(json.error ?? "Erreur");
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  if (loading) {
    return (
      <Card className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Calcul de tes chiffres en cours…
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6 text-sm text-destructive">
        Erreur de chargement : {error}
      </Card>
    );
  }

  if (!data) return null;

  const m = data.metrics;
  const fxIssue =
    data.rates.currencies.some((c) => c !== "EUR") &&
    Object.keys(data.rates.rates).length === 0;
  const noData = m.ytd_eur_cents === 0 && m.last_year_ytd_eur_cents === 0;

  return (
    <div className="space-y-4">
      {fxIssue ? (
        <Card className="p-3 bg-amber-50 border-amber-200 text-xs text-amber-900 flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0" />
          Taux de change indisponibles. Les montants en devises étrangères
          sont comptés tels quels (1:1 vers EUR).
        </Card>
      ) : null}

      {noData ? (
        <Card className="p-6 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground mb-2">
            Pas encore d&apos;encaissements à analyser.
          </p>
          <p>
            Connecte ton Stripe / PayPal / Mollie ci-dessous, ou ajoute
            des saisies manuelles. Tu verras ici tes revenus, tes
            abonnements et tes meilleures ventes dès qu&apos;il y aura
            des données.
          </p>
        </Card>
      ) : (
        <>
          {/* 4 cards en haut — les indicateurs qui comptent */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <BigStatCard
              icon={<CalendarDays className="h-5 w-5" />}
              label={`Ce mois-ci (${monthName(new Date())})`}
              value={formatEur(m.month_eur_cents)}
              delta={m.delta_month_vs_last_year_pct}
              deltaLabel={`vs même mois ${data.fiscal_year - 1}`}
            />
            <BigStatCard
              icon={<TrendingUp className="h-5 w-5" />}
              label={`Depuis janvier ${data.fiscal_year}`}
              value={formatEur(m.ytd_eur_cents)}
              delta={m.delta_ytd_vs_last_year_pct}
              deltaLabel={`vs même période ${data.fiscal_year - 1}`}
            />
            <BigStatCard
              icon={<Repeat className="h-5 w-5" />}
              label="Revenus récurrents (abonnements)"
              value={formatEur(m.mrr_eur_cents)}
              delta={m.delta_mrr_pct}
              deltaLabel="vs mois dernier"
              footer={
                m.recurring_customers_count > 0
                  ? `${m.recurring_customers_count} client${m.recurring_customers_count > 1 ? "s" : ""} avec abonnement`
                  : "Aucun abonnement détecté"
              }
            />
            <RefundCard
              ratePct={m.refund_rate_ytd_pct}
              refundedEurCents={m.ytd_refunded_eur_cents}
              monthRefundedEurCents={m.month_refunded_eur_cents}
            />
          </div>

          {/* Graph N vs N-1 */}
          <Card className="p-5 space-y-3">
            <div>
              <h3 className="font-semibold">
                Évolution mois par mois ({data.fiscal_year} vs {data.fiscal_year - 1})
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pour voir si tu progresses ou si tu décroches par rapport
                à l&apos;année dernière.
              </p>
            </div>
            <div className="h-72 w-full -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthly_comparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="month_label"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)} k` : `${v}`
                    }
                    tick={{ fontSize: 11 }}
                    width={50}
                  />
                  <Tooltip
                    formatter={(v: number) => formatEur(v * 100, { decimals: true })}
                    labelStyle={{ fontSize: 12 }}
                    contentStyle={{
                      background: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 6 }}
                    formatter={(v: string) =>
                      v === "current"
                        ? `Année en cours (${data.fiscal_year})`
                        : `Année précédente (${data.fiscal_year - 1})`
                    }
                  />
                  <Bar
                    name="current"
                    dataKey={(d: { current_year_eur_cents: number }) =>
                      d.current_year_eur_cents / 100
                    }
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    name="previous"
                    dataKey={(d: { last_year_eur_cents: number }) =>
                      d.last_year_eur_cents / 100
                    }
                    fill="hsl(var(--muted-foreground))"
                    fillOpacity={0.4}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Décomposition ventes vs commissions affiliation
              (visible seulement si l'user a effectivement des
              commissions — sinon ça ferait double emploi avec la
              card "Ce mois-ci" tout en haut). */}
          {m.month_affiliate_eur_cents > 0 || m.ytd_affiliate_eur_cents > 0 ? (
            <Card className="p-5 space-y-3">
              <h3 className="font-semibold">Ventes directes vs commissions d&apos;affiliation</h3>
              <p className="text-xs text-muted-foreground -mt-2">
                Pour distinguer ce que tu vends toi-même de ce que tu
                touches en commission sur les ventes des autres.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <SalesAffiliateSplit
                  label="Ce mois-ci"
                  salesCents={m.month_sales_eur_cents}
                  affiliateCents={m.month_affiliate_eur_cents}
                />
                <SalesAffiliateSplit
                  label="Depuis janvier"
                  salesCents={m.ytd_sales_eur_cents}
                  affiliateCents={m.ytd_affiliate_eur_cents}
                />
              </div>
            </Card>
          ) : null}

          {/* Décomposition mois en cours */}
          <div className="grid gap-3 lg:grid-cols-2">
            {/* Clients */}
            <Card className="p-5 space-y-3">
              <h3 className="font-semibold">Mes clients ce mois-ci</h3>

              <div className="grid grid-cols-3 gap-3">
                <MiniStat
                  icon={<UserPlus className="h-4 w-4 text-emerald-600" />}
                  label="Nouveaux clients"
                  value={String(m.new_customers_count)}
                />
                <MiniStat
                  icon={<Repeat className="h-4 w-4 text-primary" />}
                  label="Clients abonnés"
                  value={String(m.recurring_customers_count)}
                />
                <MiniStat
                  icon={<UserMinus className="h-4 w-4 text-destructive" />}
                  label="Clients perdus"
                  value={String(m.churned_customers_count)}
                  hint={m.churn_rate_pct > 0 ? `${m.churn_rate_pct} % des abonnés` : undefined}
                />
              </div>

              <p className="text-xs text-muted-foreground border-t pt-3">
                <strong>{m.customers_current_month_count}</strong> client
                {m.customers_current_month_count > 1 ? "s" : ""} au total ce mois-ci.
                {m.churned_customers_count > 0 ? (
                  <>
                    {" "}
                    <strong className="text-destructive">
                      {m.churned_customers_count} abonné
                      {m.churned_customers_count > 1 ? "s ont" : " a"} arrêté
                    </strong>{" "}
                    depuis le mois dernier — pense à comprendre pourquoi
                    (relance, message ?).
                  </>
                ) : null}
              </p>
            </Card>

            {/* Top produits */}
            <Card className="p-5 space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                Mes meilleures ventes ce mois-ci
              </h3>
              {data.top_products_month.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Aucune vente ce mois-ci pour l&apos;instant.
                </p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {data.top_products_month.map((p, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 border-b pb-1.5 last:border-b-0">
                      <span className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-muted-foreground tabular-nums w-5 shrink-0">
                          {i + 1}.
                        </span>
                        <span className="truncate">{p.name}</span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="font-semibold tabular-nums">
                          {formatEur(p.amount_eur_cents)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ×{p.count}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          {/* Jauge TVA franchise (AE) */}
          {data.vat_threshold ? (
            <VatGaugeCard t={data.vat_threshold} />
          ) : null}
        </>
      )}

      <div className="flex items-center justify-end">
        <Button variant="ghost" size="sm" onClick={reload}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" />
          Rafraîchir
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center px-2">
        Calculé à partir de tes connexions Stripe / PayPal / Mollie + tes
        saisies manuelles.{" "}
        {data.rates.fetched_at ? (
          <>
            Taux de change EUR récupérés via{" "}
            <a
              href="https://www.frankfurter.app"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground inline-flex items-center gap-0.5"
            >
              frankfurter.app
              <ExternalLink className="h-3 w-3" />
            </a>{" "}
            (open data BCE).
          </>
        ) : null}
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Une grosse card stat avec delta % vs N-1
 * ────────────────────────────────────────────────────────────────── */

function BigStatCard({
  icon,
  label,
  value,
  delta,
  deltaLabel,
  footer,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  footer?: string;
}) {
  return (
    <Card className="p-5 space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {delta !== undefined && deltaLabel ? <DeltaBadge value={delta} label={deltaLabel} /> : null}
      {footer ? <p className="text-xs text-muted-foreground pt-1 border-t">{footer}</p> : null}
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Card spéciale "remboursements"
 * ────────────────────────────────────────────────────────────────── */

function RefundCard({
  ratePct,
  refundedEurCents,
  monthRefundedEurCents,
}: {
  ratePct: number;
  refundedEurCents: number;
  monthRefundedEurCents: number;
}) {
  const isHigh = ratePct >= 5;
  return (
    <Card className="p-5 space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Undo2 className="h-5 w-5" />
        <span className="text-xs font-medium">Remboursements (depuis janvier)</span>
      </div>
      <div className="text-2xl font-bold tabular-nums">
        {ratePct.toFixed(1)} %
      </div>
      <p className={`text-xs ${isHigh ? "text-destructive" : "text-muted-foreground"}`}>
        {formatEur(refundedEurCents)} remboursés cette année
        {monthRefundedEurCents > 0 ? (
          <>
            {" "}— dont <strong>{formatEur(monthRefundedEurCents)}</strong> ce mois-ci
          </>
        ) : null}
      </p>
      {isHigh ? (
        <p className="text-xs text-destructive border-t pt-2">
          Taux élevé — vérifie tes pages de vente ou la qualité de la livraison.
        </p>
      ) : null}
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Mini stat (compact, pour grille de 3)
 * ────────────────────────────────────────────────────────────────── */

function MiniStat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Badge delta (vert si +, rouge si -, gris si stable, gris si null)
 * ────────────────────────────────────────────────────────────────── */

function DeltaBadge({ value, label }: { value: number | null; label: string }) {
  if (value === null) {
    return (
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <Minus className="h-3 w-3" />
        Pas de comparaison ({label})
      </p>
    );
  }
  const isUp = value > 0;
  const isFlat = Math.abs(value) < 0.5;
  if (isFlat) {
    return (
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <Minus className="h-3 w-3" />
        Stable {label}
      </p>
    );
  }
  return (
    <p
      className={`text-xs inline-flex items-center gap-1.5 ${
        isUp ? "text-emerald-600" : "text-destructive"
      }`}
    >
      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      <strong>{formatPct(value)}</strong>
      <span className="text-muted-foreground">{label}</span>
    </p>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Jauge TVA franchise (auto-entrepreneur)
 * ────────────────────────────────────────────────────────────────── */

function VatGaugeCard({ t }: { t: NonNullable<DashboardData["vat_threshold"]> }) {
  const status = (() => {
    if (t.over_major) return { color: "text-destructive", bg: "bg-destructive", text: "Seuil majoré dépassé — sortie de la franchise immédiate" };
    if (t.over_base) return { color: "text-destructive", bg: "bg-destructive", text: "Seuil de base dépassé — passage à la TVA dans les semaines à venir" };
    if (t.percent_base >= 80) return { color: "text-amber-600", bg: "bg-amber-500", text: "Attention, tu approches du seuil" };
    return { color: "text-emerald-600", bg: "bg-emerald-500", text: "Tu es sous le seuil" };
  })();

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Gauge className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Franchise TVA — où tu en es ?</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Calcul sur tes 12 derniers mois ({t.activity_label}). Tant que tu
        es en dessous du seuil, tu ne factures pas la TVA à tes clients.
      </p>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xl font-bold tabular-nums">
            {Math.round(t.percent_base)}%
          </span>
          <span className={`text-sm font-medium ${status.color}`}>
            {status.text}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full ${status.bg} transition-all`}
            style={{ width: `${Math.min(100, t.percent_base)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>
            {new Intl.NumberFormat("fr-FR").format(Math.round(t.current_eur))} €
          </span>
          <span>
            seuil : {new Intl.NumberFormat("fr-FR").format(t.base_eur)} €
          </span>
        </div>
      </div>

      {(t.over_base || t.percent_base >= 80) && (
        <a
          href="https://www.service-public.fr/professionnels-entreprises/vosdroits/F32353"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:text-primary/80 underline inline-flex items-center gap-0.5"
        >
          Comment fonctionne la franchise TVA ?
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────── */

function monthName(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(d);
}

/* ──────────────────────────────────────────────────────────────────
 * Mini composant : décomposition ventes / commissions
 * ────────────────────────────────────────────────────────────────── */

function SalesAffiliateSplit({
  label,
  salesCents,
  affiliateCents,
}: {
  label: string;
  salesCents: number;
  affiliateCents: number;
}) {
  const total = salesCents + affiliateCents;
  const salesPct = total > 0 ? Math.round((salesCents / total) * 100) : 0;
  const affiliatePct = 100 - salesPct;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold tabular-nums">{formatEur(total)}</span>
        <span className="text-xs text-muted-foreground">au total</span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary" />
            Ventes directes
          </span>
          <span className="tabular-nums">
            <strong>{formatEur(salesCents)}</strong>{" "}
            <span className="text-muted-foreground">({salesPct} %)</span>
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Commissions
          </span>
          <span className="tabular-nums">
            <strong>{formatEur(affiliateCents)}</strong>{" "}
            <span className="text-muted-foreground">({affiliatePct} %)</span>
          </span>
        </div>
        {/* Barre de proportion */}
        <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${salesPct}%` }}
          />
          <div
            className="h-full bg-amber-500 transition-all"
            style={{ width: `${affiliatePct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
