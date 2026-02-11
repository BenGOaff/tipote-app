// components/quiz/QuizDetailClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
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
  Copy,
  Check,
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
  Pencil,
  X,
} from "lucide-react";

import { format } from "date-fns";
import { fr } from "date-fns/locale";

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
  sort_order: number;
};

type QuizLead = {
  id: string;
  email: string;
  result_title: string | null;
  has_shared: boolean;
  bonus_unlocked: boolean;
  consent_given: boolean;
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
  virality_enabled: boolean;
  bonus_description: string | null;
  share_message: string | null;
  status: string;
  views_count: number;
  shares_count: number;
  created_at: string;
  questions: QuizQuestion[];
  results: QuizResult[];
  leads: QuizLead[];
};

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

  // Systeme.io sync
  const [sioTags, setSioTags] = useState<{ id: number; name: string }[]>([]);
  const [sioTagsLoading, setSioTagsLoading] = useState(false);
  const [sioTagsLoaded, setSioTagsLoaded] = useState(false);
  const [selectedTag, setSelectedTag] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [showNewTagInput, setShowNewTagInput] = useState(false);
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
  const [viralityEnabled, setViralityEnabled] = useState(false);
  const [bonusDescription, setBonusDescription] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [status, setStatus] = useState("draft");

  // Editable questions & results
  const [editQuestions, setEditQuestions] = useState<QuizQuestion[]>([]);
  const [editResults, setEditResults] = useState<QuizResult[]>([]);

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
        setViralityEnabled(q.virality_enabled);
        setBonusDescription(q.bonus_description ?? "");
        setShareMessage(q.share_message ?? "");
        setStatus(q.status);
        setEditQuestions(q.questions ?? []);
        setEditResults(q.results ?? []);
      } catch {
        toast({ title: "Erreur de chargement", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [quizId]);

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
          virality_enabled: viralityEnabled,
          bonus_description: bonusDescription,
          share_message: shareMessage,
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
              virality_enabled: viralityEnabled,
              bonus_description: bonusDescription,
              share_message: shareMessage,
              status,
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
    const headers = ["Email", "Profil", "Partagé", "Bonus", "Consentement", "Date"];
    const rows = quiz.leads.map((l) => [
      l.email,
      l.result_title ?? "",
      l.has_shared ? "Oui" : "Non",
      l.bonus_unlocked ? "Oui" : "Non",
      l.consent_given ? "Oui" : "Non",
      l.created_at ? format(new Date(l.created_at), "dd/MM/yyyy HH:mm") : "",
    ]);
    const csv =
      [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join(
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

  const handleSyncSystemeIo = async () => {
    const tagName = showNewTagInput ? newTagName.trim() : selectedTag;
    if (!tagName) {
      toast({
        title: "Tag requis",
        description: "Choisis un tag existant ou crée un nouveau tag.",
        variant: "destructive",
      });
      return;
    }

    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/quiz/${quizId}/sync-systeme`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagName }),
      });
      const json = await res.json();

      if (!json?.ok) {
        if (json?.error === "NO_API_KEY") {
          toast({
            title: "Clé API manquante",
            description: "Configure ta clé API Systeme.io dans Réglages > Systeme.io.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(json?.message || json?.error || "Erreur de synchronisation");
      }

      setSyncResult({
        synced: json.synced ?? 0,
        errors: json.errors ?? 0,
        total: json.total ?? 0,
      });

      toast({
        title: `${json.synced} lead${json.synced > 1 ? "s" : ""} synchronisé${json.synced > 1 ? "s" : ""}`,
        description: json.errors > 0
          ? `${json.errors} erreur(s) rencontrée(s).`
          : `Tag "${tagName}" appliqué dans Systeme.io.`,
      });

      // Refresh tags list to include newly created tag
      if (showNewTagInput) {
        loadSioTags();
        setShowNewTagInput(false);
        setNewTagName("");
      }
    } catch (err: any) {
      toast({
        title: "Erreur",
        description: err.message || "Impossible de synchroniser.",
        variant: "destructive",
      });
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
          <header className="h-16 flex items-center px-6 border-b bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-4 flex items-center gap-3 flex-1">
              <Button variant="ghost" size="icon" asChild>
                <Link href="/contents">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              </Button>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-display font-bold truncate">{quiz.title}</h1>
              </div>
              <Badge
                className={
                  status === "active"
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    : "bg-muted text-muted-foreground"
                }
              >
                {status === "active" ? "Actif" : "Brouillon"}
              </Badge>
            </div>
            <div className="flex gap-2 ml-4">
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
          </header>

          <div className="p-6 max-w-5xl mx-auto space-y-6 w-full">
            {/* Stats row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Eye className="w-4 h-4" /> Vues
                </div>
                <div className="mt-1 text-2xl font-semibold">{quiz.views_count}</div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="w-4 h-4" /> Emails
                </div>
                <div className="mt-1 text-2xl font-semibold">{leadsCount}</div>
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
                              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
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
                          </div>
                        ))}
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
                  {editResults.map((r, ri) => (
                    <Card key={r.id || ri} className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="flex-shrink-0">Profil {ri + 1}</Badge>
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
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">CTA personnalisé</Label>
                          <Input
                            value={r.cta_text ?? ""}
                            onChange={(e) => {
                              const next = [...editResults];
                              next[ri] = { ...next[ri], cta_text: e.target.value || null };
                              setEditResults(next);
                            }}
                            className="text-sm"
                            placeholder="Texte du bouton CTA (optionnel)"
                          />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h3 className="font-bold">Paramètres</h3>
                  <div className="grid gap-4 max-w-md">
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
                    <div className="space-y-2">
                      <Label>Texte de consentement</Label>
                      <Textarea
                        value={consentText}
                        onChange={(e) => setConsentText(e.target.value)}
                        rows={2}
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
                          <TableHead>Email</TableHead>
                          <TableHead>Profil</TableHead>
                          <TableHead>Partagé</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {quiz.leads.map((lead) => (
                          <TableRow key={lead.id}>
                            <TableCell className="font-medium">
                              {lead.email}
                            </TableCell>
                            <TableCell>{lead.result_title ?? "—"}</TableCell>
                            <TableCell>
                              {lead.has_shared ? (
                                <Badge className="bg-green-100 text-green-700">
                                  Oui
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">Non</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {lead.created_at
                                ? format(new Date(lead.created_at), "dd MMM yyyy", {
                                    locale: fr,
                                  })
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}

                {/* Systeme.io sync */}
                {leadsCount > 0 && (
                  <Card className="p-6 space-y-4 border-dashed">
                    <div className="flex items-center gap-2">
                      <Upload className="w-5 h-5 text-muted-foreground" />
                      <h4 className="font-bold">Exporter vers Systeme.io</h4>
                    </div>

                    <div className="p-3 rounded-lg bg-muted/50 border text-sm text-muted-foreground space-y-1">
                      <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">Comment ça marche ?</p>
                          <ol className="list-decimal list-inside mt-1 space-y-0.5">
                            <li>Choisis un tag existant ou crées-en un nouveau</li>
                            <li>Tipote envoie chaque lead capturé vers ton Systeme.io</li>
                            <li>Le tag est appliqué automatiquement pour segmenter tes contacts</li>
                          </ol>
                          <p className="mt-1 text-xs">
                            Configure ta clé API dans{" "}
                            <a href="/settings?tab=settings" className="underline text-primary">
                              Réglages
                            </a>.
                          </p>
                        </div>
                      </div>
                    </div>

                    {!sioTagsLoaded ? (
                      <Button
                        variant="outline"
                        onClick={loadSioTags}
                        disabled={sioTagsLoading}
                      >
                        {sioTagsLoading ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <ChevronDown className="w-4 h-4 mr-1" />
                        )}
                        {sioTagsLoading ? "Chargement des tags..." : "Charger mes tags Systeme.io"}
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        {!showNewTagInput ? (
                          <div className="space-y-2">
                            <Label className="text-xs">Tag à appliquer</Label>
                            <div className="flex gap-2">
                              <select
                                className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                                value={selectedTag}
                                onChange={(e) => setSelectedTag(e.target.value)}
                              >
                                <option value="">Sélectionne un tag...</option>
                                {sioTags.map((t) => (
                                  <option key={t.id} value={t.name}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setShowNewTagInput(true)}
                                title="Créer un nouveau tag"
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                            </div>
                            {sioTags.length === 0 && (
                              <p className="text-xs text-muted-foreground">
                                Aucun tag trouvé. Crée un nouveau tag ci-dessus.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Label className="text-xs">Nouveau tag</Label>
                            <div className="flex gap-2">
                              <Input
                                placeholder="Ex: quiz-entrepreneur"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                className="flex-1"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setShowNewTagInput(false);
                                  setNewTagName("");
                                }}
                                title="Annuler"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}

                        <Button
                          onClick={handleSyncSystemeIo}
                          disabled={
                            syncing ||
                            (!showNewTagInput && !selectedTag) ||
                            (showNewTagInput && !newTagName.trim())
                          }
                        >
                          {syncing ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4 mr-1" />
                          )}
                          {syncing ? "Synchronisation..." : "Synchroniser"}
                        </Button>
                      </div>
                    )}

                    {syncResult && (
                      <p className="text-sm text-muted-foreground">
                        {syncResult.synced}/{syncResult.total} leads synchronisés
                        {syncResult.errors > 0 && `, ${syncResult.errors} erreur(s)`}
                      </p>
                    )}
                  </Card>
                )}
              </TabsContent>
            </Tabs>
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
    </SidebarProvider>
  );
}
