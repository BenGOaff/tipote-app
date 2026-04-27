"use client";

// components/quiz/SurveyFormClient.tsx
// Entry point for survey creation. Three modes mirror /quiz/new:
//   - Manual: stub a survey row and jump to the editor (handled in commit 5)
//   - AI: form → SSE stream → auto-save → editor
//   - Import: paste text → AI structures it → auto-save → editor
// Surveys are stored in the same `quizzes` table with mode='survey'; the
// detail editor branches on that flag, so once we land at /quiz/[id] the
// survey-specific UI (no result profiles, question-type picker, Tendances
// tab) takes over.

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Sparkles, FileText, Upload, ClipboardPaste } from "lucide-react";
import { AIGeneratingOverlay } from "@/components/ui/ai-generating-overlay";
import { LanguageCombobox } from "@/components/quiz/LanguageCombobox";
import { SURVEY_OBJECTIVES } from "@/lib/prompts/quiz/system";
import { toast } from "sonner";

type GeneratedSurvey = Record<string, unknown>;

export default function SurveyFormClient() {
  const t = useTranslations("survey");
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"ai" | "import" | "manual">("ai");
  const [creatingManual, setCreatingManual] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [importing, setImporting] = useState(false);

  // ── AI form ────────────────────────────────────────────────────────
  const [aiObjective, setAiObjective] = useState<string>(SURVEY_OBJECTIVES[0].value);
  const [aiTarget, setAiTarget] = useState("");
  const [aiIntention, setAiIntention] = useState("");
  const [aiCta, setAiCta] = useState("");
  const [aiTone, setAiTone] = useState("");
  const [aiQuestionCount, setAiQuestionCount] = useState(6);
  const [aiLocale, setAiLocale] = useState("fr");
  const aiLocaleTouched = useRef(false);

  // ── Import ────────────────────────────────────────────────────────
  const [importText, setImportText] = useState("");

  // Load the user's default content_locale + tone so the form starts pre-filled.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile");
        const json = await res.json();
        if (!cancelled && json?.profile) {
          const p = json.profile as Record<string, unknown>;
          if (!aiLocaleTouched.current && typeof p.content_locale === "string") {
            setAiLocale(p.content_locale);
          }
          if (typeof p.brand_tone === "string") setAiTone(p.brand_tone);
        }
      } catch {
        /* fail open: keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Save flow ─────────────────────────────────────────────────────
  // Posts a survey row to /api/quiz with mode='survey' and redirects to the
  // editor on success. Used by both AI and Import flows once a payload is
  // assembled.
  async function saveSurveyAndRedirect(payload: Record<string, unknown>) {
    const res = await fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, mode: "survey" }),
    });
    const data = await res.json();
    if (data.ok && data.quizId) {
      router.push(`/quiz/${data.quizId}`);
      return true;
    }
    if (data.error === "FREE_PLAN_QUIZ_LIMIT") {
      toast.error(t("errFreePlanLimit"));
    } else {
      toast.error(data.error || t("errCreate"));
    }
    return false;
  }

  // ── Manual: stub + redirect ───────────────────────────────────────
  async function handleCreateManual() {
    setCreatingManual(true);
    const ok = await saveSurveyAndRedirect({
      title: t("manualDefaultTitle"),
      locale: aiLocale,
      questions: [
        {
          question_text: "",
          question_type: "rating_scale",
          config: {
            min: 0,
            max: 10,
            minLabel: t("ratingMinDefault"),
            maxLabel: t("ratingMaxDefault"),
          },
          options: [],
        },
        {
          question_text: "",
          question_type: "free_text",
          config: { maxLength: 500 },
          options: [],
        },
      ],
    });
    if (!ok) setCreatingManual(false);
  }

  // ── SSE consumer (shared by AI + Import) ──────────────────────────
  // Returns the parsed survey JSON when the stream emits a "result" event,
  // or null on error / empty response. Toast handling stays at the call site
  // so each entry point can do its own follow-up (auto-save, switch tab…).
  async function consumeSseStream(res: Response): Promise<GeneratedSurvey | null> {
    const reader = res.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";
    let received: GeneratedSurvey | null = null;
    let errorShown = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("event:")) {
          currentEvent = trimmed.slice(6).trim();
          continue;
        }
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") break;
        try {
          const parsed = JSON.parse(payload);
          if (currentEvent === "result" && parsed.ok && parsed.quiz) {
            received = parsed.quiz as GeneratedSurvey;
          } else if (currentEvent === "error" && !errorShown) {
            toast.error(parsed.error || t("errAi"));
            errorShown = true;
          }
        } catch {
          /* unparseable SSE chunk — skip */
        }
        currentEvent = "";
      }
    }
    return received;
  }

  // ── AI generate ────────────────────────────────────────────────────
  async function handleGenerate() {
    const target = aiTarget.trim();
    if (!target) {
      toast.error(t("aiTargetRequired"));
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "survey",
          objective: aiObjective,
          target,
          intention: aiIntention.trim(),
          cta: aiCta.trim(),
          tone: aiTone.trim(),
          questionCount: aiQuestionCount,
          locale: aiLocale,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        toast.error(`${t("errAi")}${errText ? ` — ${errText.slice(0, 150)}` : ""}`);
        return;
      }
      const survey = await consumeSseStream(res);
      if (!survey) {
        toast.error(t("errAi"));
        return;
      }
      toast.success(t("aiGenerated"));
      await saveSurveyAndRedirect({
        title: String(survey.title || t("manualDefaultTitle")),
        introduction: survey.introduction ? String(survey.introduction) : null,
        cta_text: survey.cta_text ? String(survey.cta_text) : null,
        locale: aiLocale,
        questions: Array.isArray(survey.questions) ? survey.questions : [],
      });
    } catch {
      toast.error(t("errAi"));
    } finally {
      setGenerating(false);
    }
  }

  // ── Import (paste text) ───────────────────────────────────────────
  async function handleImport() {
    const content = importText.trim();
    if (!content) {
      toast.error(t("importEmpty"));
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "survey",
          mode: "import",
          content: content.slice(0, 50000),
          locale: aiLocale,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        toast.error(`${t("errImport")}${errText ? ` — ${errText.slice(0, 150)}` : ""}`);
        return;
      }
      const survey = await consumeSseStream(res);
      if (!survey) {
        toast.error(t("errImport"));
        return;
      }
      toast.success(t("importDone"));
      await saveSurveyAndRedirect({
        title: String(survey.title || t("manualDefaultTitle")),
        introduction: survey.introduction ? String(survey.introduction) : null,
        cta_text: survey.cta_text ? String(survey.cta_text) : null,
        locale: aiLocale,
        questions: Array.isArray(survey.questions) ? survey.questions : [],
      });
    } catch {
      toast.error(t("errImport"));
    } finally {
      setImporting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {(generating || importing) && <AIGeneratingOverlay />}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="w-full sm:w-auto bg-transparent border-b rounded-none justify-start gap-0 h-auto p-0">
          <TabsTrigger
            value="ai"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-5 py-3 text-sm font-medium gap-1.5"
          >
            <Sparkles className="h-4 w-4" />
            {t("tabAi")}
          </TabsTrigger>
          <TabsTrigger
            value="import"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-5 py-3 text-sm font-medium gap-1.5"
          >
            <Upload className="h-4 w-4" />
            {t("tabImport")}
          </TabsTrigger>
          <TabsTrigger
            value="manual"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-5 py-3 text-sm font-medium gap-1.5"
            onClick={(e) => {
              e.preventDefault();
              handleCreateManual();
            }}
          >
            <FileText className="h-4 w-4" />
            {creatingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : t("tabManual")}
          </TabsTrigger>
        </TabsList>

        {/* AI tab */}
        <TabsContent value="ai" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {t("aiTitle")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t("aiHint")}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ai-objective">{t("aiObjectiveLabel")}</Label>
                <select
                  id="ai-objective"
                  value={aiObjective}
                  onChange={(e) => setAiObjective(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {SURVEY_OBJECTIVES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.labelFr} — {o.desc}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-target">{t("aiTargetLabel")}</Label>
                <p className="text-xs text-muted-foreground">{t("aiTargetHint")}</p>
                <Textarea
                  id="ai-target"
                  value={aiTarget}
                  onChange={(e) => setAiTarget(e.target.value)}
                  rows={2}
                  placeholder={t("aiTargetPlaceholder")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-intention">{t("aiIntentionLabel")}</Label>
                <p className="text-xs text-muted-foreground">{t("aiIntentionHint")}</p>
                <Input
                  id="ai-intention"
                  value={aiIntention}
                  onChange={(e) => setAiIntention(e.target.value)}
                  placeholder={t("aiIntentionPlaceholder")}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ai-tone">{t("aiToneLabel")}</Label>
                  <Input
                    id="ai-tone"
                    value={aiTone}
                    onChange={(e) => setAiTone(e.target.value)}
                    placeholder={t("aiTonePlaceholder")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ai-question-count">{t("aiQuestionCountLabel")}</Label>
                  <Input
                    id="ai-question-count"
                    type="number"
                    min={3}
                    max={12}
                    value={aiQuestionCount}
                    onChange={(e) =>
                      setAiQuestionCount(Math.min(12, Math.max(3, Number(e.target.value) || 6)))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-cta">{t("aiCtaLabel")}</Label>
                <Input
                  id="ai-cta"
                  value={aiCta}
                  onChange={(e) => setAiCta(e.target.value)}
                  placeholder={t("aiCtaPlaceholder")}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("aiLocaleLabel")}</Label>
                <LanguageCombobox
                  value={aiLocale}
                  onValueChange={(v) => {
                    aiLocaleTouched.current = true;
                    setAiLocale(v);
                  }}
                  label=""
                  hint={t("aiLocaleHint")}
                />
              </div>

              <Button
                size="lg"
                className="w-full rounded-full"
                disabled={generating || !aiTarget.trim()}
                onClick={handleGenerate}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("generatingButton")}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" /> {t("generateButton")}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Import tab */}
        <TabsContent value="import" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardPaste className="h-5 w-5 text-primary" />
                {t("importTitle")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t("importHint")}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={10}
                placeholder={t("importPlaceholder")}
                className="font-mono text-sm"
              />
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>{importText.length}/50000</span>
              </div>

              <div className="space-y-1.5">
                <Label>{t("aiLocaleLabel")}</Label>
                <LanguageCombobox
                  value={aiLocale}
                  onValueChange={(v) => {
                    aiLocaleTouched.current = true;
                    setAiLocale(v);
                  }}
                  label=""
                  hint={t("aiLocaleHint")}
                />
              </div>

              <Button
                size="lg"
                className="w-full rounded-full"
                disabled={importing || !importText.trim()}
                onClick={handleImport}
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("importingButton")}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" /> {t("importButton")}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
