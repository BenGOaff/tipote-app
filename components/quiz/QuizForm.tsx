// components/quiz/QuizForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  GripVertical,
  Eye,
  Save,
  ChevronDown,
  Check,
  X,
  Info,
  Upload,
  FileUp,
  PenLine,
} from "lucide-react";
import { AIGeneratingOverlay } from "@/components/ui/ai-generating-overlay";

type QuizQuestion = {
  question_text: string;
  options: { text: string; result_index: number }[];
  sort_order: number;
};

type QuizResult = {
  title: string;
  description: string | null;
  insight: string | null;
  projection: string | null;
  cta_text: string | null;
  cta_url: string | null;
  sio_tag_name: string | null;
  sort_order: number;
};

interface QuizFormProps {
  onClose: () => void;
}

export function QuizForm({ onClose }: QuizFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<"choose" | "config" | "import" | "edit">("choose");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Config step
  const [objective, setObjective] = useState("");
  const [target, setTarget] = useState("");
  const [tone, setTone] = useState("inspirant");
  const [cta, setCta] = useState("");
  const [bonus, setBonus] = useState("");
  const [questionCount, setQuestionCount] = useState("7");
  const [resultCount, setResultCount] = useState("3");
  const [locale, setLocale] = useState("fr");
  const [viralityEnabled, setViralityEnabled] = useState(false);

  // Edit step
  const [title, setTitle] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [consentText, setConsentText] = useState(
    "En renseignant ton email, tu acceptes notre politique de confidentialité.",
  );
  const [bonusDescription, setBonusDescription] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [sioShareTagName, setSioShareTagName] = useState("");
  const [ctaPerResult, setCtaPerResult] = useState(false);
  const [captureHeading, setCaptureHeading] = useState("");
  const [captureSubtitle, setCaptureSubtitle] = useState("");
  const [captureFirstName, setCaptureFirstName] = useState(true);
  const [captureLastName, setCaptureLastName] = useState(false);
  const [capturePhone, setCapturePhone] = useState(false);
  const [captureCountry, setCaptureCountry] = useState(false);

  // Systeme.io tags
  const [sioTags, setSioTags] = useState<{ id: number; name: string }[]>([]);
  const [sioTagsLoading, setSioTagsLoading] = useState(false);
  const [sioTagsLoaded, setSioTagsLoaded] = useState(false);
  const [newTagFor, setNewTagFor] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");

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
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les tags.", variant: "destructive" });
    } finally {
      setSioTagsLoading(false);
    }
  };

  const confirmNewTag = (pickerId: string) => {
    const name = newTagName.trim();
    if (!name) return;
    if (!sioTags.find((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setSioTags((prev) => [...prev, { id: Date.now(), name }]);
    }
    if (pickerId === "share") {
      setSioShareTagName(name);
    } else if (pickerId.startsWith("result-")) {
      const ri = parseInt(pickerId.replace("result-", ""), 10);
      updateResult(ri, "sio_tag_name", name);
    }
    setNewTagFor(null);
    setNewTagName("");
  };

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

  const handleGenerate = async () => {
    if (!objective.trim() || !target.trim()) {
      toast({
        title: "Champs requis",
        description: "Remplis au moins l'objectif et la cible.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective,
          target,
          tone,
          cta,
          bonus: viralityEnabled ? bonus : undefined,
          questionCount: parseInt(questionCount),
          resultCount: parseInt(resultCount),
          locale,
        }),
      });

      // Handle non-stream error responses (401, 400, 402, etc.)
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        if (json?.error === "NO_CREDITS") {
          toast({
            title: "Crédits insuffisants",
            description: "La génération de quiz coûte 6 crédits.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(json?.error || "Erreur de génération");
      }

      // Read SSE stream
      if (!res.body) throw new Error("Pas de réponse du serveur");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? ""; // Keep incomplete event in buffer

        for (const eventBlock of events) {
          let eventType = "";
          let eventData = "";
          for (const line of eventBlock.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) eventData = line.slice(6);
          }
          if (!eventData) continue;
          try {
            const data = JSON.parse(eventData);
            if (eventType === "result" && data.ok) {
              result = data;
            } else if (eventType === "error") {
              if (data.error === "NO_CREDITS") {
                toast({
                  title: "Crédits insuffisants",
                  description: "La génération de quiz coûte 6 crédits.",
                  variant: "destructive",
                });
                return;
              }
              throw new Error(data.error || "Erreur de génération");
            }
            // heartbeat and progress events are ignored
          } catch (parseErr) {
            // Ignore malformed SSE data lines
            if (eventType === "error" || eventType === "result") throw parseErr;
          }
        }
      }

      if (!result?.ok) {
        throw new Error("La génération n'a pas abouti. Réessaie.");
      }

      const quiz = result.quiz;
      setTitle(quiz.title ?? "");
      setIntroduction(quiz.introduction ?? "");
      setCtaText(quiz.cta_text ?? cta);
      if (quiz.share_message) setShareMessage(quiz.share_message);

      setQuestions(
        (quiz.questions ?? []).map((q: any, i: number) => ({
          question_text: q.question_text ?? "",
          options: Array.isArray(q.options) ? q.options : [],
          sort_order: i,
        })),
      );

      setResults(
        (quiz.results ?? []).map((r: any, i: number) => ({
          title: r.title ?? "",
          description: r.description ?? null,
          insight: r.insight ?? null,
          projection: r.projection ?? null,
          cta_text: r.cta_text ?? null,
          cta_url: null,
          sio_tag_name: null,
          sort_order: i,
        })),
      );

      setStep("edit");
    } catch (err: any) {
      toast({
        title: "Erreur",
        description: err.message || "Impossible de générer le quiz.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async (status: "draft" | "active" = "draft") => {
    if (!title.trim()) {
      toast({ title: "Titre requis", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
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
          locale,
          sio_share_tag_name: sioShareTagName || null,
          capture_heading: captureHeading || null,
          capture_subtitle: captureSubtitle || null,
          capture_first_name: captureFirstName,
          capture_last_name: captureLastName,
          capture_phone: capturePhone,
          capture_country: captureCountry,
          status,
          config_objective: objective,
          config_target: target,
          config_tone: tone,
          config_cta: cta,
          config_bonus: bonus,
          questions,
          results: results.map((r) => ({
            ...r,
            cta_text: ctaPerResult ? r.cta_text : null,
            cta_url: ctaPerResult ? r.cta_url : null,
            sio_tag_name: r.sio_tag_name || null,
          })),
        }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erreur");

      toast({ title: status === "active" ? "Quiz publié !" : "Quiz sauvegardé !" });
      router.push(`/quiz/${json.quizId}`);
    } catch (err: any) {
      toast({
        title: "Erreur",
        description: err.message || "Impossible de sauvegarder.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateQuestion = (index: number, field: string, value: any) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, [field]: value } : q)));
  };

  const updateOption = (qIndex: number, oIndex: number, field: string, value: any) => {
    setQuestions((prev) =>
      prev.map((q, qi) => {
        if (qi !== qIndex) return q;
        const newOpts = [...q.options];
        newOpts[oIndex] = { ...newOpts[oIndex], [field]: value };
        return { ...q, options: newOpts };
      }),
    );
  };

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        question_text: "",
        options: Array.from({ length: results.length || 3 }, (_, i) => ({
          text: "",
          result_index: i,
        })),
        sort_order: prev.length,
      },
    ]);
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateResult = (index: number, field: string, value: any) => {
    setResults((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const initEmptyQuiz = (numQuestions = 5, numResults = 3) => {
    setTitle("");
    setIntroduction("");
    setCtaText("");
    setCtaUrl("");
    setQuestions(
      Array.from({ length: numQuestions }, (_, i) => ({
        question_text: "",
        options: Array.from({ length: numResults }, (_, ri) => ({
          text: "",
          result_index: ri,
        })),
        sort_order: i,
      })),
    );
    setResults(
      Array.from({ length: numResults }, (_, i) => ({
        title: "",
        description: null,
        insight: null,
        projection: null,
        cta_text: null,
        cta_url: null,
        sio_tag_name: null,
        sort_order: i,
      })),
    );
  };

  const handleStartFromScratch = () => {
    initEmptyQuiz();
    setStep("edit");
  };

  const handleImportFile = async (file: File) => {
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/quiz/import", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erreur d'import");

      const quiz = json.quiz;
      setTitle(quiz.title ?? "");
      setIntroduction(quiz.introduction ?? "");
      setCtaText(quiz.cta_text ?? "");
      setQuestions(
        (quiz.questions ?? []).map((q: any, i: number) => ({
          question_text: q.question_text ?? "",
          options: Array.isArray(q.options) ? q.options : [],
          sort_order: i,
        })),
      );
      setResults(
        (quiz.results ?? []).map((r: any, i: number) => ({
          title: r.title ?? "",
          description: r.description ?? null,
          insight: r.insight ?? null,
          projection: r.projection ?? null,
          cta_text: null,
          cta_url: null,
          sio_tag_name: null,
          sort_order: i,
        })),
      );
      setStep("edit");
      toast({ title: "Quiz importé !", description: `${quiz.questions?.length ?? 0} questions et ${quiz.results?.length ?? 0} profils détectés.` });
    } catch (err: any) {
      toast({
        title: "Erreur d'import",
        description: err.message || "Impossible de lire le fichier.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  // STEP 0: Choose creation mode
  if (step === "choose") {
    return (
      <div className="space-y-6 max-w-xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">Créer un Quiz Lead Magnet</h2>
            <p className="text-sm text-muted-foreground">
              Choisis comment tu veux créer ton quiz
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <Card
            className="p-5 cursor-pointer hover:border-primary/50 hover:bg-primary/[0.02] transition-colors"
            onClick={() => setStep("config")}
          >
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold">Créer avec l&apos;IA</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Décris ton objectif et ta cible, l&apos;IA génère un quiz complet (questions, réponses, profils résultat). Tu n&apos;as plus qu&apos;à ajuster.
                </p>
                <Badge variant="secondary" className="mt-2 text-xs">6 crédits</Badge>
              </div>
            </div>
          </Card>

          <Card
            className="p-5 cursor-pointer hover:border-primary/50 hover:bg-primary/[0.02] transition-colors"
            onClick={() => setStep("import")}
          >
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-lg bg-blue-500/10 shrink-0">
                <FileUp className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-bold">Importer un quiz existant</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Tu as déjà un quiz ? Importe-le depuis un fichier (PDF, Word, Excel ou texte) et Tipote le transforme automatiquement.
                </p>
                <Badge variant="secondary" className="mt-2 text-xs">6 crédits</Badge>
              </div>
            </div>
          </Card>

          <Card
            className="p-5 cursor-pointer hover:border-primary/50 hover:bg-primary/[0.02] transition-colors"
            onClick={handleStartFromScratch}
          >
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 shrink-0">
                <PenLine className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-bold">Créer de zéro</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Tu sais exactement ce que tu veux ? Rédige tes questions, réponses et profils résultat manuellement.
                </p>
                <Badge variant="secondary" className="mt-2 text-xs">0 crédit</Badge>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // STEP: Import file
  if (step === "import") {
    return (
      <div className="space-y-6 max-w-xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setStep("choose")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">Importer un quiz</h2>
            <p className="text-sm text-muted-foreground">
              L&apos;IA analyse ton fichier et en extrait les questions, réponses et profils
            </p>
          </div>
        </div>

        <Card className="p-8 border-dashed border-2 text-center space-y-4">
          {isImporting ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Analyse du fichier en cours...</p>
            </div>
          ) : (
            <>
              <div className="flex justify-center">
                <div className="p-3 rounded-full bg-muted">
                  <FileUp className="w-6 h-6 text-muted-foreground" />
                </div>
              </div>
              <div>
                <p className="font-medium">Glisse ton fichier ici ou clique pour sélectionner</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Formats acceptés : PDF, Word (.docx), Excel (.xlsx), Texte (.txt)
                </p>
              </div>
              <input
                type="file"
                id="quiz-import-file"
                className="hidden"
                accept=".pdf,.docx,.xlsx,.txt,.doc,.xls,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                }}
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById("quiz-import-file")?.click()}
              >
                <Upload className="w-4 h-4 mr-2" /> Choisir un fichier
              </Button>
            </>
          )}
        </Card>

        <div className="p-4 rounded-lg bg-muted/50 border space-y-2">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Info className="w-4 h-4 text-primary" /> Comment formater ton fichier ?
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 ml-5 list-disc">
            <li>Écris tes questions numérotées (1. Question, 2. Question...)</li>
            <li>Sous chaque question, liste les réponses possibles (A. Réponse, B. Réponse...)</li>
            <li>Ajoute une section &quot;Résultats&quot; ou &quot;Profils&quot; avec un titre et une description pour chaque profil</li>
            <li>L&apos;IA s&apos;adapte à la plupart des formats — fais au plus simple !</li>
          </ul>
        </div>
      </div>
    );
  }

  // STEP 1: Config (AI generation)
  if (step === "config" && isGenerating) {
    return <AIGeneratingOverlay />;
  }

  if (step === "config") {
    return (
      <div className="space-y-6 max-w-xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setStep("choose")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">Créer avec l&apos;IA</h2>
            <p className="text-sm text-muted-foreground">
              L&apos;IA va générer un quiz complet à partir de tes paramètres
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Objectif du quiz *</Label>
            <Textarea
              placeholder="Ex: Aider mes prospects à identifier leur profil d'entrepreneur pour leur proposer mon accompagnement"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Cible *</Label>
            <Input
              placeholder="Ex: Entrepreneurs débutants qui veulent lancer leur business en ligne"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Ton</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inspirant">Inspirant</SelectItem>
                  <SelectItem value="professionnel">Professionnel</SelectItem>
                  <SelectItem value="décontracté">Décontracté</SelectItem>
                  <SelectItem value="provocateur">Provocateur</SelectItem>
                  <SelectItem value="bienveillant">Bienveillant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nombre de questions</Label>
              <Input
                type="number"
                min={3}
                max={30}
                value={questionCount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || (/^\d+$/.test(v) && parseInt(v) <= 30)) {
                    setQuestionCount(v);
                  }
                }}
                placeholder="7"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre de profils résultat</Label>
              <Select value={resultCount} onValueChange={setResultCount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 profils</SelectItem>
                  <SelectItem value="3">3 profils</SelectItem>
                  <SelectItem value="4">4 profils</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>CTA final</Label>
              <Input
                placeholder="Ex: Réserve ton appel découverte"
                value={cta}
                onChange={(e) => setCta(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Langue du quiz</Label>
            <Select value={locale} onValueChange={setLocale}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
                <SelectItem value="pt">Português</SelectItem>
                <SelectItem value="it">Italiano</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div>
              <p className="font-medium">Activer le bonus de partage</p>
              <p className="text-sm text-muted-foreground">1 partage = bonus débloqué</p>
            </div>
            <Switch checked={viralityEnabled} onCheckedChange={setViralityEnabled} />
          </div>

          {viralityEnabled && (
            <div className="space-y-2">
              <Label>Bonus offert après partage</Label>
              <Input
                placeholder="Ex: Checklist des 10 étapes pour lancer ton business"
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Génération en cours...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" /> Générer le quiz
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // STEP 2: Edit generated quiz
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setStep("choose")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">Modifier le quiz</h2>
            <p className="text-sm text-muted-foreground">Personnalise le contenu généré avant de publier</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleSave("draft")} disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" /> Brouillon
          </Button>
          <Button onClick={() => handleSave("active")} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
            Publier
          </Button>
        </div>
      </div>

      <Tabs defaultValue="content" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="content">Contenu</TabsTrigger>
          <TabsTrigger value="results">Résultats ({results.length})</TabsTrigger>
          <TabsTrigger value="settings">Paramètres</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label>Titre du quiz</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Introduction</Label>
            <Textarea value={introduction} onChange={(e) => setIntroduction(e.target.value)} rows={3} />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Questions ({questions.length})</h3>
              <Button variant="outline" size="sm" onClick={addQuestion}>
                <Plus className="w-4 h-4 mr-1" /> Question
              </Button>
            </div>

            {questions.map((q, qi) => (
              <Card key={qi} className="p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <GripVertical className="w-4 h-4 mt-3 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="shrink-0">
                        Q{qi + 1}
                      </Badge>
                      <Input
                        value={q.question_text}
                        onChange={(e) => updateQuestion(qi, "question_text", e.target.value)}
                        placeholder="Texte de la question"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeQuestion(qi)}
                        className="text-destructive shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid gap-2 pl-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-4">
                            {String.fromCharCode(65 + oi)}.
                          </span>
                          <Input
                            value={opt.text}
                            onChange={(e) => updateOption(qi, oi, "text", e.target.value)}
                            placeholder="Texte de l'option"
                            className="flex-1"
                          />
                          <Select
                            value={String(opt.result_index)}
                            onValueChange={(v) => updateOption(qi, oi, "result_index", parseInt(v))}
                          >
                            <SelectTrigger className="w-[160px] shrink-0">
                              <SelectValue placeholder="Profil →" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="-1">
                                <span className="text-muted-foreground">Aucun profil</span>
                              </SelectItem>
                              {results.map((r, ri) => (
                                <SelectItem key={ri} value={String(ri)}>
                                  Profil {ri + 1}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {q.options.length > 2 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const newOpts = q.options.filter((_, i) => i !== oi);
                                updateQuestion(qi, "options", newOpts);
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
                          const newOpts = [...q.options, { text: "", result_index: 0 }];
                          updateQuestion(qi, "options", newOpts);
                        }}
                        className="text-xs"
                      >
                        <Plus className="w-3 h-3 mr-1" /> Option
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="results" className="space-y-4 mt-4">
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
          {results.map((r, ri) => (
            <Card key={ri} className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Badge className="whitespace-nowrap shrink-0">Profil {ri + 1}</Badge>
                <Input
                  value={r.title}
                  onChange={(e) => updateResult(ri, "title", e.target.value)}
                  placeholder="Nom du profil"
                  className="font-bold flex-1"
                />
                {results.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={() => {
                      const removedIdx = ri;
                      setResults((prev) => prev.filter((_, i) => i !== removedIdx));
                      // Remap result_index in all question options
                      setQuestions((prev) =>
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
                <Label className="text-xs text-muted-foreground">Description</Label>
                <Textarea
                  value={r.description || ""}
                  onChange={(e) => updateResult(ri, "description", e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Insight (prise de conscience)</Label>
                <Textarea
                  value={r.insight || ""}
                  onChange={(e) => updateResult(ri, "insight", e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Projection</Label>
                <Textarea
                  value={r.projection || ""}
                  onChange={(e) => updateResult(ri, "projection", e.target.value)}
                  rows={2}
                />
              </div>
              {ctaPerResult && (
                <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-dashed">
                  <Label className="text-xs text-muted-foreground font-medium">CTA pour ce profil</Label>
                  <Input
                    value={r.cta_text || ""}
                    onChange={(e) => updateResult(ri, "cta_text", e.target.value)}
                    placeholder="Texte du bouton (ex: Réserve ton appel)"
                  />
                  <Input
                    value={r.cta_url || ""}
                    onChange={(e) => updateResult(ri, "cta_url", e.target.value)}
                    placeholder="URL du lien (https://...)"
                  />
                </div>
              )}
              <div className="space-y-1 pt-2 border-t">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  Tag Systeme.io
                  <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">optionnel</span>
                </Label>
                {renderTagPicker(
                  `result-${ri}`,
                  r.sio_tag_name ?? "",
                  (v) => updateResult(ri, "sio_tag_name", v || null),
                )}
                <p className="text-[10px] text-muted-foreground">
                  Quand un visiteur obtient ce profil, ce tag sera appliqué dans Systeme.io.
                </p>
              </div>
            </Card>
          ))}

          <Button
            variant="outline"
            onClick={() => {
              setResults((prev) => {
                const newIdx = prev.length;
                // Auto-add option for new profile in each question
                setQuestions((qPrev) =>
                  qPrev.map((q) => ({
                    ...q,
                    options: [...q.options, { text: "", result_index: newIdx }],
                  })),
                );
                return [
                  ...prev,
                  {
                    title: "",
                    description: null,
                    insight: null,
                    projection: null,
                    cta_text: null,
                    cta_url: null,
                    sio_tag_name: null,
                    sort_order: newIdx,
                  },
                ];
              });
            }}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" /> Ajouter un profil résultat
          </Button>

          {/* Systeme.io explanation */}
          <Card className="p-4 space-y-3 border-primary/20 bg-primary/[0.02]">
            <div className="flex items-start gap-3">
              <Upload className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h4 className="font-bold text-sm">Automatisation Systeme.io</h4>
                <p className="text-xs text-muted-foreground">
                  Tipote envoie automatiquement chaque lead vers ton Systeme.io avec le bon tag.
                </p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/60 border text-xs space-y-1.5">
              <p className="font-medium text-foreground flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-primary" /> Comment ça marche
              </p>
              <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground ml-0.5">
                <li>Configure ta clé API dans <a href="/settings?tab=settings" className="underline text-primary">Réglages</a></li>
                <li>Assigne un tag par profil résultat ci-dessus</li>
                <li>Dans Systeme.io, crée une automatisation : &quot;Quand le tag X est ajouté → envoyer la séquence email Y&quot;</li>
              </ol>
            </div>

            {viralityEnabled && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  Tag &quot;Quiz partagé&quot;
                  <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">bonus</span>
                </Label>
                {renderTagPicker("share", sioShareTagName, setSioShareTagName)}
                <p className="text-[10px] text-muted-foreground">
                  Ce tag sera ajouté quand un visiteur partage le quiz. Crée une automatisation dans Systeme.io pour envoyer le bonus.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                results.some((r) => r.sio_tag_name?.trim()) ? "bg-green-500" : "bg-amber-400"
              }`} />
              <p className="text-[10px] text-muted-foreground">
                {results.some((r) => r.sio_tag_name?.trim())
                  ? `${results.filter((r) => r.sio_tag_name?.trim()).length}/${results.length} profils ont un tag`
                  : "Aucun tag configuré — les leads ne seront pas envoyés vers Systeme.io (tu pourras le faire plus tard)"}
              </p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4 mt-4">
          {!ctaPerResult ? (
            <>
              <div className="space-y-2">
                <Label>CTA principal (texte du bouton)</Label>
                <Input
                  value={ctaText}
                  onChange={(e) => setCtaText(e.target.value)}
                  placeholder="Ex: Réserve ton appel"
                />
              </div>
              <div className="space-y-2">
                <Label>URL du CTA</Label>
                <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://..." />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/50 border">
              Les CTA sont configurés individuellement sur chaque profil résultat dans l&apos;onglet Résultats.
            </p>
          )}
          <div className="space-y-2">
            <Label>Texte de consentement</Label>
            <Textarea value={consentText} onChange={(e) => setConsentText(e.target.value)} rows={2} />
          </div>

          <div className="p-4 rounded-lg border space-y-3">
            <p className="font-medium">Page de capture email</p>
            <p className="text-sm text-muted-foreground">Personnalise le texte affiché avant la saisie de l&apos;email.</p>
            <div className="space-y-2">
              <Label>Titre de la page de capture</Label>
              <Input
                value={captureHeading}
                onChange={(e) => setCaptureHeading(e.target.value)}
                placeholder="Ton résultat est prêt !"
              />
            </div>
            <div className="space-y-2">
              <Label>Sous-titre / texte d&apos;accroche</Label>
              <Textarea
                value={captureSubtitle}
                onChange={(e) => setCaptureSubtitle(e.target.value)}
                rows={3}
                placeholder="Entre ton email pour découvrir ton profil.&#10;&#10;Tu peux ajouter plusieurs lignes ici pour donner envie."
              />
              <p className="text-xs text-muted-foreground">Les sauts de ligne seront préservés.</p>
            </div>

            <div className="space-y-3 pt-3 border-t">
              <p className="text-sm font-medium">Champs à capturer</p>
              <p className="text-xs text-muted-foreground">L&apos;email est toujours requis. Active les champs supplémentaires que tu veux collecter.</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Prénom</span>
                  <Switch checked={captureFirstName} onCheckedChange={setCaptureFirstName} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Nom de famille</span>
                  <Switch checked={captureLastName} onCheckedChange={setCaptureLastName} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Téléphone</span>
                  <Switch checked={capturePhone} onCheckedChange={setCapturePhone} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Pays</span>
                  <Switch checked={captureCountry} onCheckedChange={setCaptureCountry} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Ces informations seront envoyées automatiquement dans Systeme.io.</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div>
              <p className="font-medium">Bonus de partage</p>
              <p className="text-sm text-muted-foreground">Active pour inciter au partage viral</p>
            </div>
            <Switch checked={viralityEnabled} onCheckedChange={setViralityEnabled} />
          </div>

          {viralityEnabled && (
            <>
              <div className="space-y-2">
                <Label>Description du bonus</Label>
                <Textarea
                  value={bonusDescription}
                  onChange={(e) => setBonusDescription(e.target.value)}
                  rows={2}
                  placeholder="Ce que la personne reçoit"
                />
              </div>
              <div className="space-y-2">
                <Label>Message d&apos;incitation au partage</Label>
                <Textarea
                  value={shareMessage}
                  onChange={(e) => setShareMessage(e.target.value)}
                  rows={2}
                />
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
