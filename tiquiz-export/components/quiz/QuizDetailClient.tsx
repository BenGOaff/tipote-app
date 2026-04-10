"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Copy,
  Eye,
  Play,
  CheckCircle,
  Users,
  Share2,
  Download,
  RefreshCw,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuizOption = {
  text: string;
  result_index: number;
};

type QuizQuestion = {
  id?: string;
  question_text: string;
  options: QuizOption[];
  sort_order: number;
};

type QuizResult = {
  id?: string;
  title: string;
  description: string | null;
  insight: string | null;
  projection: string | null;
  cta_text: string | null;
  cta_url: string | null;
  sio_tag_name: string | null;
  sio_course_id: string | null;
  sio_community_id: string | null;
  sort_order: number;
};

type QuizLead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  country: string | null;
  result_title: string | null;
  has_shared: boolean;
  bonus_unlocked: boolean;
  created_at: string;
};

type QuizData = {
  id: string;
  title: string;
  introduction: string | null;
  cta_text: string | null;
  cta_url: string | null;
  privacy_url: string | null;
  consent_text: string | null;
  capture_heading: string | null;
  capture_subtitle: string | null;
  capture_first_name: boolean | null;
  capture_last_name: boolean | null;
  capture_phone: boolean | null;
  capture_country: boolean | null;
  virality_enabled: boolean;
  bonus_description: string | null;
  share_message: string | null;
  locale: string | null;
  sio_share_tag_name: string | null;
  status: string;
  views_count: number;
  starts_count: number;
  completions_count: number;
  shares_count: number;
  questions: QuizQuestion[];
  results: QuizResult[];
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface QuizDetailClientProps {
  quizId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function QuizDetailClient({ quizId }: QuizDetailClientProps) {
  const t = useTranslations("quizDetail");
  const tf = useTranslations("quizForm");
  const router = useRouter();

  // ---- Loading / data state -----------------------------------------------
  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [leads, setLeads] = useState<QuizLead[]>([]);

  // ---- Edit form state ----------------------------------------------------
  const [title, setTitle] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [consentText, setConsentText] = useState("");
  const [captureHeading, setCaptureHeading] = useState("");
  const [captureSubtitle, setCaptureSubtitle] = useState("");
  const [captureFirstName, setCaptureFirstName] = useState(false);
  const [captureLastName, setCaptureLastName] = useState(false);
  const [capturePhone, setCapturePhone] = useState(false);
  const [captureCountry, setCaptureCountry] = useState(false);
  const [viralityEnabled, setViralityEnabled] = useState(false);
  const [bonusDescription, setBonusDescription] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [locale, setLocale] = useState("");
  const [sioShareTagName, setSioShareTagName] = useState("");
  const [status, setStatus] = useState("draft");

  const [editQuestions, setEditQuestions] = useState<QuizQuestion[]>([]);
  const [editResults, setEditResults] = useState<QuizResult[]>([]);

  // ---- Action state -------------------------------------------------------
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncTagName, setSyncTagName] = useState("");
  const [showSyncPrompt, setShowSyncPrompt] = useState(false);
  const [copied, setCopied] = useState(false);

  // ---- Fetch quiz data ----------------------------------------------------
  const fetchQuiz = useCallback(async () => {
    try {
      const res = await fetch(`/api/quiz/${quizId}`);
      const json = await res.json();
      if (!json?.ok || !json.quiz) {
        toast.error("Quiz not found");
        router.push("/dashboard");
        return;
      }
      const q: QuizData = {
        ...json.quiz,
        questions: json.quiz.questions ?? [],
        results: json.quiz.results ?? [],
      };
      setQuiz(q);
      setLeads(json.leads ?? []);

      // Populate form state
      setTitle(q.title);
      setIntroduction(q.introduction ?? "");
      setCtaText(q.cta_text ?? "");
      setCtaUrl(q.cta_url ?? "");
      setPrivacyUrl(q.privacy_url ?? "");
      setConsentText(q.consent_text ?? "");
      setCaptureHeading(q.capture_heading ?? "");
      setCaptureSubtitle(q.capture_subtitle ?? "");
      setCaptureFirstName(q.capture_first_name ?? false);
      setCaptureLastName(q.capture_last_name ?? false);
      setCapturePhone(q.capture_phone ?? false);
      setCaptureCountry(q.capture_country ?? false);
      setViralityEnabled(q.virality_enabled);
      setBonusDescription(q.bonus_description ?? "");
      setShareMessage(q.share_message ?? "");
      setLocale(q.locale ?? "");
      setSioShareTagName(q.sio_share_tag_name ?? "");
      setStatus(q.status);
      setEditQuestions(q.questions);
      setEditResults(q.results);
    } catch {
      toast.error("Error loading quiz");
    } finally {
      setLoading(false);
    }
  }, [quizId, router]);

  useEffect(() => {
    fetchQuiz();
  }, [fetchQuiz]);

  // ---- Save quiz ----------------------------------------------------------
  const handleSave = async () => {
    if (!title.trim()) {
      toast.error(tf("titleLabel") + " is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/quiz/${quizId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          introduction,
          cta_text: ctaText,
          cta_url: ctaUrl,
          privacy_url: privacyUrl || null,
          consent_text: consentText,
          capture_heading: captureHeading || null,
          capture_subtitle: captureSubtitle || null,
          capture_first_name: captureFirstName,
          capture_last_name: captureLastName,
          capture_phone: capturePhone,
          capture_country: captureCountry,
          virality_enabled: viralityEnabled,
          bonus_description: bonusDescription,
          share_message: shareMessage,
          locale: locale || null,
          sio_share_tag_name: sioShareTagName || null,
          status,
          questions: editQuestions.map((q, i) => ({
            question_text: q.question_text,
            options: q.options,
            sort_order: i,
          })),
          results: editResults.map((r, i) => ({
            title: r.title,
            description: r.description,
            insight: r.insight,
            projection: r.projection,
            cta_text: r.cta_text,
            cta_url: r.cta_url,
            sio_tag_name: r.sio_tag_name || null,
            sio_course_id: r.sio_course_id || null,
            sio_community_id: r.sio_community_id || null,
            sort_order: i,
          })),
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Error");
      toast.success(tf("saved"));
      // Update local quiz state
      setQuiz((prev) =>
        prev
          ? {
              ...prev,
              title,
              introduction,
              cta_text: ctaText,
              cta_url: ctaUrl,
              privacy_url: privacyUrl || null,
              consent_text: consentText,
              capture_heading: captureHeading || null,
              capture_subtitle: captureSubtitle || null,
              capture_first_name: captureFirstName,
              capture_last_name: captureLastName,
              capture_phone: capturePhone,
              capture_country: captureCountry,
              virality_enabled: viralityEnabled,
              bonus_description: bonusDescription,
              share_message: shareMessage,
              locale: locale || null,
              sio_share_tag_name: sioShareTagName || null,
              status,
              questions: editQuestions,
              results: editResults,
            }
          : prev,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : tf("errSave");
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // ---- Toggle status ------------------------------------------------------
  const handleToggleStatus = async () => {
    const newStatus = status === "active" ? "draft" : "active";
    setStatus(newStatus);
    try {
      const res = await fetch(`/api/quiz/${quizId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error();
      setQuiz((prev) => (prev ? { ...prev, status: newStatus } : prev));
      toast.success(newStatus === "active" ? t("activate") : t("deactivate"));
    } catch {
      setStatus(status === "active" ? "active" : "draft");
      toast.error("Error toggling status");
    }
  };

  // ---- Copy public link ---------------------------------------------------
  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/q/${quizId}`
      : `/q/${quizId}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      toast.success(t("quizLink") + " copied!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ---- Question helpers ---------------------------------------------------
  const addQuestion = () => {
    setEditQuestions((prev) => [
      ...prev,
      {
        question_text: "",
        options: Array.from({ length: editResults.length || 2 }, (_, i) => ({
          text: "",
          result_index: i,
        })),
        sort_order: prev.length,
      },
    ]);
  };

  const removeQuestion = (index: number) => {
    setEditQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateQuestionText = (index: number, value: string) => {
    setEditQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, question_text: value } : q)),
    );
  };

  const updateOptionText = (qIndex: number, oIndex: number, value: string) => {
    setEditQuestions((prev) =>
      prev.map((q, qi) => {
        if (qi !== qIndex) return q;
        const opts = [...q.options];
        opts[oIndex] = { ...opts[oIndex], text: value };
        return { ...q, options: opts };
      }),
    );
  };

  const updateOptionResultIndex = (qIndex: number, oIndex: number, value: number) => {
    setEditQuestions((prev) =>
      prev.map((q, qi) => {
        if (qi !== qIndex) return q;
        const opts = [...q.options];
        opts[oIndex] = { ...opts[oIndex], result_index: value };
        return { ...q, options: opts };
      }),
    );
  };

  const addOption = (qIndex: number) => {
    setEditQuestions((prev) =>
      prev.map((q, qi) => {
        if (qi !== qIndex) return q;
        return {
          ...q,
          options: [...q.options, { text: "", result_index: 0 }],
        };
      }),
    );
  };

  const removeOption = (qIndex: number, oIndex: number) => {
    setEditQuestions((prev) =>
      prev.map((q, qi) => {
        if (qi !== qIndex) return q;
        return {
          ...q,
          options: q.options.filter((_, i) => i !== oIndex),
        };
      }),
    );
  };

  // ---- Result helpers -----------------------------------------------------
  const addResult = () => {
    setEditResults((prev) => [
      ...prev,
      {
        title: "",
        description: null,
        insight: null,
        projection: null,
        cta_text: null,
        cta_url: null,
        sio_tag_name: null,
        sio_course_id: null,
        sio_community_id: null,
        sort_order: prev.length,
      },
    ]);
  };

  const removeResult = (index: number) => {
    setEditResults((prev) => prev.filter((_, i) => i !== index));
    // Remap question option result_index values
    setEditQuestions((prev) =>
      prev.map((q) => ({
        ...q,
        options: q.options
          .filter((o) => o.result_index !== index)
          .map((o) => ({
            ...o,
            result_index: o.result_index > index ? o.result_index - 1 : o.result_index,
          })),
      })),
    );
  };

  const updateResultField = (index: number, field: string, value: unknown) => {
    setEditResults((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    );
  };

  // ---- Export CSV ----------------------------------------------------------
  const handleExportCSV = () => {
    if (!leads.length) return;

    const headers = [
      t("email"),
      t("firstName"),
      t("lastName"),
      t("phone"),
      t("country"),
      t("result"),
      t("date"),
      t("shared"),
      t("bonusUnlocked"),
    ];

    const rows = leads.map((l) => [
      l.email,
      l.first_name ?? "",
      l.last_name ?? "",
      l.phone ?? "",
      l.country ?? "",
      l.result_title ?? "",
      l.created_at
        ? new Date(l.created_at).toLocaleDateString()
        : "",
      l.has_shared ? "Yes" : "No",
      l.bonus_unlocked ? "Yes" : "No",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `quiz-leads-${quizId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // ---- Sync with Systeme.io -----------------------------------------------
  const handleSync = async () => {
    if (!syncTagName.trim()) {
      toast.error("Tag name is required");
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch(`/api/quiz/${quizId}/sync-systeme`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagName: syncTagName.trim() }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || t("syncError"));
      toast.success(t("syncSuccess", { count: json.synced ?? 0 }));
      setShowSyncPrompt(false);
      setSyncTagName("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("syncError");
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  };

  // ---- Stats helpers ------------------------------------------------------
  const conversionRate =
    quiz && quiz.views_count > 0
      ? ((leads.length / quiz.views_count) * 100).toFixed(1)
      : "0";

  // ---- Loading state ------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!quiz) return null;

  // ---- Render -------------------------------------------------------------
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* ================================================================= */}
      {/* Header                                                            */}
      {/* ================================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <h1 className="text-xl font-bold truncate">{quiz.title}</h1>
          <Badge
            variant={status === "active" ? "default" : "secondary"}
            className={
              status === "active"
                ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                : ""
            }
          >
            {status === "active" ? "Active" : "Draft"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToggleStatus}>
            {status === "active" ? t("deactivate") : t("activate")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyLink}>
            {copied ? (
              <CheckCircle className="w-4 h-4 mr-1 text-green-600" />
            ) : (
              <Copy className="w-4 h-4 mr-1" />
            )}
            {t("quizLink")}
          </Button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Tabs                                                              */}
      {/* ================================================================= */}
      <Tabs defaultValue="edit" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="edit">{t("tabEdit")}</TabsTrigger>
          <TabsTrigger value="leads">{t("tabLeads")}</TabsTrigger>
          <TabsTrigger value="stats">{t("tabStats")}</TabsTrigger>
        </TabsList>

        {/* =============================================================== */}
        {/* Edit Tab                                                        */}
        {/* =============================================================== */}
        <TabsContent value="edit" className="space-y-6 mt-6">
          {/* -- Basic fields -------------------------------------------- */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <Label htmlFor="quiz-title">{tf("titleLabel")}</Label>
                <Input
                  id="quiz-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={tf("titlePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quiz-intro">{tf("introLabel")}</Label>
                <Textarea
                  id="quiz-intro"
                  value={introduction}
                  onChange={(e) => setIntroduction(e.target.value)}
                  placeholder={tf("introPlaceholder")}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quiz-cta">{tf("ctaLabel")}</Label>
                  <Input
                    id="quiz-cta"
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    placeholder={tf("ctaPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quiz-cta-url">{tf("ctaUrlLabel")}</Label>
                  <Input
                    id="quiz-cta-url"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    placeholder={tf("ctaUrlPlaceholder")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quiz-privacy">{tf("privacyUrlLabel")}</Label>
                <Input
                  id="quiz-privacy"
                  value={privacyUrl}
                  onChange={(e) => setPrivacyUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quiz-consent">{tf("consentLabel")}</Label>
                <Textarea
                  id="quiz-consent"
                  value={consentText}
                  onChange={(e) => setConsentText(e.target.value)}
                  placeholder={tf("consentPlaceholder")}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* -- Capture fields ------------------------------------------ */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Email capture
              </h3>

              <div className="space-y-2">
                <Label htmlFor="capture-heading">{tf("captureHeadingLabel")}</Label>
                <Input
                  id="capture-heading"
                  value={captureHeading}
                  onChange={(e) => setCaptureHeading(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="capture-subtitle">{tf("captureSubtitleLabel")}</Label>
                <Textarea
                  id="capture-subtitle"
                  value={captureSubtitle}
                  onChange={(e) => setCaptureSubtitle(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={captureFirstName}
                    onChange={(e) => setCaptureFirstName(e.target.checked)}
                    className="rounded border-input"
                  />
                  <span className="text-sm">{tf("captureFirstName")}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={captureLastName}
                    onChange={(e) => setCaptureLastName(e.target.checked)}
                    className="rounded border-input"
                  />
                  <span className="text-sm">{tf("captureLastName")}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={capturePhone}
                    onChange={(e) => setCapturePhone(e.target.checked)}
                    className="rounded border-input"
                  />
                  <span className="text-sm">{tf("capturePhone")}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={captureCountry}
                    onChange={(e) => setCaptureCountry(e.target.checked)}
                    className="rounded border-input"
                  />
                  <span className="text-sm">{tf("captureCountry")}</span>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* -- Virality ------------------------------------------------ */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={viralityEnabled}
                  onChange={(e) => setViralityEnabled(e.target.checked)}
                  className="rounded border-input"
                />
                <div>
                  <span className="text-sm font-medium">{tf("viralityLabel")}</span>
                  <p className="text-xs text-muted-foreground">{tf("viralityDesc")}</p>
                </div>
              </label>

              {viralityEnabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="bonus-desc">{tf("bonusLabel")}</Label>
                    <Textarea
                      id="bonus-desc"
                      value={bonusDescription}
                      onChange={(e) => setBonusDescription(e.target.value)}
                      placeholder={tf("bonusPlaceholder")}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="share-msg">{tf("shareMessageLabel")}</Label>
                    <Textarea
                      id="share-msg"
                      value={shareMessage}
                      onChange={(e) => setShareMessage(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="share-tag">{tf("shareTagLabel")}</Label>
                    <Input
                      id="share-tag"
                      value={sioShareTagName}
                      onChange={(e) => setSioShareTagName(e.target.value)}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* -- Questions editor ---------------------------------------- */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">
                {tf("questionsTitle")} ({editQuestions.length})
              </h3>
              <Button variant="outline" size="sm" onClick={addQuestion}>
                <Plus className="w-4 h-4 mr-1" />
                {tf("addQuestion")}
              </Button>
            </div>

            {editQuestions.map((question, qi) => (
              <Card key={question.id ?? qi}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-muted-foreground shrink-0">
                      {tf("questionLabel", { n: qi + 1 })}
                    </span>
                    <Input
                      value={question.question_text}
                      onChange={(e) => updateQuestionText(qi, e.target.value)}
                      placeholder={tf("questionPlaceholder")}
                      className="flex-1"
                    />
                    {editQuestions.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeQuestion(qi)}
                        className="text-destructive shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div className="pl-6 space-y-2">
                    {question.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">
                          {String.fromCharCode(65 + oi)}.
                        </span>
                        <Input
                          value={opt.text}
                          onChange={(e) => updateOptionText(qi, oi, e.target.value)}
                          placeholder={tf("optionPlaceholder", { n: oi + 1 })}
                          className="flex-1 text-sm"
                        />
                        <select
                          className="h-9 w-[140px] shrink-0 rounded-md border border-input bg-background px-2 text-xs"
                          value={opt.result_index}
                          onChange={(e) =>
                            updateOptionResultIndex(qi, oi, Number(e.target.value))
                          }
                        >
                          {editResults.map((_, ri) => (
                            <option key={ri} value={ri}>
                              {tf("mapsToResult")} {ri + 1}
                            </option>
                          ))}
                        </select>
                        {question.options.length > 2 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeOption(qi, oi)}
                            className="text-destructive shrink-0 h-8 w-8"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addOption(qi)}
                      className="text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      {tf("addOption")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* -- Results editor ------------------------------------------ */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">
                {tf("resultsTitle")} ({editResults.length})
              </h3>
              <Button variant="outline" size="sm" onClick={addResult}>
                <Plus className="w-4 h-4 mr-1" />
                {tf("addResult")}
              </Button>
            </div>

            {editResults.map((result, ri) => (
              <Card key={result.id ?? ri}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="shrink-0">
                      {tf("resultLabel", { n: ri + 1 })}
                    </Badge>
                    <Input
                      value={result.title}
                      onChange={(e) => updateResultField(ri, "title", e.target.value)}
                      placeholder={tf("resultTitlePlaceholder")}
                      className="flex-1 font-medium"
                    />
                    {editResults.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeResult(ri)}
                        className="text-destructive shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        {tf("resultDescLabel")}
                      </Label>
                      <Textarea
                        value={result.description ?? ""}
                        onChange={(e) =>
                          updateResultField(ri, "description", e.target.value || null)
                        }
                        rows={2}
                        className="text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        {tf("resultInsightLabel")}
                      </Label>
                      <Textarea
                        value={result.insight ?? ""}
                        onChange={(e) =>
                          updateResultField(ri, "insight", e.target.value || null)
                        }
                        rows={2}
                        className="text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        {tf("resultProjectionLabel")}
                      </Label>
                      <Textarea
                        value={result.projection ?? ""}
                        onChange={(e) =>
                          updateResultField(ri, "projection", e.target.value || null)
                        }
                        rows={2}
                        className="text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          {tf("resultCtaLabel")}
                        </Label>
                        <Input
                          value={result.cta_text ?? ""}
                          onChange={(e) =>
                            updateResultField(ri, "cta_text", e.target.value || null)
                          }
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          {tf("resultCtaUrlLabel")}
                        </Label>
                        <Input
                          value={result.cta_url ?? ""}
                          onChange={(e) =>
                            updateResultField(ri, "cta_url", e.target.value || null)
                          }
                          className="text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        {tf("sioTagLabel")}
                      </Label>
                      <Input
                        value={result.sio_tag_name ?? ""}
                        onChange={(e) =>
                          updateResultField(ri, "sio_tag_name", e.target.value || null)
                        }
                        placeholder={tf("sioTagPlaceholder")}
                        className="text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          {tf("sioCourseLabel")}
                        </Label>
                        <Input
                          value={result.sio_course_id ?? ""}
                          onChange={(e) =>
                            updateResultField(ri, "sio_course_id", e.target.value || null)
                          }
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          {tf("sioCommunityLabel")}
                        </Label>
                        <Input
                          value={result.sio_community_id ?? ""}
                          onChange={(e) =>
                            updateResultField(
                              ri,
                              "sio_community_id",
                              e.target.value || null,
                            )
                          }
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* -- Save button --------------------------------------------- */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : null}
              {saving ? tf("saving") : tf("saved").replace("!", "")}
            </Button>
          </div>
        </TabsContent>

        {/* =============================================================== */}
        {/* Leads Tab                                                       */}
        {/* =============================================================== */}
        <TabsContent value="leads" className="space-y-4 mt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-bold text-lg">
              {t("leadsTitle")} ({leads.length})
            </h3>
            <div className="flex items-center gap-2">
              {leads.length > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={handleExportCSV}>
                    <Download className="w-4 h-4 mr-1" />
                    {t("exportLeads")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSyncPrompt(true)}
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    {t("syncSysteme")}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Sync prompt */}
          {showSyncPrompt && (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <p className="text-sm text-muted-foreground">
                  Enter the Systeme.io tag name to apply to all leads:
                </p>
                <div className="flex gap-2">
                  <Input
                    value={syncTagName}
                    onChange={(e) => setSyncTagName(e.target.value)}
                    placeholder="e.g. quiz-leads"
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSync();
                    }}
                  />
                  <Button onClick={handleSync} disabled={syncing}>
                    {syncing ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-1" />
                    )}
                    {syncing ? t("syncing") : t("syncSysteme")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowSyncPrompt(false);
                      setSyncTagName("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {leads.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">{t("noLeads")}</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left font-medium px-4 py-3">
                        {t("email")}
                      </th>
                      <th className="text-left font-medium px-4 py-3">
                        {t("firstName")}
                      </th>
                      <th className="text-left font-medium px-4 py-3">
                        {t("lastName")}
                      </th>
                      <th className="text-left font-medium px-4 py-3">
                        {t("phone")}
                      </th>
                      <th className="text-left font-medium px-4 py-3">
                        {t("country")}
                      </th>
                      <th className="text-left font-medium px-4 py-3">
                        {t("result")}
                      </th>
                      <th className="text-left font-medium px-4 py-3">
                        {t("date")}
                      </th>
                      <th className="text-left font-medium px-4 py-3">
                        {t("shared")}
                      </th>
                      <th className="text-left font-medium px-4 py-3">
                        {t("bonusUnlocked")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr key={lead.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">{lead.email}</td>
                        <td className="px-4 py-3">{lead.first_name ?? "—"}</td>
                        <td className="px-4 py-3">{lead.last_name ?? "—"}</td>
                        <td className="px-4 py-3">{lead.phone ?? "—"}</td>
                        <td className="px-4 py-3">{lead.country ?? "—"}</td>
                        <td className="px-4 py-3">{lead.result_title ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {lead.created_at
                            ? new Date(lead.created_at).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {lead.has_shared ? (
                            <Badge
                              variant="default"
                              className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                            >
                              Yes
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">No</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {lead.bonus_unlocked ? (
                            <Badge
                              variant="default"
                              className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                            >
                              Yes
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* =============================================================== */}
        {/* Stats Tab                                                       */}
        {/* =============================================================== */}
        <TabsContent value="stats" className="space-y-6 mt-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Views */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Eye className="w-4 h-4" />
                  Views
                </div>
                <div className="mt-1 text-2xl font-bold">{quiz.views_count}</div>
              </CardContent>
            </Card>

            {/* Starts */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Play className="w-4 h-4" />
                  Starts
                </div>
                <div className="mt-1 text-2xl font-bold">{quiz.starts_count}</div>
                {quiz.views_count > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {((quiz.starts_count / quiz.views_count) * 100).toFixed(1)}% of views
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Completions */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4" />
                  Completions
                </div>
                <div className="mt-1 text-2xl font-bold">{quiz.completions_count}</div>
                {quiz.starts_count > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {((quiz.completions_count / quiz.starts_count) * 100).toFixed(1)}% of
                    starts
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Leads */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  Leads
                </div>
                <div className="mt-1 text-2xl font-bold">{leads.length}</div>
                {quiz.completions_count > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {((leads.length / quiz.completions_count) * 100).toFixed(1)}% capture
                    rate
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Shares */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Share2 className="w-4 h-4" />
                  Shares
                </div>
                <div className="mt-1 text-2xl font-bold">{quiz.shares_count}</div>
              </CardContent>
            </Card>
          </div>

          {/* Conversion rate card */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Overall Conversion Rate (Views to Leads)
              </h3>
              <div className="text-4xl font-bold">{conversionRate}%</div>
              <p className="text-sm text-muted-foreground mt-1">
                {leads.length} leads from {quiz.views_count} views
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
