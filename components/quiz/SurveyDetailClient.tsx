"use client";

// components/quiz/SurveyDetailClient.tsx
// Survey-specific editor (mode='survey'). Loads the same /api/quiz/[id] row
// the quiz editor uses but renders a tighter UI:
//   - No result profiles, no virality / bonus controls
//   - Per-question type picker (multiple_choice / rating_scale / star_rating
//     / free_text / image_choice / yes_no) with type-aware config inputs
//   - "Tendances" analytics tab that aggregates lead answers per question
// Saves go through the existing PATCH route; both routes already accept
// question_type + config since commit 4 / 5.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Plus,
  Trash2,
  Save,
  ExternalLink,
  ArrowLeft,
  Star,
  TrendingUp,
  Pencil,
  GripVertical,
  Copy,
  Check,
} from "lucide-react";
import { LanguageCombobox } from "@/components/quiz/LanguageCombobox";
import { toast } from "sonner";

type QuestionType =
  | "multiple_choice"
  | "rating_scale"
  | "star_rating"
  | "free_text"
  | "image_choice"
  | "yes_no";

type QuizOption = { text: string; result_index: number; image_url?: string };
type SurveyQuestion = {
  id?: string;
  question_text: string;
  question_type: QuestionType;
  config: Record<string, unknown>;
  options: QuizOption[];
  sort_order: number;
};

type SurveyLead = {
  id: string;
  email: string;
  first_name: string | null;
  answers:
    | Array<{
        question_index: number;
        option_index?: number;
        rating?: number;
        stars?: number;
        text?: string;
      }>
    | null;
  created_at: string;
};

type SurveyData = {
  id: string;
  title: string;
  introduction: string | null;
  cta_text: string | null;
  cta_url: string | null;
  locale: string | null;
  status: string;
  slug: string | null;
  capture_first_name: boolean | null;
  capture_last_name: boolean | null;
  capture_phone: boolean | null;
  capture_country: boolean | null;
  views_count: number;
  starts_count: number;
  completions_count: number;
  questions: SurveyQuestion[];
};

const TYPE_OPTIONS: { value: QuestionType; labelKey: string }[] = [
  { value: "rating_scale", labelKey: "typeRatingScale" },
  { value: "star_rating", labelKey: "typeStarRating" },
  { value: "yes_no", labelKey: "typeYesNo" },
  { value: "free_text", labelKey: "typeFreeText" },
  { value: "multiple_choice", labelKey: "typeMultipleChoice" },
  { value: "image_choice", labelKey: "typeImageChoice" },
];

function defaultConfigFor(type: QuestionType, t: (k: string) => string): Record<string, unknown> {
  if (type === "rating_scale") {
    return {
      min: 0,
      max: 10,
      minLabel: t("ratingMinDefault"),
      maxLabel: t("ratingMaxDefault"),
    };
  }
  if (type === "star_rating") return { max: 5 };
  if (type === "free_text") return { maxLength: 500 };
  return {};
}

function emptyQuestion(type: QuestionType, t: (k: string) => string): SurveyQuestion {
  const needsOptions = type === "multiple_choice" || type === "image_choice";
  return {
    question_text: "",
    question_type: type,
    config: defaultConfigFor(type, t),
    options: needsOptions
      ? [
          { text: "", result_index: 0 },
          { text: "", result_index: 0 },
          { text: "", result_index: 0 },
        ]
      : [],
    sort_order: 0,
  };
}

export default function SurveyDetailClient({ quizId }: { quizId: string }) {
  const t = useTranslations("survey");
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [leads, setLeads] = useState<SurveyLead[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"edit" | "trends">("edit");
  const [linkCopied, setLinkCopied] = useState(false);

  // ── Load ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/quiz/${quizId}`);
        const json = await res.json();
        if (cancelled) return;
        if (!json?.ok || !json.quiz) {
          toast.error(t("errLoad"));
          return;
        }
        const q = json.quiz as Record<string, unknown>;
        const questions = Array.isArray(q.questions)
          ? (q.questions as Record<string, unknown>[]).map((qq, i) => ({
              id: qq.id as string | undefined,
              question_text: String(qq.question_text ?? ""),
              question_type: ((qq.question_type as QuestionType) ?? "multiple_choice"),
              config: (qq.config as Record<string, unknown>) ?? {},
              options: Array.isArray(qq.options)
                ? (qq.options as QuizOption[])
                : [],
              sort_order: typeof qq.sort_order === "number" ? qq.sort_order : i,
            }))
          : [];
        setSurvey({
          id: String(q.id),
          title: String(q.title ?? ""),
          introduction: (q.introduction as string | null) ?? null,
          cta_text: (q.cta_text as string | null) ?? null,
          cta_url: (q.cta_url as string | null) ?? null,
          locale: (q.locale as string | null) ?? "fr",
          status: String(q.status ?? "draft"),
          slug: (q.slug as string | null) ?? null,
          capture_first_name: (q.capture_first_name as boolean | null) ?? false,
          capture_last_name: (q.capture_last_name as boolean | null) ?? false,
          capture_phone: (q.capture_phone as boolean | null) ?? false,
          capture_country: (q.capture_country as boolean | null) ?? false,
          views_count: Number(q.views_count ?? 0),
          starts_count: Number(q.starts_count ?? 0),
          completions_count: Number(q.completions_count ?? 0),
          questions,
        });
        setLeads(Array.isArray(json.leads) ? (json.leads as SurveyLead[]) : []);
      } catch {
        if (!cancelled) toast.error(t("errLoad"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId, t]);

  // ── Save (debounced) ────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(handleSave, 800);
  };

  async function handleSave() {
    if (!survey) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/quiz/${quizId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: survey.title,
          introduction: survey.introduction,
          cta_text: survey.cta_text,
          cta_url: survey.cta_url,
          locale: survey.locale,
          status: survey.status,
          capture_first_name: survey.capture_first_name,
          capture_last_name: survey.capture_last_name,
          capture_phone: survey.capture_phone,
          capture_country: survey.capture_country,
          questions: survey.questions.map((q, i) => ({
            question_text: q.question_text,
            question_type: q.question_type,
            config: q.config,
            options: q.options,
            sort_order: i,
          })),
        }),
      });
      const data = await res.json();
      if (!data?.ok) {
        toast.error(data?.error || t("errSave"));
      }
    } catch {
      toast.error(t("errSave"));
    } finally {
      setSaving(false);
    }
  }

  // ── Question helpers ─────────────────────────────────────────────
  function patchQuestion(idx: number, patch: Partial<SurveyQuestion>) {
    if (!survey) return;
    const next = [...survey.questions];
    next[idx] = { ...next[idx], ...patch };
    setSurvey({ ...survey, questions: next });
    triggerSave();
  }

  function changeType(idx: number, type: QuestionType) {
    if (!survey) return;
    // Switching type resets the config (different shape) but preserves the
    // question_text + options when the new type still uses options.
    const next = [...survey.questions];
    const prev = next[idx];
    const needsOptions = type === "multiple_choice" || type === "image_choice";
    next[idx] = {
      ...prev,
      question_type: type,
      config: defaultConfigFor(type, t),
      options: needsOptions && prev.options.length > 0
        ? prev.options
        : needsOptions
          ? [
              { text: "", result_index: 0 },
              { text: "", result_index: 0 },
              { text: "", result_index: 0 },
            ]
          : [],
    };
    setSurvey({ ...survey, questions: next });
    triggerSave();
  }

  function addQuestion() {
    if (!survey) return;
    setSurvey({
      ...survey,
      questions: [...survey.questions, { ...emptyQuestion("rating_scale", t), sort_order: survey.questions.length }],
    });
    triggerSave();
  }

  function removeQuestion(idx: number) {
    if (!survey) return;
    if (survey.questions.length <= 1) {
      toast.error(t("errMinQuestions"));
      return;
    }
    setSurvey({ ...survey, questions: survey.questions.filter((_, i) => i !== idx) });
    triggerSave();
  }

  // ── Public URL ───────────────────────────────────────────────────
  const publicUrl = useMemo(() => {
    if (typeof window === "undefined" || !survey) return "";
    return `${window.location.origin}/quiz/${survey.slug || survey.id}`;
  }, [survey]);

  // ── Render guards ────────────────────────────────────────────────
  if (loading || !survey) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-24">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/contents")}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            {t("backToProjects")}
          </Button>
          <Badge variant={survey.status === "active" ? "default" : "secondary"}>
            {survey.status === "active" ? t("statusActive") : t("statusDraft")}
          </Badge>
          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
            {t("modeBadge")}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> {t("savingHint")}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSurvey({ ...survey, status: survey.status === "active" ? "draft" : "active" });
              triggerSave();
            }}
          >
            {survey.status === "active" ? t("setDraft") : t("setActive")}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {t("saveNow")}
          </Button>
        </div>
      </div>

      {/* Public URL */}
      {survey.status === "active" && (
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <code className="text-xs flex-1 truncate text-muted-foreground">{publicUrl}</code>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(publicUrl);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                } catch {
                  /* clipboard blocked */
                }
              }}
            >
              {linkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="edit" className="gap-1.5">
            <Pencil className="w-4 h-4" />
            {t("tabEdit")}
          </TabsTrigger>
          <TabsTrigger value="trends" className="gap-1.5">
            <TrendingUp className="w-4 h-4" />
            {t("tabTrends")} ({leads.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Edit tab ───────────────────────────────────────────── */}
        <TabsContent value="edit" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("generalSection")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="survey-title">{t("titleLabel")}</Label>
                <Input
                  id="survey-title"
                  value={survey.title}
                  onChange={(e) => {
                    setSurvey({ ...survey, title: e.target.value });
                    triggerSave();
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="survey-intro">{t("introLabel")}</Label>
                <Textarea
                  id="survey-intro"
                  value={survey.introduction ?? ""}
                  onChange={(e) => {
                    setSurvey({ ...survey, introduction: e.target.value });
                    triggerSave();
                  }}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("localeLabel")}</Label>
                <LanguageCombobox
                  value={survey.locale ?? "fr"}
                  onValueChange={(v) => {
                    setSurvey({ ...survey, locale: v });
                    triggerSave();
                  }}
                  label=""
                  hint={t("localeHint")}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("questionsSection")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {survey.questions.map((q, idx) => (
                <QuestionCard
                  key={idx}
                  index={idx}
                  question={q}
                  onPatch={(patch) => patchQuestion(idx, patch)}
                  onChangeType={(type) => changeType(idx, type)}
                  onRemove={() => removeQuestion(idx)}
                />
              ))}
              <Button variant="outline" onClick={addQuestion} className="w-full">
                <Plus className="w-4 h-4 mr-1" />
                {t("addQuestion")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("ctaSection")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cta-text">{t("ctaText")}</Label>
                <Input
                  id="cta-text"
                  value={survey.cta_text ?? ""}
                  onChange={(e) => {
                    setSurvey({ ...survey, cta_text: e.target.value });
                    triggerSave();
                  }}
                  placeholder={t("ctaTextPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cta-url">{t("ctaUrl")}</Label>
                <Input
                  id="cta-url"
                  type="url"
                  value={survey.cta_url ?? ""}
                  onChange={(e) => {
                    setSurvey({ ...survey, cta_url: e.target.value });
                    triggerSave();
                  }}
                  placeholder="https://…"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("captureSection")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(["capture_first_name", "capture_last_name", "capture_phone", "capture_country"] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(survey[key])}
                    onChange={(e) => {
                      setSurvey({ ...survey, [key]: e.target.checked });
                      triggerSave();
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">{t(`capture_${key.replace("capture_", "")}`)}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!confirm(t("deleteConfirm"))) return;
                const res = await fetch(`/api/quiz/${quizId}`, { method: "DELETE" });
                if (res.ok) {
                  toast.success(t("deleteDone"));
                  router.push("/contents");
                } else {
                  toast.error(t("errDelete"));
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {t("deleteSurvey")}
            </Button>
          </div>
        </TabsContent>

        {/* ── Trends tab ─────────────────────────────────────────── */}
        <TabsContent value="trends" className="space-y-4 mt-4">
          <TrendsView questions={survey.questions} leads={leads} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Question card ────────────────────────────────────────────────────
function QuestionCard({
  index,
  question,
  onPatch,
  onChangeType,
  onRemove,
}: {
  index: number;
  question: SurveyQuestion;
  onPatch: (p: Partial<SurveyQuestion>) => void;
  onChangeType: (t: QuestionType) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("survey");
  const cfg = question.config ?? {};

  return (
    <div className="border-2 border-dashed border-muted rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {t("questionLabel")} {index + 1}
        </span>
        <select
          value={question.question_type}
          onChange={(e) => onChangeType(e.target.value as QuestionType)}
          className="ml-auto text-xs rounded-md border border-input bg-background px-2 py-1"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <Textarea
        value={question.question_text}
        onChange={(e) => onPatch({ question_text: e.target.value })}
        rows={2}
        placeholder={t("questionPlaceholder")}
      />

      {/* Type-specific config */}
      {question.question_type === "rating_scale" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("scaleMin")}</Label>
            <Input
              type="number"
              value={Number(cfg.min ?? 0)}
              onChange={(e) => onPatch({ config: { ...cfg, min: Number(e.target.value) } })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("scaleMax")}</Label>
            <Input
              type="number"
              value={Number(cfg.max ?? 10)}
              onChange={(e) => onPatch({ config: { ...cfg, max: Number(e.target.value) } })}
            />
          </div>
          <div className="space-y-1 col-span-2 sm:col-span-1">
            <Label className="text-xs">{t("scaleMinLabel")}</Label>
            <Input
              value={String(cfg.minLabel ?? "")}
              onChange={(e) => onPatch({ config: { ...cfg, minLabel: e.target.value } })}
            />
          </div>
          <div className="space-y-1 col-span-2 sm:col-span-1">
            <Label className="text-xs">{t("scaleMaxLabel")}</Label>
            <Input
              value={String(cfg.maxLabel ?? "")}
              onChange={(e) => onPatch({ config: { ...cfg, maxLabel: e.target.value } })}
            />
          </div>
        </div>
      )}

      {question.question_type === "star_rating" && (
        <div className="space-y-1">
          <Label className="text-xs">{t("starMax")}</Label>
          <Input
            type="number"
            min={3}
            max={10}
            value={Number(cfg.max ?? 5)}
            onChange={(e) =>
              onPatch({ config: { ...cfg, max: Math.min(10, Math.max(3, Number(e.target.value) || 5)) } })
            }
          />
        </div>
      )}

      {question.question_type === "free_text" && (
        <div className="space-y-1">
          <Label className="text-xs">{t("textMaxLength")}</Label>
          <Input
            type="number"
            min={50}
            max={5000}
            value={Number(cfg.maxLength ?? 500)}
            onChange={(e) =>
              onPatch({ config: { ...cfg, maxLength: Math.min(5000, Math.max(50, Number(e.target.value) || 500)) } })
            }
          />
        </div>
      )}

      {(question.question_type === "multiple_choice" || question.question_type === "image_choice") && (
        <div className="space-y-2">
          <Label className="text-xs">{t("optionsLabel")}</Label>
          {question.options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <Input
                value={opt.text}
                onChange={(e) => {
                  const next = [...question.options];
                  next[oi] = { ...next[oi], text: e.target.value };
                  onPatch({ options: next });
                }}
                placeholder={`${t("optionPlaceholder")} ${oi + 1}`}
              />
              {question.question_type === "image_choice" && (
                <Input
                  type="url"
                  value={opt.image_url ?? ""}
                  onChange={(e) => {
                    const next = [...question.options];
                    next[oi] = { ...next[oi], image_url: e.target.value };
                    onPatch({ options: next });
                  }}
                  placeholder={t("imageUrlPlaceholder")}
                  className="max-w-[200px]"
                />
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (question.options.length <= 2) {
                    toast.error(t("errMinOptions"));
                    return;
                  }
                  onPatch({ options: question.options.filter((_, i) => i !== oi) });
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPatch({ options: [...question.options, { text: "", result_index: 0 }] })}
          >
            <Plus className="w-4 h-4 mr-1" />
            {t("addOption")}
          </Button>
        </div>
      )}

      {question.question_type === "yes_no" && (
        <p className="text-xs text-muted-foreground italic">{t("yesNoHint")}</p>
      )}
    </div>
  );
}

// ─── Trends view ──────────────────────────────────────────────────────
function TrendsView({
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

function OptionDistribution({ options, counts }: { options: QuizOption[]; counts: number[] }) {
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
