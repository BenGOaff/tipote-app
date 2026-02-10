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
  const [sioTagName, setSioTagName] = useState("");
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

  const handleSyncSystemeIo = async () => {
    if (!sioTagName.trim()) {
      toast({
        title: "Tag requis",
        description: "Entre un nom de tag pour identifier ces leads dans Systeme.io.",
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
        body: JSON.stringify({ tagName: sioTagName.trim() }),
      });
      const json = await res.json();

      if (!json?.ok) {
        if (json?.error === "NO_API_KEY") {
          toast({
            title: "Clé API manquante",
            description:
              "Configure ta clé API Systeme.io dans Réglages > Systeme.io.",
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
          : `Tag "${sioTagName}" appliqué dans Systeme.io.`,
      });
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
                  <h3 className="font-bold">
                    Questions ({quiz.questions?.length ?? 0})
                  </h3>
                  {quiz.questions?.map((q, qi) => (
                    <Card key={q.id} className="p-4">
                      <p className="font-medium">
                        Q{qi + 1}. {q.question_text}
                      </p>
                      <div className="mt-2 grid gap-1 text-sm text-muted-foreground pl-4">
                        {q.options.map((opt, oi) => (
                          <p key={oi}>
                            {String.fromCharCode(65 + oi)}. {opt.text}{" "}
                            <span className="text-xs">
                              → Profil {opt.result_index + 1}
                            </span>
                          </p>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>

                <div className="space-y-3">
                  <h3 className="font-bold">
                    Profils résultat ({quiz.results?.length ?? 0})
                  </h3>
                  {quiz.results?.map((r, ri) => (
                    <Card key={r.id} className="p-4 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Profil {ri + 1}</Badge>
                        <span className="font-medium">{r.title}</span>
                      </div>
                      {r.description && (
                        <p className="text-sm text-muted-foreground">{r.description}</p>
                      )}
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
                    <p className="text-sm text-muted-foreground">
                      Envoie tes leads dans ton compte Systeme.io avec un tag pour les identifier.
                      Configure ta clé API dans Réglages &gt; Systeme.io.
                    </p>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Nom du tag</Label>
                        <Input
                          placeholder="Ex: quiz-entrepreneur"
                          value={sioTagName}
                          onChange={(e) => setSioTagName(e.target.value)}
                        />
                      </div>
                      <Button
                        onClick={handleSyncSystemeIo}
                        disabled={syncing || !sioTagName.trim()}
                      >
                        {syncing ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-1" />
                        )}
                        {syncing ? "Synchronisation..." : "Synchroniser"}
                      </Button>
                    </div>
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