"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Users, MousePointer, ShoppingCart, Euro } from "lucide-react";
import type { MetricsData } from "@/hooks/useMetrics";

interface MetricsSummaryProps {
  metrics: MetricsData | null;
  previousMetrics?: MetricsData | null;
}

const calculateChange = (
  current: number,
  previous: number | undefined | null,
): { value: string; trend: "up" | "down" | "neutral" } => {
  if (previous === null || previous === undefined || previous === 0) {
    return { value: "-", trend: "neutral" };
  }
  const change = ((current - previous) / previous) * 100;
  return {
    value: `${change > 0 ? "+" : ""}${change.toFixed(1)}%`,
    trend: change > 0 ? "up" : change < 0 ? "down" : "neutral",
  };
};

export const MetricsSummary = ({ metrics, previousMetrics }: MetricsSummaryProps) => {
  if (!metrics) return null;

  const summaryMetrics = [
    {
      label: "Chiffre d'affaires",
      value: `${(metrics.revenue || 0).toLocaleString("fr-FR")}€`,
      icon: Euro,
      color: "text-success",
      change: calculateChange(metrics.revenue || 0, previousMetrics?.revenue ?? null),
    },
    {
      label: "Ventes",
      value: (metrics.sales_count || 0).toString(),
      icon: ShoppingCart,
      color: "text-primary",
      change: calculateChange(metrics.sales_count || 0, previousMetrics?.sales_count ?? null),
    },
    {
      label: "Taux de conversion",
      value: `${(metrics.conversion_rate || 0).toFixed(1)}%`,
      icon: MousePointer,
      color: "text-secondary",
      change: calculateChange(metrics.conversion_rate || 0, previousMetrics?.conversion_rate ?? null),
    },
    {
      label: "Nouveaux inscrits",
      value: (metrics.new_subscribers || 0).toString(),
      icon: Users,
      color: "text-accent-foreground",
      change: calculateChange(metrics.new_subscribers || 0, previousMetrics?.new_subscribers ?? null),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {summaryMetrics.map((metric, i) => (
        <Card key={i} className="p-5 hover:shadow-md transition-all duration-200">
          <div className="flex items-start justify-between mb-3">
            <div className={`w-10 h-10 rounded-xl bg-muted flex items-center justify-center ${metric.color}`}>
              <metric.icon className="w-5 h-5" />
            </div>

            {metric.change.value !== "-" ? (
              <Badge
                variant={metric.change.trend === "up" ? "default" : metric.change.trend === "down" ? "destructive" : "secondary"}
                className="flex items-center gap-1"
              >
                {metric.change.trend === "up" ? (
                  <TrendingUp className="w-3 h-3" />
                ) : metric.change.trend === "down" ? (
                  <TrendingDown className="w-3 h-3" />
                ) : (
                  <Minus className="w-3 h-3" />
                )}
                {metric.change.value}
              </Badge>
            ) : (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Minus className="w-3 h-3" />-
              </Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground mb-1">{metric.label}</p>
          <p className="text-2xl font-bold">{metric.value}</p>
        </Card>
      ))}
    </div>
  );
};
