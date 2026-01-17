import { Card } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { MetricsData } from "@/hooks/useMetrics";
import { TrendingUp } from "lucide-react";

interface MetricsChartProps {
  metrics: MetricsData[];
}

export const MetricsChart = ({ metrics }: MetricsChartProps) => {
  if (metrics.length < 2) {
    return null;
  }

  // Reverse to show oldest first (chronological order)
  const chartData = [...metrics].reverse().map((m) => ({
    month: format(new Date(m.month), "MMM yy", { locale: fr }),
    ca: m.revenue || 0,
    ventes: m.sales_count || 0,
    inscrits: m.new_subscribers || 0,
    conversion: m.conversion_rate || 0,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium mb-2 capitalize">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium">
                {entry.name === "CA"
                  ? `${entry.value.toLocaleString("fr-FR")}€`
                  : entry.name === "Conversion"
                    ? `${entry.value.toFixed(1)}%`
                    : entry.value}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-bold">Évolution de tes performances</h3>
          <p className="text-sm text-muted-foreground">
            {metrics.length} mois de données
          </p>
        </div>
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
              tickFormatter={(value) =>
                value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value
              }
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              formatter={(value) => (
                <span className="text-sm text-foreground">{value}</span>
              )}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="ca"
              name="CA"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              dot={{ fill: "hsl(var(--primary))", strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="inscrits"
              name="Inscrits"
              stroke="hsl(var(--secondary))"
              strokeWidth={2.5}
              dot={{ fill: "hsl(var(--secondary))", strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="conversion"
              name="Conversion"
              stroke="hsl(var(--accent-foreground))"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{
                fill: "hsl(var(--accent-foreground))",
                strokeWidth: 0,
                r: 3,
              }}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
