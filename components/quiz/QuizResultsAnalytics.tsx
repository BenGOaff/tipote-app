"use client";

// components/quiz/QuizResultsAnalytics.tsx
// Rich analytics panel for the "Résultats" tab: KPI cards, conversion rate,
// lead-acquisition trend, results distribution, per-question answer
// breakdown, and the raw leads table with CSV export. All aggregations are
// computed client-side from data already loaded by the parent
// (quiz_leads.answers JSONB + result_id) — no extra round trip.

import { useMemo, useState } from "react";
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
  Copy,
  Check,
  Users,
  Share2,
  Download,
  TrendingUp,
  Award,
  BarChart3,
} from "lucide-react";
import { stripHtml } from "@/lib/richText";
import { localDateKey } from "@/lib/dateKeys";

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
  /** multiple_choice (défaut), yes_no, image_choice, free_text,
   *  rating_scale, star_rating. Les trois derniers n'ont pas d'options :
   *  sans ce champ, leur carte de résultats restait invisible (retour
   *  Jocelyne, 1er août 2026). */
  question_type?: string;
  config?: Record<string, unknown> | null;
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
  // Legacy quizzes single-pick path: one option_index per answer.
  // Multi-select questions populate option_indices[] (array of picks).
  // Either shape can appear on a given quiz_leads row.
  answers: {
    question_index: number;
    option_index?: number;
    option_indices?: number[];
    // Questions sans options : la réponse est un texte, une note sur une
    // échelle, ou un nombre d'étoiles. Stocké depuis toujours par la
    // capture publique, mais jamais affiché avant.
    text?: string;
    rating?: number;
    stars?: number;
  }[] | null;
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
  // Quand true (quizzes.hide_response_counts), on masque les nombres bruts
  // de reponses dans la synthese a l'ecran (donut, barres par question,
  // tooltip) et on ne garde QUE les pourcentages. N'affecte pas l'export CSV.
  hideCounts?: boolean;
};

function formatPct(n: number, total: number): string {
  if (total <= 0) return "0%";
  return `${((n / total) * 100).toFixed(0)}%`;
}

// Réponses libres : on affiche les plus récentes, pas les 3000 d'un quiz
// qui tourne depuis un an (la page ramerait). Le bouton Copier, lui, prend
// TOUT : c'est ce qui part dans le traitement de texte de l'autrice.
const FREE_TEXT_DISPLAY_LIMIT = 200;

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
  hideCounts = false,
}: Props) {
  const t = useTranslations("quizDetail");
  const locale = useLocale();
  const [copiedQuestion, setCopiedQuestion] = useState<number | null>(null);

  async function copyTexts(questionIndex: number, texts: string[]) {
    try {
      await navigator.clipboard.writeText(texts.join("\n\n"));
      setCopiedQuestion(questionIndex);
      setTimeout(() => setCopiedQuestion(null), 2000);
    } catch {
      /* presse-papier refusé : on ne casse rien, l'utilisateur peut sélectionner */
    }
  }

  // ─── Réconciliation des compteurs (invariant AGENTS.md) ────────────────
  // vues >= starts >= completions >= leads. Mirror Tiquiz, audit 7 juin 2026.
  // Funnel monotone : vues >= demarrages >= completions. MAIS les LEADS ne
  // sont PAS bornes par les completions : une capture placee AVANT l'ecran
  // de resultat donne legitimement plus de leads que de completions (cas
  // Adeline : 129 leads pour 114 completions). On borne les leads sur les
  // DEMARRAGES (un lead implique un demarrage), jamais sur les completions
  // -> le KPI "Completes" montre le vrai chiffre, pas gonfle.
  const reconciledCompletions = completionsCount;
  const reconciledStarts = Math.max(startsCount, completionsCount, leads.length);
  const reconciledViews = Math.max(viewsCount, reconciledStarts);

  // Deux taux, chacun coherent avec SON denominateur (fini le 97% affiche a
  // cote de "X vues", qui avait l'air d'un bug - drame Adeline 16 juillet).
  // - captureRate = leads / vues : combien de VISITEURS deviennent leads.
  // - startsRate   = leads / demarrages : parmi ceux qui COMMENCENT le quiz.
  // Honnete : null si le denominateur est < leads (tracking incomplet).
  const captureRate =
    viewsCount >= leads.length && viewsCount > 0
      ? Math.round((leads.length / viewsCount) * 100)
      : null;
  const startsRate =
    startsCount >= leads.length && startsCount > 0
      ? Math.round((leads.length / startsCount) * 100)
      : null;

  // ─── Results distribution (refonte Gwenn 8 juin 2026) ───────────────
  // Bene 8 juin : "les users doivent voir leur quiz EXISTANT en temps
  // reel, pas d'anciennes versions ou tronquees". Donc :
  //   1. Seed byTitle avec TOUS les profils actuels (count = 0 inclus)
  //      -> profil sans lead visible avec 0 ; aucun profil "oublie"
  //   2. Walk leads : match via id-live OU snapshot-title-encore-current
  //      Les orphelins/anciens noms sont silencieusement IGNORES (pas
  //      de bucket "Anciens", Bene n'en veut pas).
  //   3. Pas de filtre zero (profils a 0 affiches). Sort par count desc.
  // Strictement aligne sur /api/quiz/[id]/analytics route Tipote.
  const resultsDistribution = useMemo(() => {
    const liveTitleById = new Map<string, string>();
    const currentTitles = new Set<string>();
    const byTitle = new Map<string, number>();
    for (const r of results) {
      const title = (stripHtml(r.title) || "").trim();
      if (!title) continue;
      if (r.id) liveTitleById.set(r.id, title);
      if (!byTitle.has(title)) {
        byTitle.set(title, 0);
        currentTitles.add(title);
      }
    }

    // Resolution LIGNE PAR LIGNE (pas de collapse des orphelins). Bug
    // corrige (drame Adeline 16 juillet) : avant, tous les leads a
    // result_id null etaient regroupes sous une cle unique et attribues au
    // PREMIER titre-snapshot vu -> tout le paquet basculait d'un profil a
    // l'autre. Desormais chaque snapshot garde son compte.
    for (const lead of leads) {
      const live = lead.result_id ? liveTitleById.get(lead.result_id)?.trim() : undefined;
      if (live && currentTitles.has(live)) {
        byTitle.set(live, (byTitle.get(live) ?? 0) + 1);
        continue;
      }
      const snap = lead.result_title
        ? (stripHtml(lead.result_title) || lead.result_title).trim()
        : "";
      if (snap && currentTitles.has(snap)) {
        byTitle.set(snap, (byTitle.get(snap) ?? 0) + 1);
      }
      // orphelin / ancien profil -> exclu silencieusement.
    }

    return Array.from(byTitle.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [leads, results]);

  // Denominateur des % = total des leads MATCHES (pas leads.length, qui
  // inclut les orphans desormais exclus du donut). Permet aux % de
  // sommer exactement a 100%.
  const distributionTotal = useMemo(
    () => resultsDistribution.reduce((acc, r) => acc + r.value, 0),
    [resultsDistribution],
  );

  // ─── Lead acquisition trend (last 30 days) ───────────────────────────────
  // Bucketing en jour LOCAL du créateur (pas UTC) via localDateKey, pour
  // les clés de jours ET pour les leads — sinon décalage de fuseau et
  // "aujourd'hui" apparaît vide (bug Adeline 24/05). Cf. lib/dateKeys.
  const trendData = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = localDateKey(d);
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
      const key = localDateKey(new Date(lead.created_at));
      const i = idx.get(key);
      if (i !== undefined) days[i].count += 1;
    }
    return days;
  }, [leads, locale]);

  // ─── Per-question answer distribution ────────────────────────────────────
  const questionStats = useMemo(() => {
    return questions.map((q, qIdx) => {
      const type = q.question_type ?? "multiple_choice";
      const base = {
        questionIndex: qIdx,
        questionText: stripHtml(q.question_text) || t("questionFallback", { n: qIdx + 1 }),
      };

      if (type === "free_text") {
        // Ordre : la plus récente d'abord (les leads arrivent triés par
        // date décroissante côté parent, on ne re-trie pas pour ne rien
        // supposer, on garde l'ordre reçu).
        const texts: string[] = [];
        for (const lead of leads) {
          if (!Array.isArray(lead.answers)) continue;
          const answer = lead.answers.find((a) => a.question_index === qIdx);
          const value = typeof answer?.text === "string" ? answer.text.trim() : "";
          if (value) texts.push(value);
        }
        return { ...base, kind: "text" as const, totalAnswered: texts.length, texts, data: [] };
      }

      if (type === "rating_scale" || type === "star_rating") {
        const cfg = (q.config ?? {}) as { min?: number; max?: number };
        const min = type === "star_rating" ? 1 : Number.isFinite(cfg.min) ? Number(cfg.min) : 0;
        const max = Number.isFinite(cfg.max) ? Number(cfg.max) : type === "star_rating" ? 5 : 10;
        const counts = new Map<number, number>();
        for (let v = min; v <= max; v++) counts.set(v, 0);
        let sum = 0;
        let n = 0;
        for (const lead of leads) {
          if (!Array.isArray(lead.answers)) continue;
          const answer = lead.answers.find((a) => a.question_index === qIdx);
          const raw = type === "star_rating" ? answer?.stars : answer?.rating;
          if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
          const value = Math.round(raw);
          counts.set(value, (counts.get(value) ?? 0) + 1);
          sum += value;
          n += 1;
        }
        const data = [...counts.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([value, count]) => ({
            name: String(value),
            fullName: String(value),
            value: count,
          }));
        return {
          ...base,
          kind: "scale" as const,
          totalAnswered: n,
          average: n > 0 ? Math.round((sum / n) * 10) / 10 : null,
          texts: [],
          data,
        };
      }

      const optionCounts = q.options.map(() => 0);
      let totalAnswered = 0;
      for (const lead of leads) {
        if (!Array.isArray(lead.answers)) continue;
        const answer = lead.answers.find((a) => a.question_index === qIdx);
        if (!answer) continue;
        // Build the list of picked indices: legacy single-pick OR multi-select
        // array. Each pick contributes 1 to its option counter; a multi-select
        // respondent still counts once toward `totalAnswered` (the chart
        // shows pick frequency, not response count, so this matches the
        // SurveyTrends convention).
        const picked: number[] = Array.isArray(answer.option_indices)
          ? answer.option_indices
          : typeof answer.option_index === "number"
            ? [answer.option_index]
            : [];
        let countedRespondent = false;
        for (const oi of picked) {
          if (oi >= 0 && oi < optionCounts.length) {
            optionCounts[oi] += 1;
            countedRespondent = true;
          }
        }
        if (countedRespondent) totalAnswered += 1;
      }
      const data = q.options.map((opt, oIdx) => {
        // Champs rich-text rendus en texte plat (chart axis, tooltip,
        // breakdown). stripHtml décode aussi les entités `&nbsp;`.
        const plain = stripHtml(opt.text) || t("optionFallback", { n: oIdx + 1 });
        return {
          name: truncate(plain),
          fullName: plain,
          value: optionCounts[oIdx],
        };
      });
      return {
        ...base,
        kind: "choice" as const,
        totalAnswered,
        texts: [] as string[],
        data,
      };
    });
  }, [leads, questions, t]);

  const hasAnyAnswers = questionStats.some((q) => q.totalAnswered > 0);

  // ─── KPI card config ─────────────────────────────────────────────────────
  // Compteurs RÉCONCILIÉS (cf. invariant supra).
  const kpis = [
    { icon: Eye, label: t("kpiViews"), value: reconciledViews },
    { icon: Play, label: t("kpiStarts"), value: reconciledStarts },
    { icon: CheckCircle, label: t("kpiCompletions"), value: reconciledCompletions },
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
          <CardContent className="pt-6 flex flex-col gap-4">
            {/* Taux de capture : leads / vues (chiffre ET libelle sur la meme base). */}
            <div>
              <h3 className="text-sm text-muted-foreground mb-1">
                {t("conversionRate")}
              </h3>
              <div className="text-3xl font-bold">
                {captureRate === null ? "—" : `${captureRate}%`}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("conversionSubtitle", { leads: leads.length, views: viewsCount })}
              </p>
            </div>
            {/* Taux de transformation : leads / demarrages. */}
            <div className="border-t border-border pt-3">
              <h3 className="text-sm text-muted-foreground mb-1">
                {t("startsRateLabel")}
              </h3>
              <div className="text-3xl font-bold">
                {startsRate === null ? "—" : `${startsRate}%`}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("startsRateSubtitle", { leads: leads.length, starts: startsCount })}
              </p>
            </div>
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

      {/* Results distribution — render only if there's at least one lead;
          sinon le donut serait vide (tous les profils a 0). */}
      {resultsDistribution.length > 0 && leads.length > 0 && (
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
                        hideCounts
                          ? formatPct(v, distributionTotal)
                          : `${v} (${formatPct(v, distributionTotal)})`,
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
                      {!hideCounts && <span className="font-medium">{r.value}</span>}
                      <span className="text-muted-foreground text-xs w-10 text-right">
                        {formatPct(r.value, distributionTotal)}
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
                    <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
                      {q.kind === "scale" && q.average !== null && (
                        <span className="font-medium text-foreground">
                          {t("averageRating", { value: q.average })}
                        </span>
                      )}
                      {!hideCounts && t("answersCount", { count: q.totalAnswered })}
                    </span>
                  </div>

                  {/* Réponses libres : on montre ce que les gens ont écrit.
                      C'est la matière première des emails de l'autrice. */}
                  {q.kind === "text" ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {q.texts.length > FREE_TEXT_DISPLAY_LIMIT
                            ? t("freeTextShown", {
                                shown: FREE_TEXT_DISPLAY_LIMIT,
                                total: q.texts.length,
                              })
                            : t("freeTextAll")}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => copyTexts(q.questionIndex, q.texts)}
                        >
                          {copiedQuestion === q.questionIndex ? (
                            <>
                              <Check className="me-1.5 h-3.5 w-3.5" />
                              {t("freeTextCopied")}
                            </>
                          ) : (
                            <>
                              <Copy className="me-1.5 h-3.5 w-3.5" />
                              {t("freeTextCopy")}
                            </>
                          )}
                        </Button>
                      </div>
                      <ul className="max-h-80 space-y-2 overflow-y-auto pe-1">
                        {q.texts.slice(0, FREE_TEXT_DISPLAY_LIMIT).map((text, i) => (
                          <li
                            key={i}
                            className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap"
                          >
                            {text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
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
                              {!hideCounts && (
                                <span className="font-medium text-foreground tabular-nums">
                                  {opt.value}
                                </span>
                              )}
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
                  )}
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
                    <td className="px-4 py-3">{stripHtml(l.result_title ?? "") || "—"}</td>
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
