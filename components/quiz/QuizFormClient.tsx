"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, ArrowLeft, Loader2, Sparkles, FileText, Upload, Settings2, MessageSquare, Award, Users, Share2, Zap, ChevronRight, ChevronDown, GripVertical, Save, Globe, Monitor, BarChart3, TrendingUp } from "lucide-react";
import SortableQuestionList from "@/components/quiz/SortableQuestionList";
import QuizShareSettings from "@/components/quiz/QuizShareSettings";
import QuizPreview from "@/components/quiz/QuizPreview";
import SioSelectors from "@/components/quiz/SioSelectors";
import { AIGeneratingOverlay } from "@/components/ui/ai-generating-overlay";
import { QUIZ_OBJECTIVES } from "@/lib/prompts/quiz/system";
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
      { text: "", result_index: 1 },
      { text: "", result_index: 2 },
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
// Objectives dropdown with checkboxes
// ---------------------------------------------------------------------------

function ObjectivesDropdown({
  objectives,
  onChange,
  label,
  hint,
}: {
  objectives: string[];
  onChange: (v: string[]) => void;
  label: string;
  hint: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selectedLabels = QUIZ_OBJECTIVES
    .filter((o) => objectives.includes(o.value))
    .map((o) => o.labelFr);

  return (
    <div className="space-y-1.5" ref={ref}>
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between border border-input rounded-lg px-3 py-2 text-sm bg-background text-left hover:border-primary/40 transition-colors"
      >
        <span className={selectedLabels.length > 0 ? "text-foreground" : "text-muted-foreground"}>
          {selectedLabels.length > 0 ? selectedLabels.join(", ") : "— Choisis un ou plusieurs objectifs —"}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border border-border rounded-xl bg-background shadow-lg max-h-80 overflow-y-auto p-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {QUIZ_OBJECTIVES.map((o) => {
              const checked = objectives.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() =>
                    onChange(
                      checked
                        ? objectives.filter((v) => v !== o.value)
                        : [...objectives, o.value]
                    )
                  }
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                    checked ? "bg-primary/5" : "hover:bg-muted"
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                    checked ? "bg-primary border-primary" : "border-muted-foreground/30"
                  }`}>
                    {checked && (
                      <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs font-medium leading-tight">{o.labelFr}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
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

  // Saving & auto-save
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnsavedChanges = useRef(false);

  // Auto-save as draft after 3s of inactivity
  const triggerAutoSave = useCallback(() => {
    if (!title.trim()) return; // don't save empty quizzes
    hasUnsavedChanges.current = true;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        const payload = {
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
        };

        if (draftId) {
          // Update existing draft
          await fetch(`/api/quiz/${draftId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } else {
          // Create new draft
          const res = await fetch("/api/quiz", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (data.ok && data.quizId) {
            setDraftId(data.quizId);
          }
        }
        hasUnsavedChanges.current = false;
      } catch {
        // silent — don't interrupt user
      }
    }, 3000);
  }, [title, introduction, locale, addressForm, ctaText, ctaUrl, privacyUrl, consentText,
      captureHeading, captureSubtitle, captureFirstName, captureLastName, capturePhone,
      captureCountry, viralityEnabled, bonusDescription, shareMessage, sioShareTagName,
      questions, results, draftId]);

  // ---- AI generation state ----
  const [aiObjectives, setAiObjectives] = useState<string[]>([]);
  const [aiTarget, setAiTarget] = useState("");
  const [aiTargetFromProfile, setAiTargetFromProfile] = useState("");
  const [aiCta, setAiCta] = useState("");
  const [aiBonus, setAiBonus] = useState("");
  const [aiLocale, setAiLocale] = useState("fr");
  const [aiFormat, setAiFormat] = useState<"short" | "long">("short");
  const [aiSegmentation, setAiSegmentation] = useState<"level" | "profile">("profile");
  const [generating, setGenerating] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState("manual");

  // Trigger auto-save on form changes (only when on manual tab)
  useEffect(() => {
    if (activeTab === "manual" && title.trim()) {
      triggerAutoSave();
    }
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [title, introduction, questions, results, activeTab, triggerAutoSave]);

  // Pre-fill target audience from user profile
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.profile) {
          const ta = data.profile.target_audience ?? "";
          setAiTargetFromProfile(ta);
          if (ta && !aiTarget) setAiTarget(ta);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const payload = {
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
      };

      let res: Response;
      if (draftId) {
        res = await fetch(`/api/quiz/${draftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (data.ok) {
        hasUnsavedChanges.current = false;
        toast.success(t("saved"));
        router.push(`/quiz/${draftId || data.quizId}`);
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

  // Helper: populate form state from a quiz object (used by AI gen + import)
  function populateFromQuiz(quiz: Record<string, unknown>) {
    if (quiz.title) setTitle(String(quiz.title));
    if (quiz.introduction) setIntroduction(String(quiz.introduction));
    if (quiz.locale) setLocale(String(quiz.locale));
    if (quiz.address_form) setAddressForm(String(quiz.address_form));
    if (quiz.cta_text) setCtaText(String(quiz.cta_text));
    if (quiz.cta_url) setCtaUrl(String(quiz.cta_url));
    if (quiz.consent_text) setConsentText(String(quiz.consent_text));
    if (quiz.capture_heading) setCaptureHeading(String(quiz.capture_heading));
    if (quiz.capture_subtitle) setCaptureSubtitle(String(quiz.capture_subtitle));
    if (quiz.virality_enabled !== undefined) setViralityEnabled(Boolean(quiz.virality_enabled));
    if (quiz.bonus_description) setBonusDescription(String(quiz.bonus_description));
    if (quiz.share_message) setShareMessage(String(quiz.share_message));

    if (Array.isArray(quiz.questions) && quiz.questions.length > 0) {
      setQuestions(
        quiz.questions.map(
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

    if (Array.isArray(quiz.results) && quiz.results.length > 0) {
      setResults(
        quiz.results.map(
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
  }

  async function handleGenerate() {
    if (aiObjectives.length === 0) {
      toast.error(t("aiObjectiveLabel") + " — required");
      return;
    }
    if (!aiTarget.trim()) {
      toast.error(t("aiTargetLabel") + " — required");
      return;
    }

    setGenerating(true);
    let quizReceived = false;
    let errorShown = false;
    let receivedQuiz: Record<string, unknown> | null = null;

    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective: aiObjectives.join(", "),
          target: aiTarget.trim(),
          cta: aiCta.trim(),
          bonus: aiBonus.trim(),
          locale: aiLocale,
          format: aiFormat,
          segmentation: aiSegmentation,
          questionCount: aiFormat === "short" ? 4 : 8,
        }),
      });

      if (!res.ok) {
        // Non-SSE error (400, 401, 500 before stream starts)
        let errMsg = t("errSave");
        try {
          const err = await res.json();
          if (err?.error) errMsg = err.error;
        } catch { /* response wasn't JSON */ }
        toast.error(errMsg);
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
      let currentEvent = "";

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
              populateFromQuiz(parsed.quiz as Record<string, unknown>);
              quizReceived = true;
              receivedQuiz = parsed.quiz as Record<string, unknown>;
            } else if (currentEvent === "error" && !errorShown) {
              toast.error(parsed.error || t("errSave"));
              errorShown = true;
            }
          } catch {
            // skip unparseable SSE chunks
          }

          currentEvent = "";
        }
      }

      if (quizReceived && receivedQuiz) {
        toast.success(t("aiGenerated"));
        // Auto-save the generated quiz and redirect to the WYSIWYG editor
        try {
          const savePayload = {
            title: String(receivedQuiz.title || ""),
            introduction: receivedQuiz.introduction ? String(receivedQuiz.introduction) : null,
            locale: aiLocale,
            address_form: "tu",
            cta_text: receivedQuiz.cta_text ? String(receivedQuiz.cta_text) : aiCta || null,
            virality_enabled: Boolean(receivedQuiz.virality_enabled),
            bonus_description: receivedQuiz.bonus_description ? String(receivedQuiz.bonus_description) : null,
            share_message: receivedQuiz.share_message ? String(receivedQuiz.share_message) : null,
            questions: Array.isArray(receivedQuiz.questions) ? receivedQuiz.questions : [],
            results: Array.isArray(receivedQuiz.results) ? receivedQuiz.results : [],
          };
          const saveRes = await fetch("/api/quiz", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(savePayload),
          });
          const saveData = await saveRes.json();
          if (saveData.ok && saveData.quizId) {
            router.push(`/quiz/${saveData.quizId}`);
            return;
          }
        } catch { /* fallback to manual tab */ }
        setActiveTab("manual");
      } else if (!errorShown) {
        toast.error(t("aiGenerateError"));
      }
    } catch (e) {
      if (!errorShown) {
        toast.error(t("aiGenerateError"));
      }
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
  // Step navigation (Typeform-style)
  // ---------------------------------------------------------------------------

  const [step, setStep] = useState(0);

  // OG image + status (for share settings)
  const [ogImageUrl, setOgImageUrl] = useState("");
  const [quizStatus, setQuizStatus] = useState("draft");

  const STEPS = [
    { key: "general", icon: Settings2, label: "Infos générales" },
    { key: "questions", icon: MessageSquare, label: "Questions" },
    { key: "results", icon: Award, label: "Résultats" },
    { key: "capture", icon: Users, label: "Capture" },
    { key: "virality", icon: Share2, label: "Viralité" },
    { key: "share", icon: Globe, label: "Partage" },
  ];

  // Import file handling
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  async function handleImportFile() {
    if (!importFile) return;
    setImporting(true);
    try {
      const text = await importFile.text();
      // Send to AI to parse into quiz format
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "import",
          content: text.slice(0, 10000), // limit to 10k chars
          locale: aiLocale,
        }),
      });

      if (!res.ok) {
        toast.error("Erreur lors de l'import");
        setImporting(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setImporting(false); return; }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

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
              populateFromQuiz(parsed.quiz as Record<string, unknown>);
            } else if (currentEvent === "error") {
              toast.error(parsed.error || "Erreur lors de l'import");
            }
          } catch { /* skip */ }
          currentEvent = "";
        }
      }

      toast.success("Quiz importé avec succès !");
      setActiveTab("manual");
    } catch {
      toast.error("Erreur lors de l'import");
    } finally {
      setImporting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Top bar: tabs + save button */}
      <div className="flex items-center justify-between gap-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="manual" className="gap-1.5">
              <FileText className="h-4 w-4" />
              {t("tabManual")}
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5">
              <Sparkles className="h-4 w-4" />
              {t("tabAI")}
            </TabsTrigger>
            <TabsTrigger value="import" className="gap-1.5">
              <Upload className="h-4 w-4" />
              {t("tabImport")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button onClick={handleSave} disabled={saving} className="shrink-0">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {saving ? t("saving") : "Enregistrer"}
        </Button>
      </div>

      {/* ================================================================
          MANUAL TAB — Step sidebar + content
          ================================================================ */}
      {activeTab === "manual" && (
        <div className="flex gap-5">
          {/* Step sidebar */}
          <nav className="hidden md:flex flex-col gap-0.5 w-44 shrink-0 sticky top-20 self-start">
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                onClick={() => setStep(i)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                  step === i
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className="truncate">{s.label}</span>
              </button>
            ))}
          </nav>

          {/* Step content */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Mobile step selector */}
            <div className="md:hidden">
              <select
                value={step}
                onChange={(e) => setStep(Number(e.target.value))}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
              >
                {STEPS.map((s, i) => (
                  <option key={s.key} value={i}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Step 0: General */}
            {step === 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("createTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="quiz-title">{t("titleLabel")}</Label>
                    <Input id="quiz-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quiz-intro">{t("introLabel")}</Label>
                    <Textarea id="quiz-intro" value={introduction} onChange={(e) => setIntroduction(e.target.value)} placeholder={t("introPlaceholder")} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("localeLabel")}</Label>
                      <select value={locale} onChange={(e) => setLocale(e.target.value)} className="w-full border border-input rounded-lg px-2.5 py-1.5 text-sm bg-background">
                        {localeOptions.map((lo) => (<option key={lo.value} value={lo.value}>{lo.label}</option>))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("addressFormLabel")}</Label>
                      <select value={addressForm} onChange={(e) => setAddressForm(e.target.value)} className="w-full border border-input rounded-lg px-2.5 py-1.5 text-sm bg-background">
                        <option value="tu">{t("tu")}</option>
                        <option value="vous">{t("vous")}</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("ctaLabel")}</Label>
                      <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder={t("ctaPlaceholder")} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("ctaUrlLabel")}</Label>
                      <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder={t("ctaUrlPlaceholder")} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("privacyUrlLabel")}</Label>
                    <Input value={privacyUrl} onChange={(e) => setPrivacyUrl(e.target.value)} placeholder="https://…" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("consentLabel")}</Label>
                    <Input value={consentText} onChange={(e) => setConsentText(e.target.value)} placeholder={t("consentPlaceholder")} />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 1: Questions */}
            {step === 1 && (
              <SortableQuestionList
                questions={questions}
                resultsCount={results.length}
                onReorder={setQuestions}
                onUpdate={updateQuestion}
                onUpdateOption={updateOption}
                onAddOption={addOption}
                onRemoveOption={removeOption}
                onAdd={addQuestion}
                onRemove={removeQuestion}
                t={t}
              />
            )}

            {/* Step 2: Results */}
            {step === 2 && (
              <Card>
                <CardHeader><CardTitle>{t("resultsTitle")}</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  {results.map((result, rIdx) => (
                    <div key={rIdx} className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">{t("resultLabel", { n: rIdx + 1 })}</Label>
                        {results.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removeResult(rIdx)}>
                            <Trash2 className="h-4 w-4 text-destructive mr-1" />{t("removeQuestion")}
                          </Button>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>{t("resultTitleLabel")}</Label>
                        <Input value={result.title} onChange={(e) => updateResult(rIdx, { title: e.target.value })} placeholder={t("resultTitlePlaceholder")} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("resultDescLabel")}</Label>
                        <Textarea value={result.description} onChange={(e) => updateResult(rIdx, { description: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("resultInsightLabel")}</Label>
                        <Textarea value={result.insight} onChange={(e) => updateResult(rIdx, { insight: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("resultProjectionLabel")}</Label>
                        <Textarea value={result.projection} onChange={(e) => updateResult(rIdx, { projection: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{t("resultCtaLabel")}</Label>
                          <Input value={result.cta_text} onChange={(e) => updateResult(rIdx, { cta_text: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("resultCtaUrlLabel")}</Label>
                          <Input value={result.cta_url} onChange={(e) => updateResult(rIdx, { cta_url: e.target.value })} placeholder="https://…" />
                        </div>
                      </div>
                      <SioSelectors
                        tagValue={result.sio_tag_name}
                        courseValue={result.sio_course_id}
                        communityValue={result.sio_community_id}
                        onTagChange={(v) => updateResult(rIdx, { sio_tag_name: v })}
                        onCourseChange={(v) => updateResult(rIdx, { sio_course_id: v })}
                        onCommunityChange={(v) => updateResult(rIdx, { sio_community_id: v })}
                      />
                    </div>
                  ))}
                  <Button variant="outline" onClick={addResult}><Plus className="h-4 w-4 mr-1" />{t("addResult")}</Button>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Capture */}
            {step === 3 && (
              <Card>
                <CardHeader><CardTitle>{t("captureHeadingLabel")}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("captureHeadingLabel")}</Label>
                    <Input value={captureHeading} onChange={(e) => setCaptureHeading(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("captureSubtitleLabel")}</Label>
                    <Input value={captureSubtitle} onChange={(e) => setCaptureSubtitle(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: t("captureFirstName"), checked: captureFirstName, set: setCaptureFirstName },
                      { label: t("captureLastName"), checked: captureLastName, set: setCaptureLastName },
                      { label: t("capturePhone"), checked: capturePhone, set: setCapturePhone },
                      { label: t("captureCountry"), checked: captureCountry, set: setCaptureCountry },
                    ].map(({ label, checked, set }) => (
                      <label key={label} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} className="h-4 w-4 rounded border-input" />
                        {label}
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: Virality */}
            {step === 4 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Share2 className="h-5 w-5 text-primary" />Bonus de viralité</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                    <input type="checkbox" checked={viralityEnabled} onChange={(e) => setViralityEnabled(e.target.checked)} className="h-5 w-5 rounded border-input accent-primary" />
                    <div>
                      <span className="font-medium">Activer le bonus de viralité</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Les visiteurs pourront partager le quiz pour débloquer un bonus</p>
                    </div>
                  </label>
                  {viralityEnabled && (
                    <div className="space-y-4 pl-5 border-l-2 border-primary/20">
                      <div className="space-y-2">
                        <Label>Description du bonus</Label>
                        <Input value={bonusDescription} onChange={(e) => setBonusDescription(e.target.value)} placeholder="Ex : Reçois notre guide PDF exclusif" />
                      </div>
                      <div className="space-y-2">
                        <Label>Message de partage</Label>
                        <Textarea value={shareMessage} onChange={(e) => setShareMessage(e.target.value)} placeholder="Ex : J'ai découvert mon profil avec ce quiz !" />
                      </div>
                      <div className="space-y-2">
                        <Label>Tag Systeme.io (partage)</Label>
                        <Input value={sioShareTagName} onChange={(e) => setSioShareTagName(e.target.value)} placeholder="Ex : quiz-partagé" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 5: Share */}
            {step === 5 && (
              <QuizShareSettings
                quizId=""
                status={quizStatus}
                ogImageUrl={ogImageUrl}
                onStatusChange={setQuizStatus}
                onOgImageChange={setOgImageUrl}
              />
            )}

            {/* Prev / Next */}
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
                <ArrowLeft className="h-4 w-4 mr-2" />Précédent
              </Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={() => setStep(step + 1)}>Suivant<ChevronRight className="h-4 w-4 ml-2" /></Button>
              ) : (
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? t("saving") : "Enregistrer le quiz"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
          AI TAB
          ================================================================ */}
      {activeTab === "ai" && (
        generating ? (
          <AIGeneratingOverlay />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />{t("tabAI")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* 1. Objectives — compact dropdown with checkboxes */}
              <ObjectivesDropdown
                objectives={aiObjectives}
                onChange={setAiObjectives}
                label={t("aiObjectiveLabel")}
                hint={t("aiObjectiveMulti")}
              />

              {/* 2. Format (short/long) */}
              <div className="space-y-2">
                <Label>{t("aiFormatLabel")}</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAiFormat("short")}
                    className={`p-3 rounded-xl border text-left transition-all ${aiFormat === "short" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40"}`}
                  >
                    <Zap className="h-4 w-4 text-amber-500 mb-1" />
                    <p className="font-medium text-sm">{t("aiFormatShort")}</p>
                    <p className="text-xs text-muted-foreground">{t("aiFormatShortDesc")}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiFormat("long")}
                    className={`p-3 rounded-xl border text-left transition-all ${aiFormat === "long" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40"}`}
                  >
                    <BarChart3 className="h-4 w-4 text-primary mb-1" />
                    <p className="font-medium text-sm">{t("aiFormatLong")}</p>
                    <p className="text-xs text-muted-foreground">{t("aiFormatLongDesc")}</p>
                  </button>
                </div>
              </div>

              {/* 3. Target — pre-filled from profile if available */}
              <div className="space-y-2">
                <Label>{t("aiTargetLabel")}</Label>
                <Textarea value={aiTarget} onChange={(e) => setAiTarget(e.target.value)} placeholder={t("aiTargetPlaceholder")} className="h-16" />
                {aiTarget && aiTarget !== aiTargetFromProfile && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      fetch("/api/profile", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ target_audience: aiTarget }),
                      }).then(() => {
                        setAiTargetFromProfile(aiTarget);
                        toast.success(t("targetSaved"));
                      });
                    }}
                  >
                    {t("saveAsDefault")}
                  </button>
                )}
              </div>

              {/* 4. Segmentation */}
              <div className="space-y-2">
                <Label>{t("aiSegmentationLabel")}</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAiSegmentation("profile")}
                    className={`p-3 rounded-xl border text-left transition-all ${aiSegmentation === "profile" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40"}`}
                  >
                    <Users className="h-4 w-4 text-violet-500 mb-1" />
                    <p className="font-medium text-sm">{t("aiSegProfile")}</p>
                    <p className="text-xs text-muted-foreground">{t("aiSegProfileDesc")}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiSegmentation("level")}
                    className={`p-3 rounded-xl border text-left transition-all ${aiSegmentation === "level" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40"}`}
                  >
                    <TrendingUp className="h-4 w-4 text-emerald-500 mb-1" />
                    <p className="font-medium text-sm">{t("aiSegLevel")}</p>
                    <p className="text-xs text-muted-foreground">{t("aiSegLevelDesc")}</p>
                  </button>
                </div>
              </div>

              {/* 5. CTA */}
              <div className="space-y-2">
                <Label>{t("aiCtaLabel")}</Label>
                <Input value={aiCta} onChange={(e) => setAiCta(e.target.value)} placeholder={t("aiCtaPlaceholder")} />
              </div>

              {/* 6. Bonus */}
              <div className="space-y-2">
                <Label>{t("aiBonusLabel")}</Label>
                <Input value={aiBonus} onChange={(e) => setAiBonus(e.target.value)} placeholder={t("aiBonusPlaceholder")} />
              </div>

              {/* 7. Locale */}
              <div className="space-y-2">
                <Label>{t("localeLabel")}</Label>
                <select value={aiLocale} onChange={(e) => setAiLocale(e.target.value)} className="w-full border border-input rounded-lg px-2.5 py-1.5 text-sm bg-background">
                  {localeOptions.map((lo) => (<option key={lo.value} value={lo.value}>{lo.label}</option>))}
                </select>
              </div>

              <Button className="w-full rounded-full" onClick={handleGenerate} disabled={generating}>
                <Sparkles className="h-4 w-4 mr-2" />{t("aiGenerate")}
              </Button>
            </CardContent>
          </Card>
        )
      )}

      {/* ================================================================
          IMPORT TAB
          ================================================================ */}
      {activeTab === "import" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-primary" />Importer un quiz</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Importe un document (TXT, PDF ou DOCX) contenant tes questions et réponses.
            </p>
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="font-medium mb-2">Glisse ton fichier ici ou clique pour sélectionner</p>
              <p className="text-xs text-muted-foreground mb-4">TXT, PDF, DOCX — max 10 000 caractères</p>
              <input type="file" accept=".txt,.pdf,.docx" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} className="hidden" id="import-file" />
              <Button variant="outline" asChild>
                <label htmlFor="import-file" className="cursor-pointer">Sélectionner un fichier</label>
              </Button>
            </div>
            {importFile && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{importFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(importFile.size / 1024).toFixed(1)} Ko</p>
                  </div>
                </div>
                <Button onClick={handleImportFile} disabled={importing}>
                  {importing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Import en cours...</> : <><Sparkles className="h-4 w-4 mr-2" />Analyser et importer</>}
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <Label>Langue du quiz importé</Label>
              <select value={aiLocale} onChange={(e) => setAiLocale(e.target.value)} className="w-full border border-input rounded-lg px-2.5 py-1.5 text-sm bg-background">
                {localeOptions.map((lo) => (<option key={lo.value} value={lo.value}>{lo.label}</option>))}
              </select>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
