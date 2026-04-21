"use client";

// components/quiz/QuizResultsAnalytics.tsx
// Rich analytics panel for the "Résultats" tab: KPI cards, conversion rate,
// lead-acquisition trend, results distribution, per-question answer
// breakdown, and the raw leads table with CSV export. All aggregations are
// computed client-side from data already loaded by the parent
// (quiz_leads.answers JSONB + result_id) — no extra round trip.

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Eye,
  Play,
  CheckCircle,
  Users,
  Share2,
  Download,
  TrendingUp,
  Award,
  BarChart3,
} from "lucide-react";

// Donut palette: primary Tipote + tonal variations, repeats if > 7 slices.
const CHART_COLORS = [
  "#5D6CDB", // primary
  "#20BBE6", // turquoise accent
  "#8B95E6", // light primary
  "#3FA9C9", // muted turquoise
  "#2E386E", // foreground
  "#B4BBF0", // pale primary
  "#16809E", // deep turquoise
];

type Question = {
  id?: string;
  question_text: string;
  options: { text: string; result_index: number }[];
  sort_order: number;
};

type Result = {
  id?: string;
  title: string;
  sort_order: number;
};

type Lead = {
  id: string;
  email: string;
  first_name: string | null;
  result_id: string | null;
  result_title: string | null;
  answers: { question_index: number; option_index: number }[] | null;
  created_at: string;
};

type Props = {
  viewsCount: number;
  startsCount: number;
  completionsCount: number;
  sharesCount: number;
  leads: Lead[];
  questions: Question[];
  results: Result[];
  onExportCSV: () => void;
};

function formatPct(n: number, total: number): string {
  if (total <= 0) return "0%";
  return `${((n / total) * 100).toFixed(0)}%`;
}

// Truncate option labels so the legend doesn't blow out on long answers.
function truncate(s: string, max = 60): string {
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export default function QuizResultsAnalytics({
  viewsCount,
  startsCount,
  completionsCount,
  sharesCount,
  leads,
  questions,
  results,
  onExportCSV,
}: Props) {
  const t = useTranslations("quizDetail");
  const locale = useLocale();

  const conversionRate =
    viewsCount > 0 ? (leads.length / viewsCount) * 100 : 0;

  // ─── Results distribution ────────────────────────────────────────────────
  const resultsDistribution = useMemo(() => {
    if (results.length === 0) return [];
    const counts = new Map<string, number>();
    for (const lead of leads) {
      if (!lead.result_id) continue;
      counts.set(lead.result_id, (counts.get(lead.result_id) ?? 0) + 1);
    }
    return results
      .map((r) => ({
        name: r.title || t("untitledResult"),
        value: r.id ? counts.get(r.id) ?? 0 : 0,
      }))
      .filter((r) => r.value > 0);
  }, [leads, results, t]);

  // ─── Lead acquisition trend (last 30 days) ───────────────────────────────
  const trendData = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        date: key,
        label: d.toLocaleDateString(locale, {
          day: "2-digit",
          month: "2-digit",
        }),
        count: 0,
      });
    }
    const idx = new Map(days.map((d, i) => [d.date, i]));
    for (const lead of leads) {
      if (!lead.created_at) continue;
      const key = lead.created_at.slice(0, 10);
      const i = idx.get(key);
      if (i !== undefined) days[i].count += 1;
    }
    return days;
  }, [leads, locale]);

  // ─── Per-question answer distribution ────────────────────────────────────
  const questionStats = useMemo(() => {
    return questions.map((q, qIdx) => {
      const optionCounts = q.options.map(() => 0);
      let totalAnswered = 0;
      for (const lead of leads) {
        if (!Array.isArray(lead.answers)) continue;
        const answer = lead.answers.find((a) => a.question_index === qIdx);
        if (!answer) continue;
        if (
          answer.option_index >= 0 &&
          answer.option_index < optionCounts.length
        ) {
          optionCounts[answer.option_index] += 1;
          totalAnswered += 1;
        }
      }
      const data = q.options.map((opt, oIdx) => ({
        name: truncate(opt.text || t("optionFallback", { n: oIdx + 1 })),
        fullName: opt.text || t("optionFallback", { n: oIdx + 1 }),
        value: optionCounts[oIdx],
      }));
      return {
        questionIndex: qIdx,
        questionText: q.question_text || t("questionFallback", { n: qIdx + 1 }),
        totalAnswered,
        data,
      };
    });
  }, [leads, questions, t]);

  const hasAnyAnswers = questionStats.some((q) => q.totalAnswered > 0);

  // ─── KPI card config ─────────────────────────────────────────────────────
  const kpis = [
    { icon: Eye, label: t("kpiViews"), value: viewsCount },
    { icon: Play, label: t("kpiStarts"), value: startsCount },
    { icon: CheckCircle, label: t("kpiCompletions"), value: completionsCount },
    { icon: Users, label: t("kpiLeads"), value: leads.length },
    { icon: Share2, label: t("kpiShares"), value: sharesCount },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="w-4 h-4" />
                {label}
              </div>
              <div className="mt-1 text-2xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Conversion + trend */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm text-muted-foreground mb-2">
              {t("conversionRate")}
            </h3>
            <div className="text-4xl font-bold">
              {conversionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("conversionSubtitle", {
                leads: leads.length,
                views: viewsCount,
              })}
            </p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-primary" />
              {t("trendTitle")}
            </h3>
            {leads.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                {t("trendEmpty")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart
                  data={trendData}
                  margin={{ top: 5, right: 8, left: -24, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="leadTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="#5D6CDB"
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="95%"
                        stopColor="#5D6CDB"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    interval={4}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      fontSize: 12,
                    }}
                    labelFormatter={(v) => t("trendTooltipDate", { date: String(v) })}
                    formatter={(v: number) => [t("trendTooltipLeads", { count: v }), ""]}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#5D6CDB"
                    strokeWidth={2}
                    fill="url(#leadTrend)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Results distribution */}
      {resultsDistribution.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <Award className="w-4 h-4 text-primary" />
              {t("resultsDistribution")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={resultsDistribution}
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                    >
                      {resultsDistribution.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                      formatter={(v: number, _n, p) => [
                        `${v} (${formatPct(v, leads.length)})`,
                        p?.payload?.name ?? "",
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-2 text-sm">
                {resultsDistribution.map((r, i) => {
                  const color = CHART_COLORS[i % CHART_COLORS.length];
                  return (
                    <li key={i} className="flex items-center gap-3">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="flex-1 truncate">{r.name}</span>
                      <span className="font-medium">{r.value}</span>
                      <span className="text-muted-foreground text-xs w-10 text-right">
                        {formatPct(r.value, leads.length)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-question breakdown */}
      {hasAnyAnswers && questionStats.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            {t("answersBreakdown")}
          </h3>
          {questionStats.map((q) => {
            if (q.totalAnswered === 0) return null;
            return (
              <Card key={q.questionIndex}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <p className="font-medium text-sm">
                      <span className="text-muted-foreground me-2">
                        {t("questionPrefix", { n: q.questionIndex + 1 })}
                      </span>
                      {q.questionText}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {t("answersCount", { count: q.totalAnswered })}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {q.data.map((opt, i) => {
                      const pct =
                        q.totalAnswered > 0
                          ? (opt.value / q.totalAnswered) * 100
                          : 0;
                      const color = CHART_COLORS[i % CHART_COLORS.length];
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-sm gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <span className="truncate">{opt.fullName}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground tabular-nums">
                                {opt.value}
                              </span>
                              <span className="tabular-nums w-10 text-right">
                                {pct.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Leads table */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg">{t("leadsCount", { count: leads.length })}</h3>
        {leads.length > 0 && (
          <Button variant="outline" size="sm" onClick={onExportCSV}>
            <Download className="w-4 h-4 me-1" />
            CSV
          </Button>
        )}
      </div>
      {leads.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("leadsEmpty")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start px-4 py-3">{t("email")}</th>
                  <th className="text-start px-4 py-3">{t("firstName")}</th>
                  <th className="text-start px-4 py-3">{t("result")}</th>
                  <th className="text-start px-4 py-3">{t("date")}</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b">
                    <td className="px-4 py-3 font-medium">{l.email}</td>
                    <td className="px-4 py-3">{l.first_name ?? "—"}</td>
                    <td className="px-4 py-3">{l.result_title ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {l.created_at
                        ? new Date(l.created_at).toLocaleDateString(locale)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
