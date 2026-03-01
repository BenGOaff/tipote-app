"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  TrendingUp, TrendingDown, Minus, Users, Eye, ShoppingCart, Euro,
  Target, ArrowUpRight,
} from "lucide-react";
import type { OfferMetric } from "@/hooks/useOfferMetrics";

interface OfferMetricsDashboardProps {
  metrics: OfferMetric[];
  sortedMonths: string[];
  getMonthTotals: (month: string) => {
    visitors: number;
    signups: number;
    sales: number;
    revenue: number;
    captureRate: number;
    salesConversion: number;
    revenuePerVisitor: number;
  };
}

function pctChange(current: number, previous: number): { value: string; trend: "up" | "down" | "neutral" } {
  if (!previous || previous === 0) return { value: "-", trend: "neutral" };
  const change = ((current - previous) / previous) * 100;
  return {
    value: `${change > 0 ? "+" : ""}${change.toFixed(1)}%`,
    trend: change > 0 ? "up" : change < 0 ? "down" : "neutral",
  };
}

const TrendBadge = ({ change }: { change: { value: string; trend: "up" | "down" | "neutral" } }) => {
  if (change.value === "-") {
    return <Badge variant="secondary" className="flex items-center gap-1 text-xs"><Minus className="w-3 h-3" />-</Badge>;
  }
  return (
    <Badge
      variant={change.trend === "up" ? "default" : change.trend === "down" ? "destructive" : "secondary"}
      className="flex items-center gap-1 text-xs"
    >
      {change.trend === "up" ? <TrendingUp className="w-3 h-3" /> : change.trend === "down" ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {change.value}
    </Badge>
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-lg p-3 shadow-lg text-sm">
      <p className="font-medium mb-2 capitalize">{label}</p>
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">
            {entry.name.includes("CA") || entry.name.includes("Revenu")
              ? `${entry.value.toLocaleString("fr-FR")}EUR`
              : entry.name.includes("%") || entry.name.includes("Conv")
                ? `${Number(entry.value).toFixed(1)}%`
                : entry.value.toLocaleString("fr-FR")}
          </span>
        </div>
      ))}
    </div>
  );
};

export const OfferMetricsDashboard = ({ metrics, sortedMonths, getMonthTotals }: OfferMetricsDashboardProps) => {
  const latestMonth = sortedMonths[sortedMonths.length - 1];
  const prevMonth = sortedMonths.length >= 2 ? sortedMonths[sortedMonths.length - 2] : null;

  const current = latestMonth ? getMonthTotals(latestMonth) : null;
  const previous = prevMonth ? getMonthTotals(prevMonth) : null;

  // ── Per-offer breakdown for latest month ──
  const latestOfferMetrics = useMemo(() => {
    if (!latestMonth) return [];
    return metrics.filter((m) => m.month === latestMonth);
  }, [metrics, latestMonth]);

  // ── Chart data: monthly totals ──
  const monthlyChartData = useMemo(() => {
    return sortedMonths.map((m) => {
      const totals = getMonthTotals(m);
      return {
        month: format(new Date(m), "MMM yy", { locale: fr }),
        visitors: totals.visitors,
        inscrits: totals.signups,
        ventes: totals.sales,
        ca: totals.revenue,
        captureRate: totals.captureRate,
        salesConv: totals.salesConversion,
      };
    });
  }, [sortedMonths, getMonthTotals]);

  // ── Per-offer revenue chart data for latest month ──
  const offerRevenueData = useMemo(() => {
    return latestOfferMetrics
      .filter((m) => m.is_paid && m.revenue > 0)
      .map((m) => ({
        name: m.offer_name.length > 20 ? m.offer_name.slice(0, 20) + "..." : m.offer_name,
        revenue: m.revenue,
        ventes: m.sales_count,
      }));
  }, [latestOfferMetrics]);

  // ── Per-offer evolution chart (revenue by offer over months) ──
  const offerEvolutionData = useMemo(() => {
    const offerNames = [...new Set(metrics.filter((m) => m.is_paid).map((m) => m.offer_name))];
    return sortedMonths.map((m) => {
      const row: Record<string, any> = { month: format(new Date(m), "MMM yy", { locale: fr }) };
      const monthMetrics = metrics.filter((mt) => mt.month === m);
      for (const name of offerNames) {
        const found = monthMetrics.find((mt) => mt.offer_name === name);
        row[name] = found?.revenue ?? 0;
      }
      return row;
    });
  }, [metrics, sortedMonths]);

  const paidOfferNames = useMemo(() => {
    return [...new Set(metrics.filter((m) => m.is_paid).map((m) => m.offer_name))];
  }, [metrics]);

  // Colors for different offers
  const OFFER_COLORS = [
    "hsl(var(--primary))",
    "hsl(var(--secondary))",
    "#f59e0b",
    "#10b981",
    "#8b5cf6",
    "#ec4899",
  ];

  if (!current) {
    return (
      <Card className="p-8 text-center">
        <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-2">Aucune donnee encore</h3>
        <p className="text-muted-foreground">Saisis les metriques de tes offres pour voir ton tableau de bord.</p>
      </Card>
    );
  }

  // ── Total sales for the full period ──
  const totalPeriodRevenue = useMemo(() => {
    return metrics.reduce((s, m) => s + m.revenue, 0);
  }, [metrics]);

  const totalPeriodSales = useMemo(() => {
    return metrics.reduce((s, m) => s + m.sales_count, 0);
  }, [metrics]);

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: "Visiteurs",
            value: current.visitors.toLocaleString("fr-FR"),
            icon: Eye,
            color: "text-blue-500",
            change: pctChange(current.visitors, previous?.visitors ?? 0),
          },
          {
            label: "Inscrits",
            value: current.signups.toLocaleString("fr-FR"),
            icon: Users,
            color: "text-green-500",
            change: pctChange(current.signups, previous?.signups ?? 0),
          },
          {
            label: "Conv. capture",
            value: `${current.captureRate.toFixed(1)}%`,
            icon: Target,
            color: "text-amber-500",
            change: pctChange(current.captureRate, previous?.captureRate ?? 0),
          },
          {
            label: "Ventes",
            value: current.sales.toLocaleString("fr-FR"),
            icon: ShoppingCart,
            color: "text-purple-500",
            change: pctChange(current.sales, previous?.sales ?? 0),
          },
          {
            label: "Conv. vente",
            value: `${current.salesConversion.toFixed(1)}%`,
            icon: ArrowUpRight,
            color: "text-orange-500",
            change: pctChange(current.salesConversion, previous?.salesConversion ?? 0),
          },
          {
            label: "CA du mois",
            value: `${current.revenue.toLocaleString("fr-FR")}EUR`,
            icon: Euro,
            color: "text-emerald-500",
            change: pctChange(current.revenue, previous?.revenue ?? 0),
          },
        ].map((metric, i) => (
          <Card key={i} className="p-4 hover:shadow-md transition-all duration-200">
            <div className="flex items-start justify-between mb-2">
              <div className={`w-8 h-8 rounded-lg bg-muted flex items-center justify-center ${metric.color}`}>
                <metric.icon className="w-4 h-4" />
              </div>
              <TrendBadge change={metric.change} />
            </div>
            <p className="text-xs text-muted-foreground mb-0.5">{metric.label}</p>
            <p className="text-lg font-bold">{metric.value}</p>
          </Card>
        ))}
      </div>

      {/* ── Period totals ── */}
      <div className="flex gap-4 text-sm">
        <div className="px-3 py-2 rounded-lg bg-muted/50 border">
          CA total ({sortedMonths.length} mois) : <strong>{totalPeriodRevenue.toLocaleString("fr-FR")}EUR</strong>
        </div>
        <div className="px-3 py-2 rounded-lg bg-muted/50 border">
          Ventes totales : <strong>{totalPeriodSales}</strong>
        </div>
        {current.revenuePerVisitor > 0 && (
          <div className="px-3 py-2 rounded-lg bg-muted/50 border">
            CA/visiteur : <strong>{current.revenuePerVisitor.toFixed(2)}EUR</strong>
          </div>
        )}
      </div>

      {/* ── Per-offer breakdown (latest month) ── */}
      {latestOfferMetrics.length > 0 && (
        <Card className="p-6">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <Target className="w-4 h-4" /> Detail par offre — {latestMonth && format(new Date(latestMonth), "MMMM yyyy", { locale: fr })}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-4">Offre</th>
                  <th className="text-right px-2">Visiteurs</th>
                  <th className="text-right px-2">Inscrits</th>
                  <th className="text-right px-2">Conv. capture</th>
                  <th className="text-right px-2">Ventes</th>
                  <th className="text-right px-2">Conv. vente</th>
                  <th className="text-right px-2">CA</th>
                  <th className="text-right pl-2">CA/visiteur</th>
                </tr>
              </thead>
              <tbody>
                {latestOfferMetrics.map((m) => (
                  <tr key={m.offer_name} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{m.offer_name}</span>
                        {m.is_paid && <Badge variant="secondary" className="text-[10px]">Payante</Badge>}
                      </div>
                    </td>
                    <td className="text-right px-2">{m.visitors.toLocaleString("fr-FR")}</td>
                    <td className="text-right px-2">{m.signups.toLocaleString("fr-FR")}</td>
                    <td className="text-right px-2">{(m.capture_rate ?? 0).toFixed(1)}%</td>
                    <td className="text-right px-2">{m.is_paid ? m.sales_count : "-"}</td>
                    <td className="text-right px-2">{m.is_paid ? `${(m.sales_conversion ?? 0).toFixed(1)}%` : "-"}</td>
                    <td className="text-right px-2">{m.is_paid ? `${m.revenue.toLocaleString("fr-FR")}EUR` : "-"}</td>
                    <td className="text-right pl-2">{m.is_paid && m.visitors > 0 ? `${(m.revenue_per_visitor ?? 0).toFixed(2)}EUR` : "-"}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="font-bold border-t-2">
                  <td className="py-2 pr-4">Total</td>
                  <td className="text-right px-2">{current.visitors.toLocaleString("fr-FR")}</td>
                  <td className="text-right px-2">{current.signups.toLocaleString("fr-FR")}</td>
                  <td className="text-right px-2">{current.captureRate.toFixed(1)}%</td>
                  <td className="text-right px-2">{current.sales}</td>
                  <td className="text-right px-2">{current.salesConversion.toFixed(1)}%</td>
                  <td className="text-right px-2">{current.revenue.toLocaleString("fr-FR")}EUR</td>
                  <td className="text-right pl-2">{current.revenuePerVisitor.toFixed(2)}EUR</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Chart 1: Visitors + Signups + Sales evolution ── */}
      {monthlyChartData.length >= 2 && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="font-bold">Evolution visiteurs, inscrits et ventes</h3>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: "12px" }} formatter={(v: string) => <span className="text-sm">{v}</span>} />
                <Line type="monotone" dataKey="visitors" name="Visiteurs" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ fill: "hsl(var(--primary))", r: 4, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="inscrits" name="Inscrits" stroke="#10b981" strokeWidth={2.5} dot={{ fill: "#10b981", r: 4, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="ventes" name="Ventes" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: "#8b5cf6", r: 3, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* ── Chart 2: Conversion rates evolution ── */}
      {monthlyChartData.length >= 2 && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold">Evolution des conversions</h3>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: "12px" }} formatter={(v: string) => <span className="text-sm">{v}</span>} />
                <Line type="monotone" dataKey="captureRate" name="Conv. capture %" stroke="#f59e0b" strokeWidth={2.5} dot={{ fill: "#f59e0b", r: 4, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="salesConv" name="Conv. vente %" stroke="#ec4899" strokeWidth={2.5} dot={{ fill: "#ec4899", r: 4, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* ── Chart 3: Revenue per offer (bar chart) ── */}
      {offerRevenueData.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Euro className="w-5 h-5 text-emerald-500" />
            <h3 className="font-bold">
              CA par offre — {latestMonth && format(new Date(latestMonth), "MMMM yyyy", { locale: fr })}
            </h3>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={offerRevenueData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}EUR`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" name="CA" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* ── Chart 4: Revenue evolution by offer (stacked lines) ── */}
      {paidOfferNames.length > 0 && offerEvolutionData.length >= 2 && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="font-bold">Evolution du CA par offre</h3>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={offerEvolutionData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}EUR`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: "12px" }} formatter={(v: string) => <span className="text-sm">{v}</span>} />
                {paidOfferNames.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    name={name.length > 25 ? name.slice(0, 25) + "..." : name}
                    stroke={OFFER_COLORS[i % OFFER_COLORS.length]}
                    strokeWidth={2}
                    dot={{ fill: OFFER_COLORS[i % OFFER_COLORS.length], r: 3, strokeWidth: 0 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
};
