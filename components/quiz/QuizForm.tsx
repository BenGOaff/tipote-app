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
} from "lucide-react";

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
  sort_order: number;
};

interface QuizFormProps {
  onClose: () => void;
}

export function QuizForm({ onClose }: QuizFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<"config" | "edit">("config");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Config step
  const [objective, setObjective] = useState("");
  const [target, setTarget] = useState("");
  const [tone, setTone] = useState("inspirant");
  const [cta, setCta] = useState("");
  const [bonus, setBonus] = useState("");
  const [questionCount, setQuestionCount] = useState("7");
  const [resultCount, setResultCount] = useState("3");
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
        }),
      });

      const json = await res.json();
      if (!json?.ok) {
        if (json?.error === "NO_CREDITS") {
          toast({
            title: "Crédits insuffisants",
            description: "La génération de quiz coûte 4 crédits.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(json?.error || "Erreur de génération");
      }

      const quiz = json.quiz;
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
          status,
          config_objective: objective,
          config_target: target,
          config_tone: tone,
          config_cta: cta,
          config_bonus: bonus,
          questions,
          results,
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

  // STEP 1: Config
  if (step === "config") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">Créer un Quiz Lead Magnet</h2>
            <p className="text-sm text-muted-foreground">
              L&apos;IA va générer un quiz complet à partir de tes paramètres
            </p>
          </div>
        </div>

        <div className="grid gap-4 max-w-xl">
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

          <div className="grid grid-cols-2 gap-4">
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
              <Select value={questionCount} onValueChange={setQuestionCount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 questions</SelectItem>
                  <SelectItem value="7">7 questions</SelectItem>
                  <SelectItem value="10">10 questions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
          <Button variant="ghost" size="icon" onClick={() => setStep("config")}>
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
                            <SelectTrigger className="w-40">
                              <SelectValue placeholder="Profil →" />
                            </SelectTrigger>
                            <SelectContent>
                              {results.map((r, ri) => (
                                <SelectItem key={ri} value={String(ri)}>
                                  {r.title || `Profil ${ri + 1}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
          {results.map((r, ri) => (
            <Card key={ri} className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Badge>Profil {ri + 1}</Badge>
                <Input
                  value={r.title}
                  onChange={(e) => updateResult(ri, "title", e.target.value)}
                  placeholder="Nom du profil"
                  className="font-bold"
                />
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
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">CTA personnalisé</Label>
                <Input
                  value={r.cta_text || ""}
                  onChange={(e) => updateResult(ri, "cta_text", e.target.value)}
                />
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4 mt-4">
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
          <div className="space-y-2">
            <Label>Texte de consentement</Label>
            <Textarea value={consentText} onChange={(e) => setConsentText(e.target.value)} rows={2} />
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
