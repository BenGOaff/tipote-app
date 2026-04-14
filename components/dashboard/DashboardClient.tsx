"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Plus, Eye, Users, TrendingUp, ClipboardList, Target, BarChart3,
  Sparkles, Mail, Link2, ArrowUpRight, Download,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Quiz = {
  id: string;
  title: string;
  status: string;
  views_count: number;
  starts_count: number;
  completions_count: number;
  shares_count: number;
  created_at: string;
  leads_count?: number;
};

// ---------------------------------------------------------------------------
// Chart colors matching the Tiquiz design system
// ---------------------------------------------------------------------------

const COLORS = {
  primary: "hsl(233, 64%, 61%)",       // #5D6CDB
  primaryLight: "hsl(233, 64%, 80%)",   // light indigo
  turquoise: "hsl(194, 79%, 52%)",      // #20BBE6
  navy: "hsl(230, 41%, 28%)",           // dark navy
  muted: "hsl(236, 16%, 50%)",          // muted gray
  light: "hsl(0, 0%, 87%)",             // light gray
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardClient({ userEmail }: { userEmail?: string }) {
  const t = useTranslations("dashboard");
  const tn = useTranslations("nav");
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuizzes();
  }, []);

  async function fetchQuizzes() {
    try {
      const res = await fetch("/api/quiz");
      const data = await res.json();
      if (data.ok) {
        const enriched: Quiz[] = [];
        for (const quiz of data.quizzes) {
          const qRes = await fetch(`/api/quiz/${quiz.id}`);
          const qData = await qRes.json();
          enriched.push({ ...quiz, leads_count: qData.leads?.length ?? 0 });
        }
        setQuizzes(enriched);
      }
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Computed stats
  // ---------------------------------------------------------------------------

  const totals = useMemo(() => {
    const views = quizzes.reduce((s, q) => s + q.views_count, 0);
    const starts = quizzes.reduce((s, q) => s + q.starts_count, 0);
    const completions = quizzes.reduce((s, q) => s + q.completions_count, 0);
    const leads = quizzes.reduce((s, q) => s + (q.leads_count ?? 0), 0);
    const conversionRate = starts > 0 ? Math.round((leads / starts) * 100) : 0;
    return { views, starts, completions, leads, conversionRate, quizCount: quizzes.length };
  }, [quizzes]);

  // Prospects donut data — always show, with placeholder if empty
  const prospectsData = useMemo(() => {
    if (totals.starts === 0) {
      return [
        { name: t("leads"), value: 0, color: COLORS.primary },
        { name: t("completions"), value: 0, color: COLORS.primaryLight },
        { name: t("abandoned"), value: 0, color: COLORS.navy },
      ];
    }
    const leads = totals.leads;
    const completed = totals.completions - leads;
    const abandoned = totals.starts - totals.completions;
    return [
      { name: t("leads"), value: Math.max(leads, 0), color: COLORS.primary },
      { name: t("completions"), value: Math.max(completed, 0), color: COLORS.primaryLight },
      { name: t("abandoned"), value: Math.max(abandoned, 0), color: COLORS.navy },
    ].filter((d) => d.value > 0);
  }, [totals, t]);

  // Placeholder donut for when there's no data
  const placeholderDonut = [
    { name: t("leads"), value: 45, color: COLORS.primary },
    { name: t("completions"), value: 30, color: COLORS.primaryLight },
    { name: t("abandoned"), value: 25, color: COLORS.navy },
  ];

  // Traffic chart data — per quiz, with placeholder if empty
  const trafficData = useMemo(() => {
    if (quizzes.length === 0) return [];
    return quizzes.map((q) => ({
      name: q.title.length > 15 ? q.title.slice(0, 15) + "\u2026" : q.title,
      [t("views")]: q.views_count,
      [t("leads")]: q.leads_count ?? 0,
    }));
  }, [quizzes, t]);

  const placeholderTraffic = [
    { name: t("month1"), [t("views")]: 0, [t("leads")]: 0 },
    { name: t("month2"), [t("views")]: 0, [t("leads")]: 0 },
    { name: t("month3"), [t("views")]: 0, [t("leads")]: 0 },
    { name: t("month4"), [t("views")]: 0, [t("leads")]: 0 },
    { name: t("month5"), [t("views")]: 0, [t("leads")]: 0 },
    { name: t("month6"), [t("views")]: 0, [t("leads")]: 0 },
  ];

  const hasRealTraffic = trafficData.length > 0;
  const chartTrafficData = hasRealTraffic ? trafficData : placeholderTraffic;
  const hasRealProspects = totals.starts > 0;
  const chartProspectsData = hasRealProspects ? prospectsData : placeholderDonut;

  // ---------------------------------------------------------------------------
  // KPI definitions
  // ---------------------------------------------------------------------------

  const KPI_CARDS = [
    {
      label: t("quizzesCreated"),
      value: totals.quizCount,
      sub: t("quizzesCreatedSub"),
      icon: ClipboardList,
      bgColor: "bg-indigo-50",
      iconColor: "text-indigo-500",
    },
    {
      label: t("leadsCaptured"),
      value: totals.leads,
      sub: t("leadsCapturedSub"),
      icon: Users,
      bgColor: "bg-violet-50",
      iconColor: "text-violet-500",
    },
    {
      label: t("totalViews"),
      value: totals.views,
      sub: t("totalViewsSub"),
      icon: Eye,
      bgColor: "bg-blue-50",
      iconColor: "text-blue-500",
    },
    {
      label: t("conversionRate"),
      value: `${totals.conversionRate}%`,
      sub: t("conversionRateSub"),
      icon: TrendingUp,
      bgColor: "bg-emerald-50",
      iconColor: "text-emerald-500",
    },
  ];

  // ---------------------------------------------------------------------------
  // Suggestion cards
  // ---------------------------------------------------------------------------

  const SUGGESTIONS = [
    {
      title: t("sug1Title"),
      description: t("sug1Desc"),
      icon: Sparkles,
      href: "/quiz/new",
      iconColor: "text-amber-500",
      bgColor: "bg-amber-50",
    },
    {
      title: t("sug2Title"),
      description: t("sug2Desc"),
      icon: Mail,
      href: "/quizzes",
      iconColor: "text-pink-500",
      bgColor: "bg-pink-50",
    },
    {
      title: t("sug3Title"),
      description: t("sug3Desc"),
      icon: Link2,
      href: "/settings",
      iconColor: "text-cyan-500",
      bgColor: "bg-cyan-50",
    },
  ];

  // ---------------------------------------------------------------------------
  // Custom Tooltip
  // ---------------------------------------------------------------------------

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-background border rounded-lg p-3 shadow-lg text-sm">
        <p className="font-medium mb-1.5">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-semibold">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <DashboardLayout
      title={tn("dashboard")}
      userEmail={userEmail}
    >
      {loading ? (
        /* Skeleton loading state matching the dashboard layout */
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="py-5 px-5">
                  <div className="w-9 h-9 rounded-lg bg-muted animate-pulse mb-3" />
                  <div className="h-7 w-16 bg-muted animate-pulse rounded mb-2" />
                  <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <Card key={i}>
                <CardContent className="py-8">
                  <div className="h-[200px] bg-muted animate-pulse rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Row 1: Action buttons — "Télécharger mes leads" + "Nouveau quiz" */}
          <div className="flex items-center justify-end gap-3">
            <Button
              asChild
              variant="outline"
              className="rounded-full border-primary text-primary hover:bg-primary/5"
            >
              <Link href="/leads">
                <Download className="h-4 w-4 mr-1.5" />
                {t("downloadLeads")}
              </Link>
            </Button>
            <Button
              asChild
              className="rounded-full"
            >
              <Link href="/quiz/new">
                <Plus className="h-4 w-4 mr-1.5" />
                {t("newQuiz")}
              </Link>
            </Button>
          </div>

          {/* Row 2: Welcome banner when no quizzes */}
          {quizzes.length === 0 && (
            <div className="rounded-2xl gradient-primary p-6 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold mb-1">{t("welcomeTitle")}</h2>
                  <p className="text-white/80 text-sm max-w-lg">{t("welcomeDesc")}</p>
                </div>
                <Button
                  asChild
                  variant="secondary"
                  className="rounded-full bg-white/20 hover:bg-white/30 text-white border-white/30 shrink-0"
                >
                  <Link href="/quiz/new">
                    <Plus className="h-4 w-4 mr-1.5" />
                    {t("createFirstQuiz")}
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {/* Row 3: KPI stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {KPI_CARDS.map(({ label, value, sub, icon: Icon, bgColor, iconColor }) => (
              <Card key={label} className="hover:shadow-md transition-shadow">
                <CardContent className="py-5 px-5">
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className={`w-9 h-9 rounded-lg ${bgColor} flex items-center justify-center`}
                    >
                      <Icon className={`h-4.5 w-4.5 ${iconColor}`} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold tabular-nums leading-none mb-1">
                    {value}
                  </p>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Row 3: Charts side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Prospects Donut */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Prospects
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center relative">
                  {!hasRealProspects && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center">
                      <div className="bg-background/90 backdrop-blur-sm rounded-xl px-5 py-3 text-center shadow-sm border">
                        <p className="text-sm font-medium text-foreground">{t("noDataYet")}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t("noDataYetDesc")}</p>
                      </div>
                    </div>
                  )}
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={chartProspectsData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {chartProspectsData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color}
                            opacity={hasRealProspects ? 1 : 0.2}
                          />
                        ))}
                      </Pie>
                      {hasRealProspects && <Tooltip content={<CustomTooltip />} />}
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    {(hasRealProspects ? prospectsData : placeholderDonut).map((d) => (
                      <span key={d.name} className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: d.color, opacity: hasRealProspects ? 1 : 0.4 }}
                        />
                        {d.name}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Traffic Bar Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Traffic
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  {!hasRealTraffic && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center">
                      <div className="bg-background/90 backdrop-blur-sm rounded-xl px-5 py-3 text-center shadow-sm border">
                        <p className="text-sm font-medium text-foreground">{t("noDataYet")}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t("noDataYetDesc")}</p>
                      </div>
                    </div>
                  )}
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart
                      data={chartTrafficData}
                      margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                      barGap={2}
                      barCategoryGap="20%"
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      {hasRealTraffic && <Tooltip content={<CustomTooltip />} />}
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 12 }}
                      />
                      <Bar
                        dataKey={t("views")}
                        fill={COLORS.primary}
                        radius={[4, 4, 0, 0]}
                        opacity={hasRealTraffic ? 1 : 0.2}
                      />
                      <Bar
                        dataKey={t("leads")}
                        fill={COLORS.turquoise}
                        radius={[4, 4, 0, 0]}
                        opacity={hasRealTraffic ? 1 : 0.2}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Row 4: Suggestion cards */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {t("suggestionsTitle")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {SUGGESTIONS.map((s) => (
                <Card key={s.title} className="hover:shadow-md transition-shadow group">
                  <CardContent className="py-5 px-5">
                    <div className="flex items-start justify-between mb-3">
                      <div
                        className={`w-9 h-9 rounded-lg ${s.bgColor} flex items-center justify-center`}
                      >
                        <s.icon className={`h-4.5 w-4.5 ${s.iconColor}`} />
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                    </div>
                    <h3 className="font-semibold text-sm mb-1">{s.title}</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      {s.description}
                    </p>
                    <Button asChild variant="outline" size="sm" className="rounded-full">
                      <Link href={s.href}>{t("learnMore")}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
