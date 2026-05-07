"use client";

// Per-quiz analytics dashboard.
//
// Surface the metrics the solopreneur cares about when they think
// "is my quiz actually pulling its weight":
//   - visiteurs / leads / taux de capture / taux d'export Systeme.io
//   - distribution des résultats (où atterrissent les leads)
//   - évolution quotidienne des leads (graph aire)
//
// All data flows through /api/quiz/[id]/analytics — period switcher
// triggers a refetch; everything else is just rendering. No DB
// migration needed; counters live on quizzes.views_count and the
// distribution is GROUP BY on the existing leads table.
//
// What's missing : drop-off per question. Needs a quiz_question_events
// table — flagged as v2.

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Eye,
  Loader2,
  Send,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Period = "7" | "30" | "90" | "all";

interface AnalyticsResponse {
  ok: boolean;
  quiz: { id: string; title: string; created_at: string };
  period: Period;
  metrics: {
    viewsCount: number;
    completionsCount: number;
    leadsCount: number;
    exportedSioCount: number;
    captureRate: number;
    exportRate: number;
  };
  resultDistribution: { title: string; count: number; pct: number }[];
  leadsByDay: { date: string; count: number }[];
  error?: string;
}

const PERIOD_LABELS: Record<Period, string> = {
  "7": "7 derniers jours",
  "30": "30 derniers jours",
  "90": "90 derniers jours",
  all: "Depuis le début",
};

// Pie palette — 6 colors that read well stacked. We loop if the user
// has more buckets than colors (rare, but happens for very segmented
// quizzes).
const PIE_COLORS = [
  "#5D6CDB",
  "#22C55E",
  "#F97316",
  "#EC4899",
  "#0EA5E9",
  "#EAB308",
];

interface Props {
  quizId: string;
  /** Initial data fetched server-side so the page renders immediately. */
  initial: AnalyticsResponse;
}

export function QuizAnalyticsClient({ quizId, initial }: Props) {
  const [period, setPeriod] = useState<Period>(initial.period);
  const [data, setData] = useState<AnalyticsResponse>(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (period === initial.period && data === initial) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/quiz/${encodeURIComponent(quizId)}/analytics?period=${period}`,
          { credentials: "include" },
        );
        const json = (await res.json()) as AnalyticsResponse;
        if (!cancelled && json.ok) setData(json);
      } catch {
        /* ignore — we keep the previous state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const m = data.metrics;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" asChild>
            <Link
              href={`/quiz/${quizId}`}
              aria-label="Retour à l'éditeur"
            >
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-2 min-w-0">
              <BarChart3 className="size-5 text-primary shrink-0" />
              <span className="truncate">{data.quiz.title}</span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Statistiques · {PERIOD_LABELS[data.period]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-md border bg-muted/30 p-0.5">
          {(["7", "30", "90", "all"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              disabled={loading}
              className={`px-2.5 py-1 text-xs rounded-sm transition ${
                period === p
                  ? "bg-background text-foreground shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "all" ? "Tout" : `${p}j`}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<Eye className="size-4" />}
          label="Vues"
          value={m.viewsCount.toLocaleString("fr-FR")}
          hint="Nombre total de visiteurs (cumulé depuis le début)"
        />
        <KpiCard
          icon={<Users className="size-4" />}
          label="Leads"
          value={m.leadsCount.toLocaleString("fr-FR")}
          hint={`${m.exportedSioCount} exportés vers Systeme.io`}
        />
        <KpiCard
          icon={<Activity className="size-4" />}
          label="Taux de capture"
          value={`${m.captureRate}%`}
          hint="Leads / vues (cumulé)"
          accent="primary"
        />
        <KpiCard
          icon={<Send className="size-4" />}
          label="Export Systeme.io"
          value={`${m.exportRate}%`}
          hint="% des leads taggés dans SIO"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Évolution des leads</h2>
            {loading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          {data.leadsByDay.length === 0 ? (
            <EmptyState message="Aucun lead capturé sur cette période." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.leadsByDay} margin={{ top: 4, left: -12, right: 8 }}>
                <defs>
                  <linearGradient id="qaLeadFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5D6CDB" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#5D6CDB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  fontSize={10}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  allowDecimals={false}
                  fontSize={10}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip content={<DayTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#5D6CDB"
                  strokeWidth={2}
                  fill="url(#qaLeadFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">Distribution par résultat</h2>
          {data.resultDistribution.length === 0 ? (
            <EmptyState message="Aucun résultat à afficher." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={data.resultDistribution}
                    dataKey="count"
                    nameKey="title"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {data.resultDistribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ResultTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={32}
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-2 space-y-1 text-xs">
                {data.resultDistribution.map((r, i) => (
                  <li
                    key={r.title}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                        }}
                      />
                      <span className="truncate">{r.title}</span>
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {r.count} · {r.pct}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

// ───────── Bits ─────────

function KpiCard({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: "primary";
}) {
  return (
    <Card className={`p-4 ${accent === "primary" ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={accent === "primary" ? "text-primary" : ""}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
      ) : null}
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-[180px] grid place-items-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}

function shortDate(s: string): string {
  // 2026-05-07 → 7 mai
  try {
    const d = new Date(s);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  } catch {
    return s;
  }
}

function DayTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-background shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold">{shortDate(label)}</div>
      <div className="text-muted-foreground tabular-nums">
        {payload[0].value} lead{payload[0].value > 1 ? "s" : ""}
      </div>
    </div>
  );
}

function ResultTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-md border bg-background shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold">{p.payload.title}</div>
      <div className="text-muted-foreground tabular-nums">
        {p.value} leads · {p.payload.pct}%
      </div>
    </div>
  );
}
