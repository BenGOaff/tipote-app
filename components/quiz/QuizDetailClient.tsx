// components/quiz/QuizDetailClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
  CheckCircle,
  Eye,
  Users,
  Share2,
  Mail,
  Trash2,
  Loader2,
  Save,
  ExternalLink,
  Code,
  Download,
  Upload,
  Plus,
  Info,
  ChevronDown,
  ChevronRight,
  Pencil,
  X,
  Bell,
} from "lucide-react";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { QuizPreviewModal } from "@/components/quiz/QuizPreviewModal";
import type { PublicQuizData } from "@/components/quiz/PublicQuizClient";
import { ImageUploader, type UploadedImage } from "@/components/content/ImageUploader";

type QuizQuestion = {
  id: string;
  question_text: string;
  options: { text: string; result_index: number }[];
  sort_order: number;
};

type QuizResult = {
  id: string;
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

type QuizLeadAnswer = {
  question_index: number;
  option_index: number;
};

type QuizLead = {
  id: string;
  email: string;
  result_title: string | null;
  has_shared: boolean;
  bonus_unlocked: boolean;
  consent_given: boolean;
  created_at: string;
  answers?: QuizLeadAnswer[] | null;
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
  capture_first_name?: boolean | null;
  capture_last_name?: boolean | null;
  capture_phone?: boolean | null;
  capture_country?: boolean | null;
  virality_enabled: boolean;
  bonus_description: string | null;
  share_message: string | null;
  status: string;
  sio_share_tag_name: string | null;
  views_count: number;
  starts_count: number;
  completions_count: number;
  shares_count: number;
  created_at: string;
  questions: QuizQuestion[];
  results: QuizResult[];
  leads: QuizLead[];
};

function LeadRow({ lead, questions }: { lead: QuizLead; questions: QuizQuestion[] }) {
  const [open, setOpen] = useState(false);
  const hasAnswers = Array.isArray(lead.answers) && lead.answers.length > 0;

  return (
    <>
      <TableRow
        className={hasAnswers ? "cursor-pointer hover:bg-muted/50" : ""}
        onClick={() => hasAnswers && setOpen(!open)}
      >
        <TableCell className="w-8 px-2">
          {hasAnswers && (
            open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          )}
        </TableCell>
        <TableCell className="font-medium">{lead.email}</TableCell>
        <TableCell>{lead.result_title ?? "—"}</TableCell>
        <TableCell>
          {lead.has_shared ? (
            <Badge className="bg-green-100 text-green-700">Oui</Badge>
          ) : (
            <span className="text-muted-foreground">Non</span>
          )}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {lead.created_at
            ? format(new Date(lead.created_at), "dd MMM yyyy", { locale: fr })
            : "—"}
        </TableCell>
      </TableRow>
      {open && hasAnswers && (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/30 p-4">
            <div className="space-y-1 text-sm">
              {lead.answers!.map((a) => {
                const q = questions[a.question_index];
                if (!q) return null;
                const opt = q.options?.[a.option_index];
                return (
                  <div key={a.question_index} className="flex gap-2">
                    <span className="font-medium text-muted-foreground shrink-0">
                      Q{a.question_index + 1}:
                    </span>
                    <span>{opt?.text ?? `Option ${a.option_index + 1}`}</span>
                  </div>
                );
              })}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

interface QuizDetailClientProps {
  quizId: string;
}

export default function QuizDetailClient({ quizId }: QuizDetailClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Systeme.io tags
  const [sioTags, setSioTags] = useState<{ id: number; name: string }[]>([]);
  const [sioTagsLoading, setSioTagsLoading] = useState(false);
  const [sioTagsLoaded, setSioTagsLoaded] = useState(false);

  // Systeme.io courses & communities (for auto-enrollment)
  const [sioCourses, setSioCourses] = useState<{ id: string; name: string }[]>([]);
  const [sioCoursesLoaded, setSioCoursesLoaded] = useState(false);
  const [sioCoursesLoading, setSioCoursesLoading] = useState(false);
  const [sioCommunities, setSioCommunities] = useState<{ id: string; name: string }[]>([]);
  const [sioCommunitiesLoaded, setSioCommunitiesLoaded] = useState(false);
  const [sioCommunitiesLoading, setSioCommunitiesLoading] = useState(false);
  const [sioShareTagName, setSioShareTagName] = useState("");
  // Track which picker is in "create new" mode: "share" | "result-0" | "result-1" etc.
  const [newTagFor, setNewTagFor] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  // Manual bulk sync
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    synced: number;
    errors: number;
    total: number;
  } | null>(null);

  // Editable fields
  const [title, setTitle] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
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
  const [status, setStatus] = useState("draft");

  // CTA mode: per-result or global
  const [ctaPerResult, setCtaPerResult] = useState(false);

  // Editable questions & results
  const [editQuestions, setEditQuestions] = useState<QuizQuestion[]>([]);
  const [editResults, setEditResults] = useState<QuizResult[]>([]);

  // Preview modal
  const [showPreview, setShowPreview] = useState(false);

  // OG image for social sharing
  const [ogImageUrl, setOgImageUrl] = useState("");

  // Widgets
  const [toastWidgets, setToastWidgets] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  const [shareWidgets, setShareWidgets] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  const [selectedToastWidget, setSelectedToastWidget] = useState<string>("");
  const [selectedShareWidget, setSelectedShareWidget] = useState<string>("");
  const [widgetsLoaded, setWidgetsLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/quiz/${quizId}`);
        const json = await res.json();
        if (!json?.ok || !json.quiz) {
          toast({ title: "Quiz introuvable", variant: "destructive" });
          router.push("/contents");
          return;
        }
        const q: QuizData = {
          ...json.quiz,
          leads: json.leads ?? json.quiz.leads ?? [],
        };
        setQuiz(q);
        setTitle(q.title);
        setIntroduction(q.introduction ?? "");
        setCtaText(q.cta_text ?? "");
        setCtaUrl(q.cta_url ?? "");
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
        setOgImageUrl((q as any).og_image_url ?? "");
        setStatus(q.status);
        setSioShareTagName(q.sio_share_tag_name ?? "");
        setEditQuestions(q.questions ?? []);
        setEditResults(q.results ?? []);
        setCtaPerResult((q.results ?? []).some((r: QuizResult) => r.cta_url?.trim()));
      } catch {
        toast({ title: "Erreur de chargement", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [quizId]);

  // Fetch available widgets
  useEffect(() => {
    Promise.all([
      fetch("/api/widgets/toast").then((r) => r.json()),
      fetch("/api/widgets/share").then((r) => r.json()),
    ]).then(([toastRes, shareRes]) => {
      if (toastRes.ok) setToastWidgets(toastRes.widgets || []);
      if (shareRes.ok) setShareWidgets(shareRes.widgets || []);
      // Auto-select first enabled widget if none selected
      if (toastRes.ok && toastRes.widgets?.length) {
        const first = toastRes.widgets.find((w: any) => w.enabled);
        if (first) setSelectedToastWidget(first.id);
      }
      if (shareRes.ok && shareRes.widgets?.length) {
        const first = shareRes.widgets.find((w: any) => w.enabled);
        if (first) setSelectedShareWidget(first.id);
      }
      setWidgetsLoaded(true);
    }).catch(() => setWidgetsLoaded(true));
  }, []);

  const handleSave = async () => {
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
          og_image_url: ogImageUrl || null,
          status,
          sio_share_tag_name: sioShareTagName || null,
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
            cta_text: ctaPerResult ? r.cta_text : null,
            cta_url: ctaPerResult ? r.cta_url : null,
            sio_tag_name: r.sio_tag_name || null,
            sio_course_id: r.sio_course_id || null,
            sio_community_id: r.sio_community_id || null,
            sort_order: i,
          })),
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erreur");
      toast({ title: "Quiz mis à jour" });
      // Refresh quiz data
      setQuiz((prev) =>
        prev
          ? {
              ...prev,
              title,
              introduction,
              cta_text: ctaText,
              cta_url: ctaUrl,
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
              status,
              sio_share_tag_name: sioShareTagName || null,
              questions: editQuestions,
              results: editResults,
            }
          : prev,
      );
    } catch (err: any) {
      toast({
        title: "Erreur",
        description: err.message || "Impossible de sauvegarder",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/quiz/${quizId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erreur");
      toast({ title: "Quiz supprimé" });
      router.push("/contents");
    } catch (err: any) {
      toast({
        title: "Erreur",
        description: err.message || "Impossible de supprimer",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = status === "active" ? "draft" : "active";
    setStatus(newStatus);
    try {
      await fetch(`/api/quiz/${quizId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setQuiz((prev) => (prev ? { ...prev, status: newStatus } : prev));
      toast({
        title: newStatus === "active" ? "Quiz publié" : "Quiz en brouillon",
      });
    } catch {
      setStatus(status);
    }
  };

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/q/${quizId}`
      : `/q/${quizId}`;

  const embedCode = `<iframe src="${publicUrl}" width="100%" height="700" frameborder="0" style="border:none;max-width:600px;margin:0 auto;display:block;"></iframe>`;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const handleExportCSV = () => {
    if (!quiz?.leads?.length) return;

    // Build per-question headers
    const questionHeaders = quiz.questions.map(
      (_q, i) => `Q${i + 1} Réponse`,
    );

    const headers = [
      "Email",
      "Profil",
      ...questionHeaders,
      "Partagé",
      "Bonus",
      "Consentement",
      "Date",
    ];

    const rows = quiz.leads.map((l) => {
      // Map answers to option text
      const answerCols = quiz.questions.map((_q, qIdx) => {
        const ans = l.answers?.find((a) => a.question_index === qIdx);
        if (ans == null) return "";
        const q = quiz.questions[qIdx];
        const opt = q?.options?.[ans.option_index];
        return opt?.text ?? `Option ${ans.option_index + 1}`;
      });

      return [
        l.email,
        l.result_title ?? "",
        ...answerCols,
        l.has_shared ? "Oui" : "Non",
        l.bonus_unlocked ? "Oui" : "Non",
        l.consent_given ? "Oui" : "Non",
        l.created_at ? format(new Date(l.created_at), "dd/MM/yyyy HH:mm") : "",
      ];
    });
    const csv =
      [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join(
        "\n",
      );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quiz-leads-${quizId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadSioTags = async () => {
    setSioTagsLoading(true);
    try {
      const res = await fetch("/api/systeme-io/tags");
      const json = await res.json();
      if (json?.ok && Array.isArray(json.tags)) {
        setSioTags(json.tags);
        setSioTagsLoaded(true);
      } else if (json?.error === "NO_API_KEY") {
        toast({
          title: "Clé API manquante",
          description: "Configure ta clé API Systeme.io dans Réglages > Systeme.io.",
          variant: "destructive",
        });
      } else if (json?.error === "INVALID_API_KEY") {
        toast({
          title: "Clé API invalide",
          description: "Vérifie ta clé API dans Réglages > Systeme.io.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de charger les tags Systeme.io.",
        variant: "destructive",
      });
    } finally {
      setSioTagsLoading(false);
    }
  };

  const loadSioCourses = async () => {
    setSioCoursesLoading(true);
    try {
      const res = await fetch("/api/systeme-io/courses");
      const json = await res.json();
      if (json?.ok && Array.isArray(json.courses)) {
        setSioCourses(json.courses);
        setSioCoursesLoaded(true);
      } else if (json?.error === "NO_API_KEY") {
        toast({ title: "Clé API manquante", description: "Configure ta clé API Systeme.io dans Réglages.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les formations Systeme.io.", variant: "destructive" });
    } finally {
      setSioCoursesLoading(false);
    }
  };

  const loadSioCommunities = async () => {
    setSioCommunitiesLoading(true);
    try {
      const res = await fetch("/api/systeme-io/communities");
      const json = await res.json();
      if (json?.ok && Array.isArray(json.communities)) {
        setSioCommunities(json.communities);
        setSioCommunitiesLoaded(true);
      } else if (json?.error === "NO_API_KEY") {
        toast({ title: "Clé API manquante", description: "Configure ta clé API Systeme.io dans Réglages.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les communautés Systeme.io.", variant: "destructive" });
    } finally {
      setSioCommunitiesLoading(false);
    }
  };

  /** Confirm new tag creation for a specific picker slot */
  const confirmNewTag = (pickerId: string) => {
    const name = newTagName.trim();
    if (!name) return;
    // Add to local tag list (it will be created in Systeme.io automatically when lead is sent)
    if (!sioTags.find((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setSioTags((prev) => [...prev, { id: Date.now(), name }]);
    }
    // Assign the tag to the right slot
    if (pickerId === "share") {
      setSioShareTagName(name);
    } else if (pickerId.startsWith("result-")) {
      const ri = parseInt(pickerId.replace("result-", ""), 10);
      const next = [...editResults];
      if (next[ri]) {
        next[ri] = { ...next[ri], sio_tag_name: name };
        setEditResults(next);
      }
    }
    setNewTagFor(null);
    setNewTagName("");
  };

  /** Reusable tag picker renderer */
  const renderTagPicker = (pickerId: string, value: string, onChange: (v: string) => void) => {
    if (newTagFor === pickerId) {
      return (
        <div className="flex gap-2">
          <Input
            placeholder="Nom du nouveau tag"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            className="flex-1 text-sm"
            onKeyDown={(e) => e.key === "Enter" && confirmNewTag(pickerId)}
          />
          <Button variant="outline" size="sm" onClick={() => confirmNewTag(pickerId)} disabled={!newTagName.trim()}>
            <Check className="w-3 h-3 mr-1" /> OK
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setNewTagFor(null); setNewTagName(""); }}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      );
    }

    if (!sioTagsLoaded) {
      return (
        <Button variant="outline" size="sm" onClick={loadSioTags} disabled={sioTagsLoading}>
          {sioTagsLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ChevronDown className="w-3 h-3 mr-1" />}
          {sioTagsLoading ? "Chargement..." : "Charger mes tags"}
        </Button>
      );
    }

    return (
      <div className="flex gap-2">
        <select
          className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— Aucun tag —</option>
          {sioTags.map((t) => (
            <option key={t.id} value={t.name}>{t.name}</option>
          ))}
        </select>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => { setNewTagFor(pickerId); setNewTagName(""); }}
          title="Créer un nouveau tag"
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>
    );
  };

  /** Manual bulk sync for existing leads */
  const handleBulkSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      // Collect all unique tag names from results
      const resultTags = editResults
        .filter((r) => r.sio_tag_name?.trim())
        .map((r) => r.sio_tag_name!.trim());
      const tagName = resultTags[0] || sioShareTagName || "";
      if (!tagName) {
        toast({ title: "Aucun tag configuré", description: "Configure au moins un tag avant de synchroniser.", variant: "destructive" });
        return;
      }

      const res = await fetch(`/api/quiz/${quizId}/sync-systeme`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagName }),
      });
      const json = await res.json();
      if (!json?.ok) {
        throw new Error(json?.message || json?.error || "Erreur");
      }
      setSyncResult({ synced: json.synced ?? 0, errors: json.errors ?? 0, total: json.total ?? 0 });
      toast({ title: `${json.synced} lead(s) synchronisé(s)` });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Impossible de synchroniser.", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar />
          <main className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </main>
        </div>
      </SidebarProvider>
    );
  }

  if (!quiz) return null;

  const leadsCount = quiz.leads?.length ?? 0;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 flex flex-col">
          <PageHeader
            left={
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" asChild>
                  <Link href="/contents">
                    <ArrowLeft className="w-5 h-5" />
                  </Link>
                </Button>
                <h1 className="text-lg font-display font-bold truncate">{quiz.title}</h1>
              </div>
            }
          />

          <div className="flex-1 p-4 sm:p-5 lg:p-6">
            <div className="max-w-[1200px] mx-auto w-full space-y-5">
            {/* Action bar */}
            <div className="flex items-center justify-between">
              <Badge
                className={
                  status === "active"
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    : "bg-muted text-muted-foreground"
                }
              >
                {status === "active" ? "Actif" : "Brouillon"}
              </Badge>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
                  <Eye className="w-4 h-4 mr-1" />
                  Apercu
                </Button>
                <Button variant="outline" size="sm" onClick={handleToggleStatus}>
                  {status === "active" ? "Dépublier" : "Publier"}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-1" />
                  )}
                  Sauvegarder
                </Button>
              </div>
            </div>
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Eye className="w-4 h-4" /> Vues
                </div>
                <div className="mt-1 text-2xl font-semibold">{quiz.views_count}</div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ArrowRight className="w-4 h-4" /> Démarrés
                </div>
                <div className="mt-1 text-2xl font-semibold">{quiz.starts_count ?? 0}</div>
                <div className="text-xs text-muted-foreground">
                  {quiz.views_count > 0
                    ? `${Math.round(((quiz.starts_count ?? 0) / quiz.views_count) * 100)}% des vues`
                    : "—"}
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4" /> Terminés
                </div>
                <div className="mt-1 text-2xl font-semibold">{quiz.completions_count ?? 0}</div>
                <div className="text-xs text-muted-foreground">
                  {(quiz.starts_count ?? 0) > 0
                    ? `${Math.round(((quiz.completions_count ?? 0) / (quiz.starts_count ?? 1)) * 100)}% des démarrés`
                    : "—"}
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="w-4 h-4" /> Emails
                </div>
                <div className="mt-1 text-2xl font-semibold">{leadsCount}</div>
                <div className="text-xs text-muted-foreground">
                  {(quiz.completions_count ?? 0) > 0
                    ? `${Math.round((leadsCount / (quiz.completions_count ?? 1)) * 100)}% capture`
                    : "—"}
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Share2 className="w-4 h-4" /> Partages
                </div>
                <div className="mt-1 text-2xl font-semibold">{quiz.shares_count}</div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" /> Conversion
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {quiz.views_count > 0
                    ? `${Math.round((leadsCount / quiz.views_count) * 100)}%`
                    : "—"}
                </div>
              </Card>
            </div>

            <Tabs defaultValue="quiz" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="quiz">Quiz</TabsTrigger>
                <TabsTrigger value="share">Partager</TabsTrigger>
                <TabsTrigger value="leads">Résultats ({leadsCount})</TabsTrigger>
              </TabsList>

              {/* TAB 1: Quiz content */}
              <TabsContent value="quiz" className="space-y-6 mt-4">
                <div className="space-y-2">
                  <Label>Titre</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Introduction</Label>
                  <Textarea
                    value={introduction}
                    onChange={(e) => setIntroduction(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">
                      Questions ({editQuestions.length})
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditQuestions((prev) => [
                          ...prev,
                          {
                            id: undefined as any,
                            question_text: "",
                            options: Array.from({ length: editResults.length || 3 }, (_, i) => ({
                              text: "",
                              result_index: i,
                            })),
                            sort_order: prev.length,
                          },
                        ]);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" /> Question
                    </Button>
                  </div>
                  {editQuestions.map((q, qi) => (
                    <Card key={q.id || qi} className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-muted-foreground flex-shrink-0">Q{qi + 1}.</span>
                        <Input
                          value={q.question_text}
                          onChange={(e) => {
                            const next = [...editQuestions];
                            next[qi] = { ...next[qi], question_text: e.target.value };
                            setEditQuestions(next);
                          }}
                          className="flex-1"
                          placeholder="Texte de la question"
                        />
                        {editQuestions.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditQuestions((prev) => prev.filter((_, i) => i !== qi))}
                            className="text-destructive shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <div className="pl-6 space-y-2">
                        {q.options.map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <span className="text-xs font-bold text-muted-foreground w-5 flex-shrink-0">
                              {String.fromCharCode(65 + oi)}.
                            </span>
                            <Input
                              value={opt.text}
                              onChange={(e) => {
                                const next = [...editQuestions];
                                const opts = [...next[qi].options];
                                opts[oi] = { ...opts[oi], text: e.target.value };
                                next[qi] = { ...next[qi], options: opts };
                                setEditQuestions(next);
                              }}
                              className="flex-1 text-sm"
                              placeholder="Texte de la réponse"
                            />
                            <select
                              className="h-9 w-[120px] shrink-0 rounded-md border border-input bg-background px-2 text-xs"
                              value={opt.result_index}
                              onChange={(e) => {
                                const next = [...editQuestions];
                                const opts = [...next[qi].options];
                                opts[oi] = { ...opts[oi], result_index: Number(e.target.value) };
                                next[qi] = { ...next[qi], options: opts };
                                setEditQuestions(next);
                              }}
                            >
                              {editResults.map((_, ri) => (
                                <option key={ri} value={ri}>
                                  Profil {ri + 1}
                                </option>
                              ))}
                            </select>
                            {q.options.length > 2 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const next = [...editQuestions];
                                  const newOpts = next[qi].options.filter((_, i) => i !== oi);
                                  next[qi] = { ...next[qi], options: newOpts };
                                  setEditQuestions(next);
                                }}
                                className="text-destructive shrink-0 h-8 w-8"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const next = [...editQuestions];
                            const newOpts = [...next[qi].options, { text: "", result_index: 0 }];
                            next[qi] = { ...next[qi], options: newOpts };
                            setEditQuestions(next);
                          }}
                          className="text-xs"
                        >
                          <Plus className="w-3 h-3 mr-1" /> Option
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">
                      Profils résultat ({editResults.length})
                    </h3>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium text-sm">CTA par résultat</p>
                      <p className="text-xs text-muted-foreground">
                        {ctaPerResult
                          ? "Chaque profil a son propre bouton CTA et lien"
                          : "Un seul CTA global pour tous les résultats (configurable dans Paramètres)"}
                      </p>
                    </div>
                    <Switch
                      checked={ctaPerResult}
                      onCheckedChange={setCtaPerResult}
                    />
                  </div>
                  {editResults.map((r, ri) => (
                    <Card key={r.id || ri} className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="shrink-0 whitespace-nowrap">Profil {ri + 1}</Badge>
                        <Input
                          value={r.title}
                          onChange={(e) => {
                            const next = [...editResults];
                            next[ri] = { ...next[ri], title: e.target.value };
                            setEditResults(next);
                          }}
                          className="flex-1 font-medium"
                          placeholder="Titre du profil"
                        />
                        {editResults.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => {
                              const removedIdx = ri;
                              setEditResults(editResults.filter((_, i) => i !== removedIdx));
                              // Remap result_index in all question options:
                              // - remove options pointing to the deleted profile
                              // - decrement indexes above the deleted one
                              setEditQuestions((prev) =>
                                prev.map((q) => ({
                                  ...q,
                                  options: q.options
                                    .filter((o) => o.result_index !== removedIdx)
                                    .map((o) => ({
                                      ...o,
                                      result_index: o.result_index > removedIdx ? o.result_index - 1 : o.result_index,
                                    })),
                                })),
                              );
                            }}
                            title="Supprimer ce profil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Description</Label>
                          <Textarea
                            value={r.description ?? ""}
                            onChange={(e) => {
                              const next = [...editResults];
                              next[ri] = { ...next[ri], description: e.target.value || null };
                              setEditResults(next);
                            }}
                            rows={2}
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Prise de conscience</Label>
                          <Textarea
                            value={r.insight ?? ""}
                            onChange={(e) => {
                              const next = [...editResults];
                              next[ri] = { ...next[ri], insight: e.target.value || null };
                              setEditResults(next);
                            }}
                            rows={2}
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Projection</Label>
                          <Textarea
                            value={r.projection ?? ""}
                            onChange={(e) => {
                              const next = [...editResults];
                              next[ri] = { ...next[ri], projection: e.target.value || null };
                              setEditResults(next);
                            }}
                            rows={2}
                            className="text-sm"
                          />
                        </div>
                        {ctaPerResult && (
                          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-dashed">
                            <Label className="text-xs text-muted-foreground font-medium">CTA pour ce profil</Label>
                            <Input
                              value={r.cta_text ?? ""}
                              onChange={(e) => {
                                const next = [...editResults];
                                next[ri] = { ...next[ri], cta_text: e.target.value || null };
                                setEditResults(next);
                              }}
                              className="text-sm"
                              placeholder="Texte du bouton (ex: Réserve ton appel)"
                            />
                            <Input
                              value={r.cta_url ?? ""}
                              onChange={(e) => {
                                const next = [...editResults];
                                next[ri] = { ...next[ri], cta_url: e.target.value || null };
                                setEditResults(next);
                              }}
                              className="text-sm"
                              placeholder="URL du lien (https://...)"
                            />
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            Tag Systeme.io
                            <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">auto</span>
                          </Label>
                          {renderTagPicker(
                            `result-${ri}`,
                            r.sio_tag_name ?? "",
                            (v) => {
                              const next = [...editResults];
                              next[ri] = { ...next[ri], sio_tag_name: v || null };
                              setEditResults(next);
                            },
                          )}
                          <p className="text-[10px] text-muted-foreground">
                            Ce tag sera appliqué automatiquement au contact dans Systeme.io quand un visiteur obtient ce profil.
                          </p>
                        </div>

                        {/* SIO Course auto-enrollment */}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            Formation Systeme.io
                            <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">auto</span>
                          </Label>
                          {!sioCoursesLoaded ? (
                            <Button variant="outline" size="sm" onClick={loadSioCourses} disabled={sioCoursesLoading}>
                              {sioCoursesLoading ? "Chargement..." : "Charger mes formations"}
                            </Button>
                          ) : (
                            <select
                              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                              value={r.sio_course_id ?? ""}
                              onChange={(e) => {
                                const next = [...editResults];
                                next[ri] = { ...next[ri], sio_course_id: e.target.value || null };
                                setEditResults(next);
                              }}
                            >
                              <option value="">— Aucune formation —</option>
                              {sioCourses.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          )}
                          <p className="text-[10px] text-muted-foreground">
                            Le contact sera inscrit automatiquement à cette formation Systeme.io.
                          </p>
                        </div>

                        {/* SIO Community auto-access */}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            Communauté Systeme.io
                            <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">auto</span>
                          </Label>
                          {!sioCommunitiesLoaded ? (
                            <Button variant="outline" size="sm" onClick={loadSioCommunities} disabled={sioCommunitiesLoading}>
                              {sioCommunitiesLoading ? "Chargement..." : "Charger mes communautés"}
                            </Button>
                          ) : (
                            <select
                              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                              value={r.sio_community_id ?? ""}
                              onChange={(e) => {
                                const next = [...editResults];
                                next[ri] = { ...next[ri], sio_community_id: e.target.value || null };
                                setEditResults(next);
                              }}
                            >
                              <option value="">— Aucune communauté —</option>
                              {sioCommunities.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          )}
                          <p className="text-[10px] text-muted-foreground">
                            Le contact sera ajouté automatiquement à cette communauté Systeme.io.
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const newProfileIndex = editResults.length;
                      setEditResults([
                        ...editResults,
                        {
                          id: `new-${Date.now()}`,
                          title: "",
                          description: null,
                          insight: null,
                          projection: null,
                          cta_text: null,
                          cta_url: null,
                          sio_tag_name: null,
                          sio_course_id: null,
                          sio_community_id: null,
                          sort_order: newProfileIndex,
                        },
                      ]);
                      // Auto-add an option pointing to the new profile in each question
                      setEditQuestions((prev) =>
                        prev.map((q) => ({
                          ...q,
                          options: [
                            ...q.options,
                            { text: "", result_index: newProfileIndex },
                          ],
                        })),
                      );
                    }}
                  >
                    <Plus className="w-4 h-4 mr-1" /> Ajouter un profil résultat
                  </Button>
                </div>

                {/* ── Systeme.io automation config ── */}
                <Card className="p-5 space-y-4 border-primary/20 bg-primary/[0.02]">
                  <div className="flex items-start gap-3">
                    <Upload className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <h3 className="font-bold">Automatisation Systeme.io</h3>
                      <p className="text-sm text-muted-foreground">
                        Tipote envoie automatiquement chaque lead capturé vers ton compte Systeme.io avec le bon tag.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/60 border text-sm space-y-2">
                    <p className="font-medium text-foreground flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-primary" />
                      Comment ça marche
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-1">
                      <li>
                        <strong>Configure ta clé API</strong> dans{" "}
                        <a href="/settings?tab=settings" className="underline text-primary hover:text-primary/80">
                          Réglages &gt; Systeme.io
                        </a>
                      </li>
                      <li>
                        <strong>Assigne un tag par profil résultat</strong> ci-dessus — quand un visiteur obtient ce résultat, le tag est appliqué au contact dans Systeme.io
                      </li>
                      <li>
                        <strong>Dans Systeme.io</strong>, crée une règle d&apos;automatisation : &quot;Quand le tag X est ajouté → envoyer la séquence email Y&quot;
                      </li>
                    </ol>
                    {viralityEnabled && (
                      <p className="text-muted-foreground mt-1">
                        <strong>Bonus de partage :</strong> configure aussi un tag &quot;partagé&quot; ci-dessous pour déclencher l&apos;envoi du bonus via une automatisation Systeme.io.
                      </p>
                    )}
                  </div>

                  {viralityEnabled && (
                    <div className="space-y-1.5">
                      <Label className="text-sm flex items-center gap-1.5">
                        Tag &quot;Quiz partagé&quot;
                        <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">bonus</span>
                      </Label>
                      {renderTagPicker("share", sioShareTagName, setSioShareTagName)}
                      <p className="text-xs text-muted-foreground">
                        Ce tag sera ajouté quand un visiteur partage le quiz.
                        Crée une automatisation dans Systeme.io : &quot;Quand ce tag est ajouté → envoyer le bonus&quot;.
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      editResults.some((r) => r.sio_tag_name?.trim()) ? "bg-green-500" : "bg-amber-400"
                    }`} />
                    <p className="text-xs text-muted-foreground">
                      {editResults.some((r) => r.sio_tag_name?.trim())
                        ? `${editResults.filter((r) => r.sio_tag_name?.trim()).length}/${editResults.length} profils ont un tag configuré`
                        : "Aucun tag configuré — les leads ne seront pas envoyés vers Systeme.io"}
                    </p>
                  </div>
                </Card>

                <div className="space-y-4 pt-4 border-t">
                  <h3 className="font-bold">Paramètres</h3>
                  <div className="grid gap-4 max-w-md">
                    {!ctaPerResult && (
                      <>
                        <div className="space-y-2">
                          <Label>CTA (texte)</Label>
                          <Input
                            value={ctaText}
                            onChange={(e) => setCtaText(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>CTA (URL)</Label>
                          <Input
                            value={ctaUrl}
                            onChange={(e) => setCtaUrl(e.target.value)}
                          />
                        </div>
                      </>
                    )}
                    {ctaPerResult && (
                      <p className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/50 border">
                        Les CTA sont configurés individuellement sur chaque profil résultat ci-dessus.
                      </p>
                    )}
                    <div className="space-y-2">
                      <Label>Texte de consentement</Label>
                      <Textarea
                        value={consentText}
                        onChange={(e) => setConsentText(e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="p-3 rounded-lg border space-y-3">
                      <p className="font-medium text-sm">Page de capture email</p>
                      <div className="space-y-2">
                        <Label className="text-xs">Titre de la page de capture</Label>
                        <Input
                          value={captureHeading}
                          onChange={(e) => setCaptureHeading(e.target.value)}
                          placeholder="Ton résultat est prêt !"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Sous-titre / texte d&apos;accroche</Label>
                        <Textarea
                          value={captureSubtitle}
                          onChange={(e) => setCaptureSubtitle(e.target.value)}
                          rows={3}
                          placeholder="Entre ton email pour découvrir ton profil."
                        />
                        <p className="text-xs text-muted-foreground">Les sauts de ligne seront préservés.</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium">Demander le prénom</p>
                          <p className="text-xs text-muted-foreground">Affiche un champ prénom avant l&apos;email</p>
                        </div>
                        <Switch
                          checked={captureFirstName}
                          onCheckedChange={setCaptureFirstName}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium">Demander le nom de famille</p>
                          <p className="text-xs text-muted-foreground">Affiche un champ nom de famille</p>
                        </div>
                        <Switch
                          checked={captureLastName}
                          onCheckedChange={setCaptureLastName}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium">Demander le téléphone</p>
                          <p className="text-xs text-muted-foreground">Affiche un champ numéro de téléphone</p>
                        </div>
                        <Switch
                          checked={capturePhone}
                          onCheckedChange={setCapturePhone}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium">Demander le pays</p>
                          <p className="text-xs text-muted-foreground">Affiche un champ pays</p>
                        </div>
                        <Switch
                          checked={captureCountry}
                          onCheckedChange={setCaptureCountry}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Image de partage (og:image)</Label>
                      <p className="text-xs text-muted-foreground">
                        Image affichée lors du partage sur les réseaux sociaux (1200x630px recommandé)
                      </p>
                      <ImageUploader
                        images={ogImageUrl ? [{ url: ogImageUrl, path: "", filename: "og-image", size: 0, type: "image/png" }] : []}
                        onChange={(imgs) => setOgImageUrl(imgs[0]?.url ?? "")}
                        contentId={`quiz-og-${quizId}`}
                        maxImages={1}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium text-sm">Bonus de partage</p>
                        <p className="text-xs text-muted-foreground">
                          1 partage = bonus débloqué
                        </p>
                      </div>
                      <Switch
                        checked={viralityEnabled}
                        onCheckedChange={setViralityEnabled}
                      />
                    </div>
                    {viralityEnabled && (
                      <>
                        <div className="space-y-2">
                          <Label>Description du bonus</Label>
                          <Textarea
                            value={bonusDescription}
                            onChange={(e) => setBonusDescription(e.target.value)}
                            rows={2}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Message de partage</Label>
                          <Textarea
                            value={shareMessage}
                            onChange={(e) => setShareMessage(e.target.value)}
                            rows={2}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Widgets */}
                <div className="space-y-4 pt-4 border-t">
                  <h3 className="font-bold">Widgets</h3>
                  <p className="text-sm text-muted-foreground">
                    Ajoute des widgets sur la page publique de ton quiz (page de résultat, remerciement).
                  </p>
                  <div className="grid gap-4 max-w-md">
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-amber-500" />
                        <div>
                          <p className="font-medium text-sm">Notifications (social proof)</p>
                          <p className="text-xs text-muted-foreground">Affiche des toasts de preuve sociale</p>
                        </div>
                      </div>
                      {toastWidgets.length > 0 ? (
                        <select
                          className="text-sm border rounded-md px-2 py-1.5"
                          value={selectedToastWidget}
                          onChange={(e) => setSelectedToastWidget(e.target.value)}
                        >
                          <option value="">Désactivé</option>
                          {toastWidgets.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name} {!w.enabled && "(inactif)"}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Button variant="outline" size="sm" asChild>
                          <a href="/widgets">Créer</a>
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Share2 className="w-4 h-4 text-blue-500" />
                        <div>
                          <p className="font-medium text-sm">Boutons de partage</p>
                          <p className="text-xs text-muted-foreground">Ajoute des boutons de partage social</p>
                        </div>
                      </div>
                      {shareWidgets.length > 0 ? (
                        <select
                          className="text-sm border rounded-md px-2 py-1.5"
                          value={selectedShareWidget}
                          onChange={(e) => setSelectedShareWidget(e.target.value)}
                        >
                          <option value="">Désactivé</option>
                          {shareWidgets.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name} {!w.enabled && "(inactif)"}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Button variant="outline" size="sm" asChild>
                          <a href="/widgets">Créer</a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> Supprimer le quiz
                  </Button>
                </div>
              </TabsContent>

              {/* TAB 2: Share */}
              <TabsContent value="share" className="space-y-6 mt-4">
                <Card className="p-6 space-y-4">
                  <h3 className="font-bold flex items-center gap-2">
                    <ExternalLink className="w-4 h-4" /> Lien public
                  </h3>
                  <div className="flex gap-2">
                    <Input value={publicUrl} readOnly className="flex-1 font-mono text-sm" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleCopy(publicUrl, "url")}
                    >
                      {copied === "url" ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  {status === "active" && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                        <Eye className="w-4 h-4 mr-1" /> Prévisualiser
                      </a>
                    </Button>
                  )}
                  {status !== "active" && (
                    <p className="text-sm text-amber-600">
                      Publie le quiz pour que le lien soit accessible.
                    </p>
                  )}
                </Card>

                <Card className="p-6 space-y-4">
                  <h3 className="font-bold flex items-center gap-2">
                    <Code className="w-4 h-4" /> Code embed
                  </h3>
                  <Textarea
                    value={embedCode}
                    readOnly
                    rows={3}
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(embedCode, "embed")}
                  >
                    {copied === "embed" ? (
                      <Check className="w-4 h-4 mr-1 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4 mr-1" />
                    )}
                    Copier
                  </Button>
                </Card>
              </TabsContent>

              {/* TAB 3: Leads */}
              <TabsContent value="leads" className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">Leads ({leadsCount})</h3>
                  {leadsCount > 0 && (
                    <Button variant="outline" size="sm" onClick={handleExportCSV}>
                      <Download className="w-4 h-4 mr-1" /> Export CSV
                    </Button>
                  )}
                </div>

                {leadsCount === 0 ? (
                  <Card className="p-6">
                    <p className="text-sm text-muted-foreground">
                      Aucun lead pour le moment. Partage ton quiz pour commencer à
                      collecter des emails.
                    </p>
                  </Card>
                ) : (
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Profil</TableHead>
                          <TableHead>Partagé</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {quiz.leads.map((lead) => (
                          <LeadRow
                            key={lead.id}
                            lead={lead}
                            questions={quiz.questions}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}

              </TabsContent>
            </Tabs>
          </div>
          </div>
        </main>
      </div>

      {/* Delete dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le quiz</DialogTitle>
            <DialogDescription>
              Cette action est irréversible. Le quiz, ses questions, résultats et leads
              seront supprimés.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleting}
            >
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview modal */}
      {quiz && (
        <QuizPreviewModal
          open={showPreview}
          onOpenChange={setShowPreview}
          quizId={quiz.id}
          previewData={{
            id: quiz.id,
            title,
            introduction,
            cta_text: ctaText || null,
            cta_url: ctaUrl || null,
            privacy_url: quiz.privacy_url,
            consent_text: consentText || null,
            capture_heading: captureHeading || null,
            capture_subtitle: captureSubtitle || null,
            capture_first_name: captureFirstName,
            virality_enabled: viralityEnabled,
            bonus_description: bonusDescription || null,
            share_message: shareMessage || null,
            locale: null,
            questions: editQuestions,
            results: editResults,
          } satisfies PublicQuizData}
        />
      )}
    </SidebarProvider>
  );
}
