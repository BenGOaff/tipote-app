"use client";

// components/quiz/SurveyTrends.tsx
// Tendances analytics block for survey detail. Aggregates lead.answers
// per question and renders type-aware visualisations:
//   - rating_scale / star_rating → histogram with average
//   - yes_no → split percentages
//   - multiple_choice / image_choice → ranked bars with %
//   - free_text → list of text responses
// Reused as the body of SurveyDetailClient's "trends" main tab.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Radar as RadarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { stripHtml } from "@/lib/richText";

type SurveyOption = { text: string; result_index: number; image_url?: string | null };
type SurveyQuestion = {
  question_text: string;
  question_type: "multiple_choice" | "rating_scale" | "star_rating" | "free_text" | "image_choice" | "yes_no";
  config: Record<string, unknown>;
  options: SurveyOption[];
};

type SurveyAnswer = {
  question_index: number;
  // Legacy single-choice path. Multi-select questions populate option_indices
  // instead — aggregation below treats them as one tally per picked option.
  option_index?: number;
  option_indices?: number[];
  rating?: number;
  stars?: number;
  text?: string;
};

type SurveyLead = {
  id: string;
  email: string;
  first_name: string | null;
  answers: SurveyAnswer[] | null;
  created_at: string;
};

// Couleur primaire Tipote - alignee sur les charts de QuizResultsAnalytics
// (donut + aire) pour rester coherent visuellement.
const RADAR_PRIMARY = "#5D6CDB";

// Libelle court d'axe radar : on tronque le texte de la question pour ne pas
// deformer la grille avec des libelles a rallonge.
function shortAxisLabel(s: string, max = 24): string {
  const plain = stripHtml(s || "").trim();
  if (!plain) return "";
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

// Agrege les questions de type note (rating_scale + star_rating) en un point
// par question : moyenne des reponses normalisee en % du max propre a chaque
// question (rating_scale 0-10 / NPS, star_rating 1-5), pour que les axes
// soient comparables sur une meme echelle 0..100.
type RadarRow = { n: number; axis: string; label: string; value: number; avg: number; max: number };
function buildRadarData(questions: SurveyQuestion[], leads: SurveyLead[]): RadarRow[] {
  const rows: RadarRow[] = [];
  let n = 0;
  questions.forEach((q, qIdx) => {
    if (q.question_type !== "rating_scale" && q.question_type !== "star_rating") return;
    const values: number[] = [];
    for (const l of leads) {
      if (!Array.isArray(l.answers)) continue;
      const a = l.answers.find((x) => x.question_index === qIdx);
      if (!a) continue;
      const v = q.question_type === "rating_scale" ? a.rating : a.stars;
      if (typeof v === "number" && Number.isFinite(v)) values.push(v);
    }
    if (values.length === 0) return;
    const max =
      q.question_type === "rating_scale"
        ? Number(q.config?.max ?? 10)
        : Number(q.config?.max ?? 5);
    const safeMax = max > 0 ? max : 1;
    const avg = values.reduce((s, m) => s + m, 0) / values.length;
    n += 1;
    rows.push({
      // Les axes sont numerotes (1, 2, 3...) au lieu d'afficher le texte
      // tronque : plusieurs questions commencent pareil ("Quelle note
      // donneriez-vous...") et devenaient indistinguables une fois coupees.
      // La legende sous le radar fait le lien numero -> question complete.
      n,
      axis: String(n),
      label: stripHtml(q.question_text || "").trim() || `Q${qIdx + 1}`,
      value: Math.round((avg / safeMax) * 1000) / 10,
      avg: Math.round(avg * 10) / 10,
      max: safeMax,
    });
  });
  return rows;
}

export function SurveyTrends({
  questions,
  leads,
  hideCounts = false,
}: {
  questions: SurveyQuestion[];
  leads: SurveyLead[];
  // Masque les nombres bruts de reponses (garde les %). Cf.
  // quizzes.hide_response_counts.
  hideCounts?: boolean;
}) {
  const t = useTranslations("survey");

  // Radar agrege des questions de type note. Rendu seulement si >= 3 axes
  // (un radar a moins de 3 sommets est degenere / illisible).
  const radarData = buildRadarData(questions, leads);

  if (leads.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          {t("trendsEmpty")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-3xl font-bold">{leads.length}</div>
            <div className="text-xs text-muted-foreground">{t("statRespondents")}</div>
          </div>
          <div>
            <div className="text-3xl font-bold">
              {leads.filter((l) => l.first_name).length}
            </div>
            <div className="text-xs text-muted-foreground">{t("statNamed")}</div>
          </div>
          <div>
            <div className="text-3xl font-bold">{questions.length}</div>
            <div className="text-xs text-muted-foreground">{t("statQuestions")}</div>
          </div>
        </CardContent>
      </Card>

      {radarData.length >= 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <RadarIcon className="w-4 h-4 text-primary" />
              {t("radarTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={360}>
              <RadarChart data={radarData} outerRadius="72%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fontSize: 13, fontWeight: 600, fill: "hsl(var(--muted-foreground))" }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--border))" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const r = payload[0]?.payload as RadarRow | undefined;
                    if (!r) return null;
                    return (
                      <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md max-w-xs">
                        <p className="font-semibold mb-0.5">{r.n}. {r.label}</p>
                        <p className="text-muted-foreground">
                          {t("radarTooltip", { avg: r.avg, max: r.max, pct: r.value })}
                        </p>
                      </div>
                    );
                  }}
                />
                <Radar
                  name={t("radarTitle")}
                  dataKey="value"
                  stroke={RADAR_PRIMARY}
                  strokeWidth={2}
                  fill={RADAR_PRIMARY}
                  fillOpacity={0.28}
                  dot={{ r: 3, fill: RADAR_PRIMARY, strokeWidth: 0 }}
                />
              </RadarChart>
            </ResponsiveContainer>
            {/* Legende numerotee : fait le lien entre chaque numero d'axe et
                la question complete + sa moyenne. Indispensable des qu'il y a
                plusieurs questions au libelle proche (retour Christelle). */}
            <ol className="mt-3 grid gap-1 sm:grid-cols-2 text-xs text-muted-foreground">
              {radarData.map((r) => (
                <li key={r.n} className="flex gap-1.5">
                  <span className="font-semibold text-foreground shrink-0">{r.n}.</span>
                  <span className="min-w-0">
                    <span className="truncate">{shortAxisLabel(r.label, 70)}</span>{" "}
                    <span className="whitespace-nowrap font-medium text-foreground">
                      {r.avg}/{r.max}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {questions.map((q, qIdx) => (
        <QuestionTrend key={qIdx} question={q} qIdx={qIdx} leads={leads} hideCounts={hideCounts} />
      ))}
    </div>
  );
}

function QuestionTrend({
  question,
  qIdx,
  leads,
  hideCounts,
}: {
  question: SurveyQuestion;
  qIdx: number;
  leads: SurveyLead[];
  hideCounts: boolean;
}) {
  const t = useTranslations("survey");

  const answers = leads
    .map((l) => (Array.isArray(l.answers) ? l.answers.find((a) => a.question_index === qIdx) : null))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  const respondedCount = answers.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-start gap-2">
          <Badge variant="outline">{t(`type_${question.question_type}` as never)}</Badge>
          <span className="flex-1">{question.question_text || t("untitledQuestion")}</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {respondedCount} {t("trendResponseCount")}
        </p>
      </CardHeader>
      <CardContent>
        {question.question_type === "rating_scale" && (
          <RatingDistribution
            answers={answers.map((a) => a.rating).filter((v): v is number => typeof v === "number")}
            min={Number(question.config?.min ?? 0)}
            max={Number(question.config?.max ?? 10)}
            hideCounts={hideCounts}
          />
        )}
        {question.question_type === "star_rating" && (
          <RatingDistribution
            answers={answers.map((a) => a.stars).filter((v): v is number => typeof v === "number")}
            min={1}
            max={Number(question.config?.max ?? 5)}
            hideCounts={hideCounts}
            renderLabel={(v) => (
              <span className="flex items-center gap-0.5">
                {v} <Star className="w-3 h-3 fill-current" />
              </span>
            )}
          />
        )}
        {question.question_type === "yes_no" && (
          <YesNoDistribution
            yes={answers.filter((a) => a.option_index === 0).length}
            no={answers.filter((a) => a.option_index === 1).length}
            hideCounts={hideCounts}
          />
        )}
        {(question.question_type === "multiple_choice" || question.question_type === "image_choice") && (
          <OptionDistribution
            hideCounts={hideCounts}
            options={question.options}
            counts={question.options.map(
              // Count both legacy single picks (option_index) AND multi-select
              // picks (option_indices[]). A respondent who ticked 3 options on
              // a multi-select question contributes 1 to each of those 3
              // option counters — same convention as Typeform / Tally.
              (_, oi) => answers.filter((a) =>
                a.option_index === oi || (Array.isArray(a.option_indices) && a.option_indices.includes(oi))
              ).length,
            )}
          />
        )}
        {question.question_type === "free_text" && (
          <FreeTextList
            entries={answers
              .map((a) => a.text)
              .filter((v): v is string => typeof v === "string" && v.trim().length > 0)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function RatingDistribution({
  answers,
  min,
  max,
  renderLabel,
  hideCounts,
}: {
  answers: number[];
  min: number;
  max: number;
  renderLabel?: (v: number) => React.ReactNode;
  hideCounts?: boolean;
}) {
  const t = useTranslations("survey");
  const total = answers.length;
  const avg = total > 0 ? answers.reduce((a, b) => a + b, 0) / total : 0;
  const buckets: number[] = [];
  for (let v = min; v <= max; v++) {
    buckets.push(answers.filter((a) => a === v).length);
  }
  const peak = Math.max(1, ...buckets);

  return (
    <div className="space-y-3">
      <div className="text-sm">
        {t("trendAverage")}: <span className="font-bold">{avg.toFixed(1)}</span> / {max}
      </div>
      <div className="space-y-1">
        {buckets.map((count, i) => {
          const v = min + i;
          const pct = total > 0 ? (count / peak) * 100 : 0;
          return (
            <div key={v} className="flex items-center gap-2 text-xs">
              <span className="w-10 text-right text-muted-foreground">
                {renderLabel ? renderLabel(v) : v}
              </span>
              <div className="flex-1 bg-muted/40 rounded-full h-5 overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${pct}%`, transition: "width 200ms" }}
                />
              </div>
              {!hideCounts && <span className="w-10 text-muted-foreground">{count}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YesNoDistribution({ yes, no, hideCounts }: { yes: number; no: number; hideCounts?: boolean }) {
  const t = useTranslations("survey");
  const total = yes + no;
  const yesPct = total > 0 ? Math.round((yes / total) * 100) : 0;
  const noPct = total > 0 ? Math.round((no / total) * 100) : 0;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="text-center p-4 rounded-xl bg-primary/5">
        <div className="text-3xl font-bold text-primary">{yesPct}%</div>
        <div className="text-xs text-muted-foreground">
          {t("yesLabel")}{hideCounts ? "" : ` (${yes})`}
        </div>
      </div>
      <div className="text-center p-4 rounded-xl bg-muted/40">
        <div className="text-3xl font-bold">{noPct}%</div>
        <div className="text-xs text-muted-foreground">
          {t("noLabel")}{hideCounts ? "" : ` (${no})`}
        </div>
      </div>
    </div>
  );
}

function OptionDistribution({ options, counts, hideCounts }: { options: SurveyOption[]; counts: number[]; hideCounts?: boolean }) {
  const total = counts.reduce((a, b) => a + b, 0);
  const peak = Math.max(1, ...counts);
  return (
    <div className="space-y-2">
      {options.map((opt, oi) => {
        const c = counts[oi] ?? 0;
        const pct = peak > 0 ? (c / peak) * 100 : 0;
        const sharePct = total > 0 ? Math.round((c / total) * 100) : 0;
        return (
          <div key={oi} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="truncate">{stripHtml(opt.text) || `Option ${oi + 1}`}</span>
              <span className="text-xs text-muted-foreground">
                {hideCounts ? `${sharePct}%` : `${c} (${sharePct}%)`}
              </span>
            </div>
            <div className="bg-muted/40 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${pct}%`, transition: "width 200ms" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FreeTextList({ entries }: { entries: string[] }) {
  const t = useTranslations("survey");
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground italic">{t("trendsEmpty")}</p>;
  }
  return (
    <ul className="space-y-2 max-h-96 overflow-y-auto">
      {entries.map((text, i) => (
        <li key={i} className="text-sm p-3 rounded-lg bg-muted/30 border">
          {text}
        </li>
      ))}
    </ul>
  );
}
