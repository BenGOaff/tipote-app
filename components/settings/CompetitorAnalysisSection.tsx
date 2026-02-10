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
  positioning?: string;
  value_proposition?: string;
  main_offers?: Array<{ name: string; price: string; description: string }>;
  strengths?: string[];
  weaknesses?: string[];
  channels?: string[];
  target_audience?: string;
  content_strategy?: string;
  missing_info?: string[];
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

  // Launch AI research
  const launchResearch = () => {
    startResearchTransition(async () => {
      try {
        const cleaned = competitors.filter((c) => c.name.trim());
        const res = await fetch("/api/competitor-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ competitors: cleaned }),
        });
        const json = (await res.json().catch(() => null)) as any;

        if (!json?.ok) {
          if (json?.error === "NO_CREDITS") {
            toast({
              title: "Credits insuffisants",
              description: "L'analyse concurrentielle coute 1 credit. Rechargez vos credits.",
              variant: "destructive",
            });
            return;
          }
          throw new Error(json?.error || "Erreur");
        }

        setAnalysis(json.analysis);
        setShowResults(true);
        toast({ title: "Analyse concurrentielle terminee" });
      } catch (e: any) {
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
              title: "Credits insuffisants",
              description: "L'import de document coute 1 credit.",
              variant: "destructive",
            });
            return;
          }
          throw new Error(json?.error || "Erreur");
        }

        setAnalysis(json.analysis);
        if (Array.isArray(json.analysis.competitors) && json.analysis.competitors.length >= 2) {
          setCompetitors(json.analysis.competitors);
        }
        setShowResults(true);
        toast({ title: "Document importe et analyse" });
      } catch (err: any) {
        toast({
          title: "Erreur lors de l'import",
          description: err?.message ?? "Erreur inconnue",
          variant: "destructive",
        });
      } finally {
        setUploading(false);
        // Reset input
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
        toast({ title: "Resume mis a jour" });
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
          Renseigne de 2 a 5 concurrents. L&apos;IA analysera leur positionnement, offres et strategie
          pour t&apos;aider a te differencier.
        </p>

        <div className="space-y-4">
          {competitors.map((comp, idx) => (
            <div key={idx} className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-medium">Concurrent {idx + 1}</Label>
                {competitors.length > 2 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCompetitor(idx)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nom *</Label>
                  <Input
                    placeholder="Ex: Jasper AI, Copy.ai..."
                    value={comp.name}
                    onChange={(e) => updateCompetitor(idx, "name", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Site web (optionnel)</Label>
                  <Input
                    placeholder="https://..."
                    value={comp.website}
                    onChange={(e) => updateCompetitor(idx, "website", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Notes (ce que tu sais deja sur ce concurrent)
                </Label>
                <Textarea
                  placeholder="Informations complementaires..."
                  value={comp.notes}
                  onChange={(e) => updateCompetitor(idx, "notes", e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>
          ))}

          {competitors.length < 5 && (
            <Button variant="outline" size="sm" onClick={addCompetitor} className="gap-1">
              <Plus className="w-4 h-4" />
              Ajouter un concurrent
            </Button>
          )}
        </div>

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
            {researching ? "Analyse en cours..." : "Lancer l'analyse IA"}
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
          Cout : 1 credit par analyse. Formats acceptes : TXT, PDF, DOCX, MD (max 5 Mo).
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
                <h3 className="text-lg font-bold">Synthese concurrentielle</h3>
              </div>
              {analysis.updated_at && (
                <span className="text-xs text-muted-foreground">
                  Mis a jour le{" "}
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
                  {analysis.summary || "Aucune synthese disponible."}
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
                  Modifier la synthese
                </Button>
              </div>
            )}

            {analysis.uploaded_document_summary && (
              <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Document importe :
                </p>
                <p className="text-sm">{analysis.uploaded_document_summary}</p>
              </div>
            )}
          </Card>

          {/* SWOT-style cards */}
          <div className="grid md:grid-cols-3 gap-4">
            {/* Strengths */}
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

            {/* Weaknesses */}
            {analysis.weaknesses && analysis.weaknesses.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingDown className="w-4 h-4 text-orange-600" />
                  <h4 className="font-semibold text-orange-700">A ameliorer</h4>
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

            {/* Opportunities */}
            {analysis.opportunities && analysis.opportunities.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-blue-600" />
                  <h4 className="font-semibold text-blue-700">Opportunites</h4>
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

          {/* Competitor Details (expandable) */}
          {analysis.competitor_details &&
            Object.keys(analysis.competitor_details).length > 0 && (
              <Card className="p-6">
                <h4 className="font-semibold mb-4">Detail par concurrent</h4>
                <div className="space-y-3">
                  {Object.entries(analysis.competitor_details).map(([name, detail]) => {
                    const d = detail as CompetitorDetail;
                    const isExpanded = expandedCompetitor === name;
                    return (
                      <div key={name} className="border rounded-lg">
                        <button
                          className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
                          onClick={() =>
                            setExpandedCompetitor(isExpanded ? null : name)
                          }
                        >
                          <span className="font-medium">{name}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-3">
                            {d.positioning && (
                              <div>
                                <Label className="text-xs text-muted-foreground">
                                  Positionnement
                                </Label>
                                <p className="text-sm">{d.positioning}</p>
                              </div>
                            )}
                            {d.value_proposition && (
                              <div>
                                <Label className="text-xs text-muted-foreground">
                                  Proposition de valeur
                                </Label>
                                <p className="text-sm">{d.value_proposition}</p>
                              </div>
                            )}
                            {d.main_offers && d.main_offers.length > 0 && (
                              <div>
                                <Label className="text-xs text-muted-foreground">
                                  Offres principales
                                </Label>
                                <div className="space-y-1 mt-1">
                                  {d.main_offers.map((offer, i) => (
                                    <div
                                      key={i}
                                      className="text-sm flex items-center gap-2"
                                    >
                                      <Badge variant="outline" className="text-xs">
                                        {offer.price || "?"}
                                      </Badge>
                                      <span className="font-medium">{offer.name}</span>
                                      {offer.description && (
                                        <span className="text-muted-foreground">
                                          — {offer.description}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {d.target_audience && (
                              <div>
                                <Label className="text-xs text-muted-foreground">
                                  Audience cible
                                </Label>
                                <p className="text-sm">{d.target_audience}</p>
                              </div>
                            )}
                            {d.channels && d.channels.length > 0 && (
                              <div>
                                <Label className="text-xs text-muted-foreground">
                                  Canaux
                                </Label>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {d.channels.map((ch, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      {ch}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {d.strengths && d.strengths.length > 0 && (
                              <div>
                                <Label className="text-xs text-green-600">Points forts</Label>
                                <ul className="text-sm space-y-1 mt-1">
                                  {d.strengths.map((s, i) => (
                                    <li key={i}>+ {s}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {d.weaknesses && d.weaknesses.length > 0 && (
                              <div>
                                <Label className="text-xs text-orange-600">
                                  Points faibles
                                </Label>
                                <ul className="text-sm space-y-1 mt-1">
                                  {d.weaknesses.map((w, i) => (
                                    <li key={i}>- {w}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {d.content_strategy && (
                              <div>
                                <Label className="text-xs text-muted-foreground">
                                  Strategie de contenu
                                </Label>
                                <p className="text-sm">{d.content_strategy}</p>
                              </div>
                            )}
                            {d.missing_info && d.missing_info.length > 0 && (
                              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                <div className="flex items-center gap-1 mb-1">
                                  <AlertCircle className="w-3 h-3 text-yellow-600" />
                                  <Label className="text-xs text-yellow-700">
                                    Informations manquantes
                                  </Label>
                                </div>
                                <ul className="text-xs text-yellow-700 space-y-0.5">
                                  {d.missing_info.map((m, i) => (
                                    <li key={i}>- {m}</li>
                                  ))}
                                </ul>
                                <p className="text-xs text-yellow-600 mt-2">
                                  Tu peux completer ces infos dans les notes du concurrent
                                  ci-dessus et relancer l&apos;analyse.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
        </>
      )}
    </div>
  );
}
