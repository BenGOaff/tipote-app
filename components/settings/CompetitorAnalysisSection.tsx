// components/settings/CompetitorAnalysisSection.tsx
"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Search,
  Plus,
  Trash2,
  Save,
  Upload,
  ChevronDown,
  ChevronUp,
  Target,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  FileText,
  Loader2,
  AlertCircle,
  Zap,
  MessageSquare,
  ShoppingBag,
  Users,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type CompetitorInput = {
  name: string;
  website: string;
  notes: string;
};

type CompetitorDetail = {
  // Profile
  positioning?: string;
  value_proposition?: string;
  main_offers?: Array<{ name: string; price: string; description: string }>;
  strengths?: string[];
  weaknesses?: string[];
  channels?: string[];
  target_audience?: string;
  content_strategy?: string;
  keywords?: string[];
  missing_info?: string[];
  // Face-à-face
  user_advantages?: string[];
  user_disadvantages?: string[];
  key_differences_summary?: string;
  // Actions
  differentiation_strategy?: string;
  communication_focus?: string[];
  offer_improvements?: string[];
};

type AnalysisData = {
  competitors?: CompetitorInput[];
  competitor_details?: Record<string, CompetitorDetail>;
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  opportunities?: string[];
  positioning_matrix?: string;
  uploaded_document_summary?: string;
  status?: string;
  updated_at?: string;
};

export default function CompetitorAnalysisSection() {
  const { toast } = useToast();

  // State
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [competitors, setCompetitors] = useState<CompetitorInput[]>([
    { name: "", website: "", notes: "" },
    { name: "", website: "", notes: "" },
  ]);
  const [researching, startResearchTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [expandedCompetitor, setExpandedCompetitor] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [editedSummary, setEditedSummary] = useState("");
  const [savingSummary, startSummarySave] = useTransition();

  // Load existing analysis
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/competitor-analysis", { method: "GET" });
        const json = (await res.json().catch(() => null)) as any;
        if (cancelled) return;
        if (json?.ok && json.analysis) {
          setAnalysis(json.analysis);
          if (Array.isArray(json.analysis.competitors) && json.analysis.competitors.length >= 2) {
            setCompetitors(json.analysis.competitors);
          }
          if (json.analysis.status === "completed") {
            setShowResults(true);
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error("Failed to load competitor analysis:", e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Competitor input management
  const addCompetitor = () => {
    if (competitors.length >= 5) return;
    setCompetitors((prev) => [...prev, { name: "", website: "", notes: "" }]);
  };

  const removeCompetitor = (idx: number) => {
    if (competitors.length <= 2) return;
    setCompetitors((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCompetitor = (idx: number, field: keyof CompetitorInput, value: string) => {
    setCompetitors((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  };

  const canResearch = useMemo(() => {
    const valid = competitors.filter((c) => c.name.trim().length > 0);
    return valid.length >= 2;
  }, [competitors]);

  // Progress message during SSE streaming
  const [progressMsg, setProgressMsg] = useState("");

  // Launch AI research (reads SSE stream to prevent 504 timeout)
  const launchResearch = () => {
    startResearchTransition(async () => {
      try {
        const cleaned = competitors.filter((c) => c.name.trim());
        setProgressMsg("Lancement de l'analyse...");

        const res = await fetch("/api/competitor-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ competitors: cleaned }),
        });

        // Handle non-SSE error responses (auth, validation, etc.)
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const json = await res.json();
          if (json?.error === "NO_CREDITS") {
            toast({
              title: "Crédits insuffisants",
              description: "L'analyse concurrentielle coûte 1 crédit. Rechargez vos crédits.",
              variant: "destructive",
            });
            return;
          }
          throw new Error(json?.error || "Erreur");
        }

        // Read SSE stream
        const reader = res.body?.getReader();
        if (!reader) throw new Error("Stream non disponible");

        const decoder = new TextDecoder();
        let buffer = "";
        let finalResult: any = null;
        let finalError: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const eventBlock of events) {
            const lines = eventBlock.split("\n");
            let eventType = "";
            let eventData = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) eventType = line.slice(7);
              if (line.startsWith("data: ")) eventData = line.slice(6);
            }
            if (!eventData) continue;

            try {
              const parsed = JSON.parse(eventData);
              if (eventType === "progress") {
                setProgressMsg(parsed.step || "Analyse en cours...");
              } else if (eventType === "result") {
                finalResult = parsed;
              } else if (eventType === "error") {
                finalError = parsed.error || "Erreur inconnue";
              }
            } catch { /* skip malformed events */ }
          }
        }

        setProgressMsg("");

        if (finalError) {
          if (finalError === "NO_CREDITS") {
            toast({
              title: "Crédits insuffisants",
              description: "L'analyse concurrentielle coûte 1 crédit.",
              variant: "destructive",
            });
            return;
          }
          throw new Error(finalError);
        }

        if (finalResult?.ok && finalResult.analysis) {
          setAnalysis(finalResult.analysis);
          setShowResults(true);
          toast({ title: "Analyse concurrentielle terminée ✓" });
        } else {
          throw new Error("Aucun résultat reçu");
        }
      } catch (e: any) {
        setProgressMsg("");
        toast({
          title: "Erreur lors de l'analyse",
          description: e?.message ?? "Erreur inconnue",
          variant: "destructive",
        });
      }
    });
  };

  // Upload document
  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/competitor-analysis/upload", {
          method: "POST",
          body: formData,
        });
        const json = (await res.json().catch(() => null)) as any;

        if (!json?.ok) {
          if (json?.error === "NO_CREDITS") {
            toast({
              title: "Crédits insuffisants",
              description: "L'import de document coûte 1 crédit.",
              variant: "destructive",
            });
            return;
          }
          throw new Error(json?.error || "Erreur");
        }

        setAnalysis(json.analysis);
        if (Array.isArray(json.analysis?.competitors) && json.analysis.competitors.length >= 2) {
          setCompetitors(json.analysis.competitors);
        }
        // Don't show results yet — user must click "Lancer l'analyse IA" to get the full report
        setShowResults(false);
        toast({
          title: "Document importé ✓",
          description: "Concurrents pré-remplis depuis le doc. Lance l'analyse IA pour obtenir ton rapport.",
        });
      } catch (err: any) {
        toast({
          title: "Erreur lors de l'import",
          description: err?.message ?? "Erreur inconnue",
          variant: "destructive",
        });
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [toast],
  );

  // Save edited summary
  const saveSummary = () => {
    startSummarySave(async () => {
      try {
        const res = await fetch("/api/competitor-analysis", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ summary: editedSummary }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!json?.ok) throw new Error(json?.error || "Erreur");

        setAnalysis((prev) => (prev ? { ...prev, summary: editedSummary } : prev));
        setEditingSummary(false);
        toast({ title: "Résumé mis à jour" });
      } catch (e: any) {
        toast({
          title: "Erreur",
          description: e?.message ?? "Impossible de sauvegarder",
          variant: "destructive",
        });
      }
    });
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Chargement de l&apos;analyse concurrentielle...</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Competitor Input Form */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-2">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">Analyse des concurrents</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Renseigne de 2 à 5 concurrents. L&apos;IA analysera leur positionnement, offres et stratégie
          pour t&apos;aider à te différencier et identifier tes avantages concurrentiels.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {competitors.map((comp, idx) => (
            <div key={idx} className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-medium text-sm">Concurrent {idx + 1}</Label>
                {competitors.length > 2 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCompetitor(idx)}
                    className="text-muted-foreground hover:text-destructive h-7 w-7 p-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nom *</Label>
                  <Input
                    placeholder="Ex: Jasper AI..."
                    value={comp.name}
                    onChange={(e) => updateCompetitor(idx, "name", e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Site web</Label>
                  <Input
                    placeholder="https://..."
                    value={comp.website}
                    onChange={(e) => updateCompetitor(idx, "website", e.target.value)}
                    className="text-sm break-all"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Notes / Points forts / Points faibles
                  </Label>
                  <Textarea
                    placeholder="Ce que tu sais déjà sur ce concurrent..."
                    value={comp.notes}
                    onChange={(e) => updateCompetitor(idx, "notes", e.target.value)}
                    rows={3}
                    className="resize-none text-sm"
                  />
                </div>
              </div>
            </div>
          ))}

          {competitors.length < 5 && (
            <div className="flex items-center justify-center border border-dashed rounded-lg min-h-[200px]">
              <Button variant="ghost" size="sm" onClick={addCompetitor} className="gap-1 text-muted-foreground">
                <Plus className="w-4 h-4" />
                Ajouter un concurrent
              </Button>
            </div>
          )}
        </div>

        {/* Document imported indicator */}
        {analysis?.uploaded_document_summary && analysis?.status === "draft" && (
          <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <FileText className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                Document importé — contexte chargé ✓
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-300 mt-0.5">
                L&apos;analyse IA utilisera le contenu de ton document en plus des informations saisies ci-dessus.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 mt-6">
          <Button
            onClick={launchResearch}
            disabled={!canResearch || researching}
            className="gap-2"
          >
            {researching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            {researching ? (progressMsg || "Analyse en cours...") : "Lancer l'analyse IA"}
          </Button>

          <div className="relative">
            <input
              type="file"
              accept=".txt,.pdf,.docx,.md"
              onChange={handleUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={uploading}
            />
            <Button variant="outline" className="gap-2" disabled={uploading}>
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {uploading ? "Import en cours..." : "Importer un document"}
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Coût : 1 crédit par analyse. Formats acceptés : TXT, PDF, DOCX, MD (max 5 Mo).
        </p>
      </Card>

      {/* Results */}
      {analysis && showResults && (
        <>
          {/* Summary */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-bold">Synthèse concurrentielle</h3>
              </div>
              {analysis.updated_at && (
                <span className="text-xs text-muted-foreground">
                  Mis à jour le{" "}
                  {new Date(analysis.updated_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>

            {editingSummary ? (
              <div className="space-y-3">
                <Textarea
                  value={editedSummary}
                  onChange={(e) => setEditedSummary(e.target.value)}
                  rows={8}
                  className="resize-none"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveSummary} disabled={savingSummary}>
                    <Save className="w-4 h-4 mr-1" />
                    {savingSummary ? "Sauvegarde..." : "Sauvegarder"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingSummary(false)}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {analysis.summary || "Aucune synthèse disponible."}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-muted-foreground"
                  onClick={() => {
                    setEditedSummary(analysis.summary || "");
                    setEditingSummary(true);
                  }}
                >
                  Modifier la synthèse
                </Button>
              </div>
            )}

            {analysis.uploaded_document_summary && (
              <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Document importé :
                </p>
                <p className="text-sm">{analysis.uploaded_document_summary}</p>
              </div>
            )}
          </Card>

          {/* SWOT-style cards */}
          <div className="grid md:grid-cols-3 gap-4">
            {analysis.strengths && analysis.strengths.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <h4 className="font-semibold text-green-700">Tes forces</h4>
                </div>
                <ul className="space-y-2">
                  {analysis.strengths.map((s, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-green-500 mt-0.5 flex-shrink-0">+</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {analysis.weaknesses && analysis.weaknesses.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingDown className="w-4 h-4 text-orange-600" />
                  <h4 className="font-semibold text-orange-700">À améliorer</h4>
                </div>
                <ul className="space-y-2">
                  {analysis.weaknesses.map((w, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-orange-500 mt-0.5 flex-shrink-0">-</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {analysis.opportunities && analysis.opportunities.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-blue-600" />
                  <h4 className="font-semibold text-blue-700">Opportunités</h4>
                </div>
                <ul className="space-y-2">
                  {analysis.opportunities.map((o, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-blue-500 mt-0.5 flex-shrink-0">*</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          {/* Positioning Matrix */}
          {analysis.positioning_matrix && (
            <Card className="p-6">
              <h4 className="font-semibold mb-3">Matrice de positionnement</h4>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {analysis.positioning_matrix}
              </p>
            </Card>
          )}

          {/* Per-Competitor Detail Cards */}
          {analysis.competitor_details &&
            Object.keys(analysis.competitor_details).length > 0 && (
              <div className="space-y-4">
                <h4 className="font-semibold text-base px-1">Analyse par concurrent</h4>
                {Object.entries(analysis.competitor_details).map(([name, detail]) => {
                  const d = detail as CompetitorDetail;
                  const isExpanded = expandedCompetitor === name;
                  return (
                    <Card key={name} className="overflow-hidden">
                      {/* Card Header */}
                      <button
                        className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition-colors"
                        onClick={() => setExpandedCompetitor(isExpanded ? null : name)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-primary">
                              {name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <span className="font-semibold">{name}</span>
                            {d.target_audience && (
                              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {d.target_audience}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {d.user_advantages && d.user_advantages.length > 0 && (
                            <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 text-xs hidden sm:flex">
                              +{d.user_advantages.length} avantages
                            </Badge>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t">
                          {/* Section 1 — Leur profil */}
                          <div className="p-5 space-y-4">
                            <div className="flex items-center gap-2 mb-3">
                              <Target className="w-4 h-4 text-muted-foreground" />
                              <h5 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                                Leur profil
                              </h5>
                            </div>

                            {d.positioning && (
                              <div>
                                <Label className="text-xs text-muted-foreground">Positionnement</Label>
                                <p className="text-sm mt-1">{d.positioning}</p>
                              </div>
                            )}

                            {d.value_proposition && (
                              <div>
                                <Label className="text-xs text-muted-foreground">Proposition de valeur</Label>
                                <p className="text-sm mt-1">{d.value_proposition}</p>
                              </div>
                            )}

                            {d.main_offers && d.main_offers.length > 0 && (
                              <div>
                                <Label className="text-xs text-muted-foreground">Offres principales</Label>
                                <div className="space-y-1.5 mt-1">
                                  {d.main_offers.map((offer, i) => (
                                    <div key={i} className="text-sm flex items-start gap-2">
                                      <Badge variant="outline" className="text-xs mt-0.5 flex-shrink-0">
                                        {offer.price || "?"}
                                      </Badge>
                                      <div>
                                        <span className="font-medium">{offer.name}</span>
                                        {offer.description && (
                                          <span className="text-muted-foreground"> — {offer.description}</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="grid sm:grid-cols-2 gap-4">
                              {d.strengths && d.strengths.length > 0 && (
                                <div>
                                  <Label className="text-xs text-green-600">Points forts</Label>
                                  <ul className="text-sm space-y-1 mt-1">
                                    {d.strengths.map((s, i) => (
                                      <li key={i} className="flex gap-1.5">
                                        <span className="text-green-500 flex-shrink-0">+</span>
                                        <span>{s}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {d.weaknesses && d.weaknesses.length > 0 && (
                                <div>
                                  <Label className="text-xs text-orange-600">Points faibles</Label>
                                  <ul className="text-sm space-y-1 mt-1">
                                    {d.weaknesses.map((w, i) => (
                                      <li key={i} className="flex gap-1.5">
                                        <span className="text-orange-500 flex-shrink-0">-</span>
                                        <span>{w}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>

                            {d.channels && d.channels.length > 0 && (
                              <div>
                                <Label className="text-xs text-muted-foreground">Canaux</Label>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {d.channels.map((ch, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      {ch}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {d.content_strategy && (
                              <div>
                                <Label className="text-xs text-muted-foreground">Stratégie de contenu</Label>
                                <p className="text-sm mt-1">{d.content_strategy}</p>
                              </div>
                            )}

                            {d.missing_info && d.missing_info.length > 0 && (
                              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <AlertCircle className="w-3.5 h-3.5 text-yellow-600" />
                                  <Label className="text-xs text-yellow-700 font-medium">
                                    Informations manquantes
                                  </Label>
                                </div>
                                <ul className="text-xs text-yellow-700 space-y-0.5">
                                  {d.missing_info.map((m, i) => (
                                    <li key={i}>- {m}</li>
                                  ))}
                                </ul>
                                <p className="text-xs text-yellow-600 mt-2">
                                  Complète ces infos dans les notes ci-dessus et relance l&apos;analyse.
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Section 2 — Face-à-face */}
                          {(d.user_advantages?.length || d.user_disadvantages?.length || d.key_differences_summary) && (
                            <div className="p-5 space-y-4 border-t bg-slate-50/50 dark:bg-slate-900/30">
                              <div className="flex items-center gap-2 mb-3">
                                <TrendingUp className="w-4 h-4 text-primary" />
                                <h5 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                                  Face-à-face vs toi
                                </h5>
                              </div>

                              {d.key_differences_summary && (
                                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border text-sm leading-relaxed">
                                  {d.key_differences_summary}
                                </div>
                              )}

                              <div className="grid sm:grid-cols-2 gap-4">
                                {d.user_advantages && d.user_advantages.length > 0 && (
                                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                                      <Label className="text-xs font-semibold text-green-700 dark:text-green-400">
                                        Tu fais mieux
                                      </Label>
                                    </div>
                                    <ul className="space-y-1.5">
                                      {d.user_advantages.map((adv, i) => (
                                        <li key={i} className="text-sm text-green-800 dark:text-green-300 flex gap-1.5">
                                          <span className="flex-shrink-0 mt-0.5">✓</span>
                                          <span>{adv}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {d.user_disadvantages && d.user_disadvantages.length > 0 && (
                                  <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <XCircle className="w-4 h-4 text-orange-600" />
                                      <Label className="text-xs font-semibold text-orange-700 dark:text-orange-400">
                                        Ils font mieux
                                      </Label>
                                    </div>
                                    <ul className="space-y-1.5">
                                      {d.user_disadvantages.map((dis, i) => (
                                        <li key={i} className="text-sm text-orange-800 dark:text-orange-300 flex gap-1.5">
                                          <span className="flex-shrink-0 mt-0.5">!</span>
                                          <span>{dis}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Section 3 — Mes actions */}
                          {(d.differentiation_strategy || d.communication_focus?.length || d.offer_improvements?.length) && (
                            <div className="p-5 space-y-4 border-t bg-primary/5">
                              <div className="flex items-center gap-2 mb-3">
                                <Zap className="w-4 h-4 text-primary" />
                                <h5 className="font-semibold text-sm text-primary uppercase tracking-wide">
                                  Mes actions
                                </h5>
                              </div>

                              {d.differentiation_strategy && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <Target className="w-3.5 h-3.5 text-primary" />
                                    <Label className="text-xs font-semibold text-primary">
                                      Stratégie de différenciation
                                    </Label>
                                  </div>
                                  <p className="text-sm leading-relaxed">{d.differentiation_strategy}</p>
                                </div>
                              )}

                              {d.communication_focus && d.communication_focus.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <MessageSquare className="w-3.5 h-3.5 text-primary" />
                                    <Label className="text-xs font-semibold text-primary">
                                      Ce que je dois mettre en avant
                                    </Label>
                                  </div>
                                  <ul className="space-y-1.5">
                                    {d.communication_focus.map((msg, i) => (
                                      <li key={i} className="text-sm flex gap-2 p-2 bg-white dark:bg-slate-900 rounded border">
                                        <span className="text-primary font-bold flex-shrink-0">{i + 1}.</span>
                                        <span>{msg}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {d.offer_improvements && d.offer_improvements.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <ShoppingBag className="w-3.5 h-3.5 text-primary" />
                                    <Label className="text-xs font-semibold text-primary">
                                      Améliorations à apporter à mon offre
                                    </Label>
                                  </div>
                                  <ul className="space-y-1.5">
                                    {d.offer_improvements.map((imp, i) => (
                                      <li key={i} className="text-sm flex gap-2">
                                        <span className="text-primary flex-shrink-0 mt-0.5">→</span>
                                        <span>{imp}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
        </>
      )}
    </div>
  );
}
