"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuizOption = {
  text: string;
  result_index: number;
};

type QuizQuestion = {
  question_text: string;
  options: QuizOption[];
};

type QuizResult = {
  title: string;
  description: string;
  insight: string;
  projection: string;
  cta_text: string;
  cta_url: string;
  sio_tag_name: string;
  sio_course_id: string;
  sio_community_id: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyQuestion(): QuizQuestion {
  return {
    question_text: "",
    options: [
      { text: "", result_index: 0 },
      { text: "", result_index: 0 },
    ],
  };
}

function emptyResult(): QuizResult {
  return {
    title: "",
    description: "",
    insight: "",
    projection: "",
    cta_text: "",
    cta_url: "",
    sio_tag_name: "",
    sio_course_id: "",
    sio_community_id: "",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function QuizFormClient() {
  const t = useTranslations("quizForm");
  const router = useRouter();

  // ---- Manual form state ----
  const [title, setTitle] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [locale, setLocale] = useState("fr");
  const [addressForm, setAddressForm] = useState("tu");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [consentText, setConsentText] = useState("");

  // Capture config
  const [captureHeading, setCaptureHeading] = useState("");
  const [captureSubtitle, setCaptureSubtitle] = useState("");
  const [captureFirstName, setCaptureFirstName] = useState(true);
  const [captureLastName, setCaptureLastName] = useState(false);
  const [capturePhone, setCapturePhone] = useState(false);
  const [captureCountry, setCaptureCountry] = useState(false);

  // Virality
  const [viralityEnabled, setViralityEnabled] = useState(false);
  const [bonusDescription, setBonusDescription] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [sioShareTagName, setSioShareTagName] = useState("");

  // Questions & Results
  const [questions, setQuestions] = useState<QuizQuestion[]>([emptyQuestion()]);
  const [results, setResults] = useState<QuizResult[]>([emptyResult()]);

  // Saving
  const [saving, setSaving] = useState(false);

  // ---- AI generation state ----
  const [aiObjective, setAiObjective] = useState("");
  const [aiTarget, setAiTarget] = useState("");
  const [aiTone, setAiTone] = useState("");
  const [aiCta, setAiCta] = useState("");
  const [aiBonus, setAiBonus] = useState("");
  const [aiLocale, setAiLocale] = useState("fr");
  const [generating, setGenerating] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState("manual");

  // ---------------------------------------------------------------------------
  // Question helpers
  // ---------------------------------------------------------------------------

  function updateQuestion(idx: number, patch: Partial<QuizQuestion>) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, ...patch } : q))
    );
  }

  function updateOption(qIdx: number, oIdx: number, patch: Partial<QuizOption>) {
    setQuestions((prev) =>
      prev.map((q, qi) =>
        qi === qIdx
          ? {
              ...q,
              options: q.options.map((o, oi) =>
                oi === oIdx ? { ...o, ...patch } : o
              ),
            }
          : q
      )
    );
  }

  function addOption(qIdx: number) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIdx
          ? { ...q, options: [...q.options, { text: "", result_index: 0 }] }
          : q
      )
    );
  }

  function removeOption(qIdx: number, oIdx: number) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIdx
          ? { ...q, options: q.options.filter((_, oi) => oi !== oIdx) }
          : q
      )
    );
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  }

  function removeQuestion(idx: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  }

  // ---------------------------------------------------------------------------
  // Result helpers
  // ---------------------------------------------------------------------------

  function updateResult(idx: number, patch: Partial<QuizResult>) {
    setResults((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    );
  }

  function addResult() {
    setResults((prev) => [...prev, emptyResult()]);
  }

  function removeResult(idx: number) {
    setResults((prev) => prev.filter((_, i) => i !== idx));
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (!title.trim()) {
      toast.error(t("titleLabel") + " — " + "required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          introduction: introduction.trim() || null,
          locale,
          address_form: addressForm,
          cta_text: ctaText.trim() || null,
          cta_url: ctaUrl.trim() || null,
          privacy_url: privacyUrl.trim() || null,
          consent_text: consentText.trim() || null,
          capture_heading: captureHeading.trim() || null,
          capture_subtitle: captureSubtitle.trim() || null,
          capture_first_name: captureFirstName,
          capture_last_name: captureLastName,
          capture_phone: capturePhone,
          capture_country: captureCountry,
          virality_enabled: viralityEnabled,
          bonus_description: bonusDescription.trim() || null,
          share_message: shareMessage.trim() || null,
          sio_share_tag_name: sioShareTagName.trim() || null,
          questions: questions.map((q) => ({
            question_text: q.question_text,
            options: q.options,
          })),
          results: results.map((r) => ({
            title: r.title,
            description: r.description || null,
            insight: r.insight || null,
            projection: r.projection || null,
            cta_text: r.cta_text || null,
            cta_url: r.cta_url || null,
            sio_tag_name: r.sio_tag_name || null,
            sio_course_id: r.sio_course_id || null,
            sio_community_id: r.sio_community_id || null,
          })),
        }),
      });

      const data = await res.json();
      if (data.ok) {
        toast.success(t("saved"));
        router.push(`/quiz/${data.quizId}`);
      } else {
        toast.error(data.error || t("errSave"));
      }
    } catch {
      toast.error(t("errSave"));
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // AI Generation (SSE)
  // ---------------------------------------------------------------------------

  async function handleGenerate() {
    if (!aiObjective.trim()) {
      toast.error(t("aiObjectiveLabel") + " — required");
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective: aiObjective.trim(),
          target: aiTarget.trim(),
          tone: aiTone.trim(),
          cta: aiCta.trim(),
          bonus: aiBonus.trim(),
          locale: aiLocale,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || t("errSave"));
        setGenerating(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        toast.error(t("errSave"));
        setGenerating(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") break;

          try {
            const parsed = JSON.parse(payload);

            if (parsed.title) setTitle(parsed.title);
            if (parsed.introduction) setIntroduction(parsed.introduction);
            if (parsed.locale) setLocale(parsed.locale);
            if (parsed.address_form) setAddressForm(parsed.address_form);
            if (parsed.cta_text) setCtaText(parsed.cta_text);
            if (parsed.cta_url) setCtaUrl(parsed.cta_url);
            if (parsed.consent_text) setConsentText(parsed.consent_text);
            if (parsed.capture_heading) setCaptureHeading(parsed.capture_heading);
            if (parsed.capture_subtitle) setCaptureSubtitle(parsed.capture_subtitle);
            if (parsed.virality_enabled !== undefined) setViralityEnabled(parsed.virality_enabled);
            if (parsed.bonus_description) setBonusDescription(parsed.bonus_description);
            if (parsed.share_message) setShareMessage(parsed.share_message);

            if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
              setQuestions(
                parsed.questions.map(
                  (q: { question_text?: string; options?: QuizOption[] }) => ({
                    question_text: q.question_text ?? "",
                    options: Array.isArray(q.options)
                      ? q.options.map((o: QuizOption) => ({
                          text: o.text ?? "",
                          result_index: o.result_index ?? 0,
                        }))
                      : [
                          { text: "", result_index: 0 },
                          { text: "", result_index: 0 },
                        ],
                  })
                )
              );
            }

            if (Array.isArray(parsed.results) && parsed.results.length > 0) {
              setResults(
                parsed.results.map(
                  (r: Partial<QuizResult>) => ({
                    title: r.title ?? "",
                    description: r.description ?? "",
                    insight: r.insight ?? "",
                    projection: r.projection ?? "",
                    cta_text: r.cta_text ?? "",
                    cta_url: r.cta_url ?? "",
                    sio_tag_name: r.sio_tag_name ?? "",
                    sio_course_id: r.sio_course_id ?? "",
                    sio_community_id: r.sio_community_id ?? "",
                  })
                )
              );
            }
          } catch {
            // skip unparseable chunks
          }
        }
      }

      toast.success(t("aiGenerated"));
      setActiveTab("manual");
    } catch {
      toast.error(t("errSave"));
    } finally {
      setGenerating(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Locale options (for the quiz language selector)
  // ---------------------------------------------------------------------------

  const localeOptions = [
    { value: "fr", label: "Français" },
    { value: "en", label: "English" },
    { value: "es", label: "Español" },
    { value: "it", label: "Italiano" },
    { value: "ar", label: "العربية" },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="w-full border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Tiquiz
            </Link>
          </Button>
          <h1 className="text-xl font-bold">{t("createTitle")}</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 w-full sm:w-auto">
            <TabsTrigger value="manual">{t("tabManual")}</TabsTrigger>
            <TabsTrigger value="ai">
              <Sparkles className="h-4 w-4 mr-1" />
              {t("tabAI")}
            </TabsTrigger>
            <TabsTrigger value="import">{t("tabImport")}</TabsTrigger>
          </TabsList>

          {/* ================================================================
              MANUAL TAB
              ================================================================ */}
          <TabsContent value="manual">
            <div className="space-y-6">
              {/* ---- General settings ---- */}
              <Card>
                <CardHeader>
                  <CardTitle>{t("createTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Title */}
                  <div className="space-y-2">
                    <Label htmlFor="quiz-title">{t("titleLabel")}</Label>
                    <Input
                      id="quiz-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t("titlePlaceholder")}
                    />
                  </div>

                  {/* Introduction */}
                  <div className="space-y-2">
                    <Label htmlFor="quiz-intro">{t("introLabel")}</Label>
                    <Textarea
                      id="quiz-intro"
                      value={introduction}
                      onChange={(e) => setIntroduction(e.target.value)}
                      placeholder={t("introPlaceholder")}
                    />
                  </div>

                  {/* Locale + Address form */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="quiz-locale">{t("localeLabel")}</Label>
                      <select
                        id="quiz-locale"
                        value={locale}
                        onChange={(e) => setLocale(e.target.value)}
                        className="w-full border border-input rounded-lg px-2.5 py-1.5 text-sm bg-background"
                      >
                        {localeOptions.map((lo) => (
                          <option key={lo.value} value={lo.value}>
                            {lo.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="quiz-address">{t("addressFormLabel")}</Label>
                      <select
                        id="quiz-address"
                        value={addressForm}
                        onChange={(e) => setAddressForm(e.target.value)}
                        className="w-full border border-input rounded-lg px-2.5 py-1.5 text-sm bg-background"
                      >
                        <option value="tu">{t("tu")}</option>
                        <option value="vous">{t("vous")}</option>
                      </select>
                    </div>
                  </div>

                  {/* CTA text + URL */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="quiz-cta">{t("ctaLabel")}</Label>
                      <Input
                        id="quiz-cta"
                        value={ctaText}
                        onChange={(e) => setCtaText(e.target.value)}
                        placeholder={t("ctaPlaceholder")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quiz-cta-url">{t("ctaUrlLabel")}</Label>
                      <Input
                        id="quiz-cta-url"
                        value={ctaUrl}
                        onChange={(e) => setCtaUrl(e.target.value)}
                        placeholder={t("ctaUrlPlaceholder")}
                      />
                    </div>
                  </div>

                  {/* Privacy URL */}
                  <div className="space-y-2">
                    <Label htmlFor="quiz-privacy">{t("privacyUrlLabel")}</Label>
                    <Input
                      id="quiz-privacy"
                      value={privacyUrl}
                      onChange={(e) => setPrivacyUrl(e.target.value)}
                      placeholder="https://…"
                    />
                  </div>

                  {/* Consent text */}
                  <div className="space-y-2">
                    <Label htmlFor="quiz-consent">{t("consentLabel")}</Label>
                    <Input
                      id="quiz-consent"
                      value={consentText}
                      onChange={(e) => setConsentText(e.target.value)}
                      placeholder={t("consentPlaceholder")}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* ---- Capture config ---- */}
              <Card>
                <CardHeader>
                  <CardTitle>{t("captureHeadingLabel")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="capture-heading">{t("captureHeadingLabel")}</Label>
                    <Input
                      id="capture-heading"
                      value={captureHeading}
                      onChange={(e) => setCaptureHeading(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="capture-subtitle">{t("captureSubtitleLabel")}</Label>
                    <Input
                      id="capture-subtitle"
                      value={captureSubtitle}
                      onChange={(e) => setCaptureSubtitle(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={captureFirstName}
                        onChange={(e) => setCaptureFirstName(e.target.checked)}
                        className="h-4 w-4 rounded border-input"
                      />
                      {t("captureFirstName")}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={captureLastName}
                        onChange={(e) => setCaptureLastName(e.target.checked)}
                        className="h-4 w-4 rounded border-input"
                      />
                      {t("captureLastName")}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={capturePhone}
                        onChange={(e) => setCapturePhone(e.target.checked)}
                        className="h-4 w-4 rounded border-input"
                      />
                      {t("capturePhone")}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={captureCountry}
                        onChange={(e) => setCaptureCountry(e.target.checked)}
                        className="h-4 w-4 rounded border-input"
                      />
                      {t("captureCountry")}
                    </label>
                  </div>
                </CardContent>
              </Card>

              {/* ---- Virality ---- */}
              <Card>
                <CardHeader>
                  <CardTitle>{t("viralityLabel")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={viralityEnabled}
                      onChange={(e) => setViralityEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span>
                      {t("viralityLabel")}
                      <span className="text-muted-foreground ml-2">
                        — {t("viralityDesc")}
                      </span>
                    </span>
                  </label>

                  {viralityEnabled && (
                    <div className="space-y-4 pl-6 border-l-2 border-border">
                      <div className="space-y-2">
                        <Label htmlFor="bonus-desc">{t("bonusLabel")}</Label>
                        <Input
                          id="bonus-desc"
                          value={bonusDescription}
                          onChange={(e) => setBonusDescription(e.target.value)}
                          placeholder={t("bonusPlaceholder")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="share-msg">{t("shareMessageLabel")}</Label>
                        <Textarea
                          id="share-msg"
                          value={shareMessage}
                          onChange={(e) => setShareMessage(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="share-tag">{t("shareTagLabel")}</Label>
                        <Input
                          id="share-tag"
                          value={sioShareTagName}
                          onChange={(e) => setSioShareTagName(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ---- Questions ---- */}
              <Card>
                <CardHeader>
                  <CardTitle>{t("questionsTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {questions.map((question, qIdx) => (
                    <div
                      key={qIdx}
                      className="space-y-3 p-4 rounded-lg border border-border bg-muted/30"
                    >
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">
                          {t("questionLabel", { n: qIdx + 1 })}
                        </Label>
                        {questions.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeQuestion(qIdx)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive mr-1" />
                            {t("removeQuestion")}
                          </Button>
                        )}
                      </div>

                      <Input
                        value={question.question_text}
                        onChange={(e) =>
                          updateQuestion(qIdx, {
                            question_text: e.target.value,
                          })
                        }
                        placeholder={t("questionPlaceholder")}
                      />

                      <div className="space-y-2 pl-4">
                        {question.options.map((option, oIdx) => (
                          <div key={oIdx} className="flex items-center gap-2">
                            <Input
                              className="flex-1"
                              value={option.text}
                              onChange={(e) =>
                                updateOption(qIdx, oIdx, {
                                  text: e.target.value,
                                })
                              }
                              placeholder={t("optionPlaceholder", {
                                n: oIdx + 1,
                              })}
                            />

                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {t("mapsToResult")}
                              </span>
                              <select
                                value={option.result_index}
                                onChange={(e) =>
                                  updateOption(qIdx, oIdx, {
                                    result_index: Number(e.target.value),
                                  })
                                }
                                className="border border-input rounded-lg px-2 py-1 text-sm bg-background w-16"
                              >
                                {results.map((_, rIdx) => (
                                  <option key={rIdx} value={rIdx}>
                                    {rIdx + 1}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {question.options.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeOption(qIdx, oIdx)}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        ))}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addOption(qIdx)}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          {t("addOption")}
                        </Button>
                      </div>
                    </div>
                  ))}

                  <Button variant="outline" onClick={addQuestion}>
                    <Plus className="h-4 w-4 mr-1" />
                    {t("addQuestion")}
                  </Button>
                </CardContent>
              </Card>

              {/* ---- Results ---- */}
              <Card>
                <CardHeader>
                  <CardTitle>{t("resultsTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {results.map((result, rIdx) => (
                    <div
                      key={rIdx}
                      className="space-y-3 p-4 rounded-lg border border-border bg-muted/30"
                    >
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">
                          {t("resultLabel", { n: rIdx + 1 })}
                        </Label>
                        {results.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeResult(rIdx)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive mr-1" />
                            {t("removeQuestion")}
                          </Button>
                        )}
                      </div>

                      {/* Result title */}
                      <div className="space-y-2">
                        <Label>{t("resultTitleLabel")}</Label>
                        <Input
                          value={result.title}
                          onChange={(e) =>
                            updateResult(rIdx, { title: e.target.value })
                          }
                          placeholder={t("resultTitlePlaceholder")}
                        />
                      </div>

                      {/* Description */}
                      <div className="space-y-2">
                        <Label>{t("resultDescLabel")}</Label>
                        <Textarea
                          value={result.description}
                          onChange={(e) =>
                            updateResult(rIdx, {
                              description: e.target.value,
                            })
                          }
                        />
                      </div>

                      {/* Insight */}
                      <div className="space-y-2">
                        <Label>{t("resultInsightLabel")}</Label>
                        <Textarea
                          value={result.insight}
                          onChange={(e) =>
                            updateResult(rIdx, { insight: e.target.value })
                          }
                        />
                      </div>

                      {/* Projection */}
                      <div className="space-y-2">
                        <Label>{t("resultProjectionLabel")}</Label>
                        <Textarea
                          value={result.projection}
                          onChange={(e) =>
                            updateResult(rIdx, {
                              projection: e.target.value,
                            })
                          }
                        />
                      </div>

                      {/* CTA text + URL */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{t("resultCtaLabel")}</Label>
                          <Input
                            value={result.cta_text}
                            onChange={(e) =>
                              updateResult(rIdx, {
                                cta_text: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("resultCtaUrlLabel")}</Label>
                          <Input
                            value={result.cta_url}
                            onChange={(e) =>
                              updateResult(rIdx, {
                                cta_url: e.target.value,
                              })
                            }
                            placeholder="https://…"
                          />
                        </div>
                      </div>

                      {/* SIO fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>{t("sioTagLabel")}</Label>
                          <Input
                            value={result.sio_tag_name}
                            onChange={(e) =>
                              updateResult(rIdx, {
                                sio_tag_name: e.target.value,
                              })
                            }
                            placeholder={t("sioTagPlaceholder")}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("sioCourseLabel")}</Label>
                          <Input
                            value={result.sio_course_id}
                            onChange={(e) =>
                              updateResult(rIdx, {
                                sio_course_id: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("sioCommunityLabel")}</Label>
                          <Input
                            value={result.sio_community_id}
                            onChange={(e) =>
                              updateResult(rIdx, {
                                sio_community_id: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button variant="outline" onClick={addResult}>
                    <Plus className="h-4 w-4 mr-1" />
                    {t("addResult")}
                  </Button>
                </CardContent>
              </Card>

              {/* ---- Save button ---- */}
              <Button
                className="w-full"
                onClick={handleSave}
                disabled={saving}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {saving ? t("saving") : t("createTitle")}
              </Button>
            </div>
          </TabsContent>

          {/* ================================================================
              AI TAB
              ================================================================ */}
          <TabsContent value="ai">
            <Card>
              <CardHeader>
                <CardTitle>
                  <Sparkles className="h-5 w-5 inline-block mr-2" />
                  {t("tabAI")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Objective */}
                <div className="space-y-2">
                  <Label htmlFor="ai-objective">{t("aiObjectiveLabel")}</Label>
                  <Textarea
                    id="ai-objective"
                    value={aiObjective}
                    onChange={(e) => setAiObjective(e.target.value)}
                    placeholder={t("aiObjectivePlaceholder")}
                  />
                </div>

                {/* Target audience */}
                <div className="space-y-2">
                  <Label htmlFor="ai-target">{t("aiTargetLabel")}</Label>
                  <Input
                    id="ai-target"
                    value={aiTarget}
                    onChange={(e) => setAiTarget(e.target.value)}
                    placeholder={t("aiTargetPlaceholder")}
                  />
                </div>

                {/* Tone */}
                <div className="space-y-2">
                  <Label htmlFor="ai-tone">{t("aiToneLabel")}</Label>
                  <Input
                    id="ai-tone"
                    value={aiTone}
                    onChange={(e) => setAiTone(e.target.value)}
                    placeholder={t("aiTonePlaceholder")}
                  />
                </div>

                {/* CTA */}
                <div className="space-y-2">
                  <Label htmlFor="ai-cta">{t("aiCtaLabel")}</Label>
                  <Input
                    id="ai-cta"
                    value={aiCta}
                    onChange={(e) => setAiCta(e.target.value)}
                    placeholder={t("aiCtaPlaceholder")}
                  />
                </div>

                {/* Bonus */}
                <div className="space-y-2">
                  <Label htmlFor="ai-bonus">{t("aiBonusLabel")}</Label>
                  <Input
                    id="ai-bonus"
                    value={aiBonus}
                    onChange={(e) => setAiBonus(e.target.value)}
                    placeholder={t("aiBonusPlaceholder")}
                  />
                </div>

                {/* Locale */}
                <div className="space-y-2">
                  <Label htmlFor="ai-locale">{t("localeLabel")}</Label>
                  <select
                    id="ai-locale"
                    value={aiLocale}
                    onChange={(e) => setAiLocale(e.target.value)}
                    className="w-full border border-input rounded-lg px-2.5 py-1.5 text-sm bg-background"
                  >
                    {localeOptions.map((lo) => (
                      <option key={lo.value} value={lo.value}>
                        {lo.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Generate button */}
                <Button
                  className="w-full"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t("aiGenerating")}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      {t("aiGenerate")}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================================================================
              IMPORT TAB
              ================================================================ */}
          <TabsContent value="import">
            <Card>
              <CardHeader>
                <CardTitle>{t("tabImport")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="py-12 text-center text-muted-foreground">
                  <p className="text-lg font-medium">Coming soon</p>
                  <p className="mt-1 text-sm">
                    This feature is not yet available.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
