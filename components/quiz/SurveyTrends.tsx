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
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

type SurveyOption = { text: string; result_index: number; image_url?: string | null };
type SurveyQuestion = {
  question_text: string;
  question_type: "multiple_choice" | "rating_scale" | "star_rating" | "free_text" | "image_choice" | "yes_no";
  config: Record<string, unknown>;
  options: SurveyOption[];
};

type SurveyAnswer = {
  question_index: number;
  option_index?: number;
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

export function SurveyTrends({
  questions,
  leads,
}: {
  questions: SurveyQuestion[];
  leads: SurveyLead[];
}) {
  const t = useTranslations("survey");

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

      {questions.map((q, qIdx) => (
        <QuestionTrend key={qIdx} question={q} qIdx={qIdx} leads={leads} />
      ))}
    </div>
  );
}

function QuestionTrend({
  question,
  qIdx,
  leads,
}: {
  question: SurveyQuestion;
  qIdx: number;
  leads: SurveyLead[];
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
          />
        )}
        {question.question_type === "star_rating" && (
          <RatingDistribution
            answers={answers.map((a) => a.stars).filter((v): v is number => typeof v === "number")}
            min={1}
            max={Number(question.config?.max ?? 5)}
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
          />
        )}
        {(question.question_type === "multiple_choice" || question.question_type === "image_choice") && (
          <OptionDistribution
            options={question.options}
            counts={question.options.map(
              (_, oi) => answers.filter((a) => a.option_index === oi).length,
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
}: {
  answers: number[];
  min: number;
  max: number;
  renderLabel?: (v: number) => React.ReactNode;
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
              <span className="w-10 text-muted-foreground">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YesNoDistribution({ yes, no }: { yes: number; no: number }) {
  const t = useTranslations("survey");
  const total = yes + no;
  const yesPct = total > 0 ? Math.round((yes / total) * 100) : 0;
  const noPct = total > 0 ? Math.round((no / total) * 100) : 0;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="text-center p-4 rounded-xl bg-primary/5">
        <div className="text-3xl font-bold text-primary">{yesPct}%</div>
        <div className="text-xs text-muted-foreground">
          {t("yesLabel")} ({yes})
        </div>
      </div>
      <div className="text-center p-4 rounded-xl bg-muted/40">
        <div className="text-3xl font-bold">{noPct}%</div>
        <div className="text-xs text-muted-foreground">
          {t("noLabel")} ({no})
        </div>
      </div>
    </div>
  );
}

function OptionDistribution({ options, counts }: { options: SurveyOption[]; counts: number[] }) {
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
              <span className="truncate">{opt.text || `Option ${oi + 1}`}</span>
              <span className="text-xs text-muted-foreground">
                {c} ({sharePct}%)
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
