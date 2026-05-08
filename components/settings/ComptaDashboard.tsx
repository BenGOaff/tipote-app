"use client";

// Tableau de bord compta (étape 1f).
//
// Synthèse en haut de l'onglet Compta :
//   • CA depuis le 1er janvier (YTD)
//   • CA sur 12 mois glissants (utile pour la jauge franchise TVA)
//   • Jauge franchise TVA (auto-entrepreneur uniquement) — couleurs :
//       vert < 80%, orange 80%-100%, rouge > 100% (seuil base) /
//       sortie immédiate au-delà du seuil major
//   • Graph par mois (24 derniers) en barres
//   • Tableau "Mes encaissements" (200 plus récents) : agrégation
//     transactions PSP + saisies manuelles
//
// Toutes les agrégations sont calculées côté serveur dans
// /api/compta/dashboard pour rester rapides côté client. Conversion
// EUR via frankfurter.app, taux du jour.

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  CalendarDays,
  Gauge,
  Loader2,
  Info,
  ExternalLink,
  Receipt,
} from "lucide-react";

interface DashboardData {
  ok: boolean;
  stats: {
    ytd: { amount_eur_cents: number; count: number };
    rolling: { amount_eur_cents: number; count: number };
    currencies: string[];
    rates: Record<string, number>;
    rates_fetched_at: string | null;
  };
  accounting_status: string | null;
  ae_activity_type: string | null;
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
  months: Array<{ month: string; amount_eur_cents: number; count: number }>;
  recent_transactions: Array<{
    id: string;
    paid_at: string;
    amount_cents: number;
    refunded_cents: number;
    currency: string;
    amount_eur_cents: number;
    status: string;
    source: string;
    customer_name: string | null;
    description: string | null;
  }>;
  total_count: number;
}

const SOURCE_LABELS: Record<string, string> = {
  stripe: "Stripe",
  paypal: "PayPal",
  mollie: "Mollie",
  manual: "Saisie manuelle",
};

const SOURCE_COLORS: Record<string, string> = {
  stripe: "bg-[#635bff]/10 text-[#635bff]",
  paypal: "bg-[#0070ba]/10 text-[#0070ba]",
  mollie: "bg-[#0d2f3f]/10 text-[#0d2f3f]",
  manual: "bg-muted text-muted-foreground",
};

function formatEur(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatEurDetailed(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatMonthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  if (!y || !m) return yyyymm;
  const months = [
    "janv.", "févr.", "mars", "avr.", "mai", "juin",
    "juil.", "août", "sept.", "oct.", "nov.", "déc.",
  ];
  return `${months[parseInt(m, 10) - 1] ?? m} ${y.slice(2)}`;
}

function formatDateFR(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
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
        Calcul de ton tableau de bord…
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

  const hasAnyRevenue = data.stats.ytd.count > 0 || data.stats.rolling.count > 0;

  return (
    <div className="space-y-4">
      {/* Bandeau "rates indispo" si frankfurter a foiré */}
      {data.stats.currencies.some((c) => c !== "EUR") &&
      Object.keys(data.stats.rates).length === 0 ? (
        <Card className="p-3 bg-amber-50 border-amber-200 text-xs text-amber-900 flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0" />
          Taux de change indisponibles pour le moment — les montants en
          devises étrangères sont affichés à leur valeur d&apos;origine
          (1:1 vers EUR). Réessaie dans quelques minutes.
        </Card>
      ) : null}

      {/* 3 cards stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<CalendarDays className="h-5 w-5" />}
          label="Depuis le 1er janvier"
          value={formatEur(data.stats.ytd.amount_eur_cents)}
          subtitle={
            data.stats.ytd.count > 0
              ? `${data.stats.ytd.count} encaissement${data.stats.ytd.count > 1 ? "s" : ""}`
              : "Aucun encaissement enregistré"
          }
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Sur les 12 derniers mois"
          value={formatEur(data.stats.rolling.amount_eur_cents)}
          subtitle={
            data.stats.rolling.count > 0
              ? `${data.stats.rolling.count} encaissement${data.stats.rolling.count > 1 ? "s" : ""}`
              : "Aucun encaissement enregistré"
          }
        />
        {data.vat_threshold ? (
          <VatGauge t={data.vat_threshold} />
        ) : (
          <StatCard
            icon={<Gauge className="h-5 w-5 text-muted-foreground" />}
            label="Jauge TVA"
            value="—"
            subtitle={
              data.accounting_status === "auto_entrepreneur"
                ? "Configure ton activité pour voir le seuil"
                : "Pas applicable à ton statut"
            }
            muted
          />
        )}
      </div>

      {/* Graph mensuel — 24 derniers mois */}
      {hasAnyRevenue ? (
        <Card className="p-5 space-y-3">
          <div>
            <h3 className="font-semibold">Encaissements par mois</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sur les 24 derniers mois, toutes sources confondues. Montants en EUR.
            </p>
          </div>
          <div className="h-64 w-full -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.months}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonthLabel}
                  tick={{ fontSize: 11 }}
                  interval={1}
                />
                <YAxis
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)} k` : `${v}`
                  }
                  tick={{ fontSize: 11 }}
                  width={50}
                />
                <Tooltip
                  formatter={(v: number) => formatEurDetailed(v * 100)}
                  labelFormatter={(l: string) => formatMonthLabel(l)}
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey={(d: { amount_eur_cents: number }) => d.amount_eur_cents / 100}
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}

      {/* Tableau "Mes encaissements" */}
      <Card className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Mes encaissements
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.total_count > 0
                ? `${data.recent_transactions.length} sur ${data.total_count} encaissement${data.total_count > 1 ? "s" : ""} (24 derniers mois)`
                : "Aucun encaissement encore. Connecte tes outils de paiement ou ajoute une saisie manuelle."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reload}>
            Rafraîchir
          </Button>
        </div>

        {data.recent_transactions.length > 0 ? (
          <div className="border rounded-md divide-y overflow-hidden">
            {data.recent_transactions.map((t) => (
              <TransactionRow key={`${t.source}-${t.id}`} t={t} />
            ))}
          </div>
        ) : null}
      </Card>

      {/* Source des données (transparence) */}
      <p className="text-xs text-muted-foreground text-center px-2">
        Calculé à partir de tes connexions Stripe / PayPal / Mollie + tes
        saisies manuelles.
        {data.stats.rates_fetched_at ? (
          <>
            {" "}Taux de change EUR récupérés{" "}
            <span title={data.stats.rates_fetched_at}>
              il y a moins d&apos;une heure
            </span>{" "}
            via{" "}
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
 * StatCard — chiffre + label + sous-titre, format card
 * ────────────────────────────────────────────────────────────────── */

function StatCard({
  icon,
  label,
  value,
  subtitle,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  muted?: boolean;
}) {
  return (
    <Card className={`p-5 space-y-2 ${muted ? "bg-muted/40" : ""}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Jauge franchise TVA (AE seulement)
 * ────────────────────────────────────────────────────────────────── */

function VatGauge({ t }: { t: NonNullable<DashboardData["vat_threshold"]> }) {
  // Couleurs selon le pourcentage atteint
  const status = useMemo(() => {
    if (t.over_major) return { color: "text-destructive", bg: "bg-destructive", text: "Seuil majoré dépassé" };
    if (t.over_base) return { color: "text-destructive", bg: "bg-destructive", text: "Seuil de base dépassé" };
    if (t.percent_base >= 80) return { color: "text-amber-600", bg: "bg-amber-500", text: "Attention, proche du seuil" };
    return { color: "text-emerald-600", bg: "bg-emerald-500", text: "Sous le seuil" };
  }, [t]);

  return (
    <Card className="p-5 space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Gauge className="h-5 w-5" />
        <span className="text-sm font-medium">Franchise TVA</span>
      </div>
      <div className="space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">
            {Math.round(t.percent_base)}%
          </span>
          <span className={`text-xs font-medium ${status.color}`}>
            · {status.text}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t.activity_label}
        </p>
      </div>

      {/* Barre de progression sur le seuil de BASE.  */}
      <div className="space-y-1">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full ${status.bg} transition-all`}
            style={{ width: `${Math.min(100, t.percent_base)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>
            {new Intl.NumberFormat("fr-FR").format(t.current_eur)} €
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
          Détails de la franchise TVA
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * TransactionRow — une ligne dans le tableau Mes encaissements
 * ────────────────────────────────────────────────────────────────── */

function TransactionRow({
  t,
}: {
  t: DashboardData["recent_transactions"][number];
}) {
  const sourceColor = SOURCE_COLORS[t.source] ?? "bg-muted text-muted-foreground";
  const sourceLabel = SOURCE_LABELS[t.source] ?? t.source;
  const isNegative = t.amount_eur_cents < 0;

  // Si la devise n'est pas EUR, on affiche les 2 montants
  const showOriginal = t.currency !== "EUR";
  const refunded = t.refunded_cents > 0;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-semibold tabular-nums ${isNegative ? "text-destructive" : ""}`}>
            {formatEurDetailed(t.amount_eur_cents)}
          </span>
          {showOriginal ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              ({(t.amount_cents / 100).toFixed(2)} {t.currency})
            </span>
          ) : null}
          <span
            className={`text-[10px] uppercase tracking-wide font-semibold rounded px-1.5 py-0.5 ${sourceColor}`}
          >
            {sourceLabel}
          </span>
          {refunded ? (
            <span className="text-[10px] uppercase tracking-wide font-semibold rounded px-1.5 py-0.5 bg-destructive/10 text-destructive">
              {t.refunded_cents >= t.amount_cents ? "Remboursé" : "Remb. partiel"}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {formatDateFR(t.paid_at)}
          </span>
        </div>
        {(t.customer_name || t.description) ? (
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {t.customer_name ? <span className="font-medium">{t.customer_name}</span> : null}
            {t.customer_name && t.description ? " — " : null}
            {t.description ? <span>{t.description}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
