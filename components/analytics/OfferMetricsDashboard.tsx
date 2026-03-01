"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AIContent } from "@/components/ui/ai-content";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { format, startOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import {
  TrendingUp, Users, ShoppingCart, Euro, Target,
  Mail, Sparkles, Loader2, BarChart3,
} from "lucide-react";
import type { EmailStats } from "@/hooks/useOfferMetrics";

interface OfferMetricsDashboardProps {
  metrics: any[];
  sortedMonths: string[];
  grandTotals: {
    visitors: number;
    signups: number;
    sales: number;
    revenue: number;
    captureRate: number;
    salesConversion: number;
    avgEmailOpenRate: number;
    avgEmailClickRate: number;
    latestEmailListSize: number;
    monthCount: number;
  };
  getMonthTotals: (month: string) => {
    visitors: number;
    signups: number;
    sales: number;
    revenue: number;
    captureRate: number;
    salesConversion: number;
    revenuePerVisitor: number;
  };
  getEmailStats: (month: string) => EmailStats | null;
  analysis: string | null;
  isAnalyzing: boolean;
  onAnalyze: () => void;
}

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
              ? `${entry.value.toLocaleString("fr-FR")} EUR`
              : entry.name.includes("%") || entry.name.includes("Taux")
                ? `${Number(entry.value).toFixed(1)}%`
                : entry.value.toLocaleString("fr-FR")}
          </span>
        </div>
      ))}
    </div>
  );
};

export const OfferMetricsDashboard = ({
  metrics,
  sortedMonths,
  grandTotals,
  getMonthTotals,
  getEmailStats,
  analysis,
  isAnalyzing,
  onAnalyze,
}: OfferMetricsDashboardProps) => {
  const hasData = metrics.length > 0;

  // Exclude the current (incomplete) month from charts to avoid skewing data
  const currentMonthStr = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const completedMonths = useMemo(
    () => sortedMonths.filter((m) => m !== currentMonthStr),
    [sortedMonths, currentMonthStr],
  );

  // Chart data: monthly evolution (only completed months)
  const monthlyChartData = useMemo(() => {
    return completedMonths.map((m) => {
      const totals = getMonthTotals(m);
      const email = getEmailStats(m);
      return {
        month: format(new Date(m), "MMM yy", { locale: fr }),
        Visiteurs: totals.visitors,
        Leads: totals.signups,
        "Taux capture %": totals.captureRate,
        "Taux conversion %": totals.salesConversion,
        "Taux ouverture %": email?.email_open_rate ?? 0,
        "Taux clics %": email?.email_click_rate ?? 0,
      };
    });
  }, [completedMonths, getMonthTotals, getEmailStats]);

  if (!hasData) {
    return (
      <Card className="p-8 text-center">
        <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-2">Aucune donnée encore</h3>
        <p className="text-muted-foreground mb-4">
          Commence par saisir tes données dans l&apos;onglet « Saisir mes données » pour voir tes résultats.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Grand Totals ── */}
      <div>
        <h3 className="font-bold text-base mb-3 flex items-center gap-2">
          <Target className="w-4 h-4" />
          Résultats totaux ({grandTotals.monthCount} mois de données)
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-purple-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Ventes totales</p>
            <p className="text-xl font-bold">{grandTotals.sales.toLocaleString("fr-FR")}</p>
            {grandTotals.revenue > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">{grandTotals.revenue.toLocaleString("fr-FR")} EUR de CA</p>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Users className="w-4 h-4 text-green-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Leads capturés</p>
            <p className="text-xl font-bold">{grandTotals.signups.toLocaleString("fr-FR")}</p>
            {grandTotals.captureRate > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">Taux moyen : {grandTotals.captureRate.toFixed(1)}%</p>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Mail className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Ouverture emails (moy.)</p>
            <p className="text-xl font-bold">
              {grandTotals.avgEmailOpenRate > 0 ? `${grandTotals.avgEmailOpenRate.toFixed(1)}%` : "-"}
            </p>
            {grandTotals.avgEmailClickRate > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">Clics : {grandTotals.avgEmailClickRate.toFixed(1)}%</p>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Euro className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">CA total</p>
            <p className="text-xl font-bold">{grandTotals.revenue.toLocaleString("fr-FR")} EUR</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Target className="w-4 h-4 text-amber-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Conv. vente (moy.)</p>
            <p className="text-xl font-bold">
              {grandTotals.salesConversion > 0 ? `${grandTotals.salesConversion.toFixed(1)}%` : "-"}
            </p>
          </Card>
        </div>
      </div>

      {/* ── Charts ── */}
      {monthlyChartData.length >= 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Visitors + Leads evolution */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h4 className="font-bold text-sm">Visiteurs et leads</h4>
            </div>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: "8px" }} formatter={(v: string) => <span className="text-xs">{v}</span>} />
                  <Line type="monotone" dataKey="Visiteurs" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--primary))" }} />
                  <Line type="monotone" dataKey="Leads" stroke="#10b981" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "#10b981" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Conversion rates */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-4 h-4 text-amber-500" />
              <h4 className="font-bold text-sm">Taux de capture et conversion</h4>
            </div>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: "8px" }} formatter={(v: string) => <span className="text-xs">{v}</span>} />
                  <Line type="monotone" dataKey="Taux capture %" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "#f59e0b" }} />
                  <Line type="monotone" dataKey="Taux conversion %" stroke="#ec4899" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "#ec4899" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Email open + click rates */}
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Mail className="w-4 h-4 text-blue-500" />
              <h4 className="font-bold text-sm">Ouverture et clics emails</h4>
            </div>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: "8px" }} formatter={(v: string) => <span className="text-xs">{v}</span>} />
                  <Line type="monotone" dataKey="Taux ouverture %" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "#3b82f6" }} />
                  <Line type="monotone" dataKey="Taux clics %" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "#8b5cf6" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* ── AI Analysis ── */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${analysis ? "gradient-primary" : "bg-muted"}`}>
              {isAnalyzing ? (
                <Loader2 className="w-5 h-5 text-primary-foreground animate-spin" />
              ) : (
                <Sparkles className={`w-5 h-5 ${analysis ? "text-primary-foreground" : "text-muted-foreground"}`} />
              )}
            </div>
            <div>
              <h3 className="font-bold">Analyse IA</h3>
              <p className="text-xs text-muted-foreground">
                Conseils personnalisés basés sur tes chiffres
              </p>
            </div>
          </div>
          {analysis && (
            <Button size="sm" variant="outline" onClick={onAnalyze} disabled={isAnalyzing}>
              Actualiser
            </Button>
          )}
        </div>

        {isAnalyzing ? (
          <div className="space-y-3">
            <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
            <div className="h-4 bg-muted rounded animate-pulse w-full" />
            <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
            <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
          </div>
        ) : analysis ? (
          <div className="rounded-xl border bg-background p-5">
            <AIContent content={analysis} mode="auto" className="text-sm" />
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              L&apos;analyse sera générée automatiquement quand tu saisiras tes données. Elle diagnostique tes performances par offre, tes emails, et te donne des actions concrètes.
            </p>
            <Button onClick={onAnalyze} disabled={!hasData || isAnalyzing} className="gradient-primary">
              <Sparkles className="w-4 h-4 mr-2" />
              Lancer l&apos;analyse (1 crédit)
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};
