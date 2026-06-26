"use client";

// components/quiz/SurveyResultsPanel.tsx
//
// Panneau affiché dans le tab "Résultats" d'un SONDAGE (mode='survey')
// côté créateur. Deux blocs :
//   1. Export : CSV (réponses brutes) + PDF (rapport agrégé, jspdf
//      client-side).
//   2. Analyse IA : génère une lecture exploitable (ce que disent les
//      résultats, enseignements, actions). Min 5 réponses. 1 crédit à
//      la 1ère génération, re-runs gratuits.
//
// Tout est additif : ce composant n'est monté QUE pour les sondages,
// il ne touche pas au rendu quiz classique.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, FileSpreadsheet, Sparkles, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatSurveyAnswer,
  indexAnswers,
  type SurveyAnswerLike,
  type SurveyQuestionLike,
} from "@/lib/survey/format";
import { stripHtml } from "@/lib/richText";

type ResultsLead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  flagged?: boolean | null;
  answers: SurveyAnswerLike[] | null;
  created_at: string;
};

interface AnalysisResult {
  summary: string;
  takeaways: string[];
  actions: string[];
  generated_at?: string;
}

interface AnalysisState {
  analysis: AnalysisResult | null;
  totalResponses: number;
  minResponses: number;
  hasEnough: boolean;
  cost: number;
}

export default function SurveyResultsPanel({
  quizId,
  surveyTitle,
  leads,
  questions,
  locale,
}: {
  quizId: string;
  surveyTitle: string;
  /** Réponses brutes par répondant : alimentent le détail du PDF. */
  leads?: ResultsLead[];
  questions?: SurveyQuestionLike[];
  locale?: string | null;
}) {
  const [state, setState] = useState<AnalysisState | null>(null);
  const [generating, setGenerating] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Charge l'état initial (analyse existante + nb réponses + coût).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/quiz/${quizId}/survey-analysis`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.ok) return;
        setState({
          analysis: d.analysis ?? null,
          totalResponses: d.totalResponses ?? 0,
          minResponses: d.minResponses ?? 5,
          hasEnough: !!d.hasEnough,
          cost: d.cost ?? 1,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  const handleExportCsv = useCallback(() => {
    // Téléchargement direct — la route renvoie un attachment.
    window.location.href = `/api/quiz/${quizId}/survey-results?format=csv`;
  }, [quizId]);

  const handleExportExcel = useCallback(() => {
    window.location.href = `/api/quiz/${quizId}/survey-results?format=xlsx`;
  }, [quizId]);

  // Détail par répondant pour le PDF (qui a répondu quoi), construit depuis
  // les réponses brutes via le helper partagé. Vide si les props ne sont pas
  // passées (rétro-compat).
  const buildRespondents = useCallback(() => {
    if (!leads || !questions) return [];
    return leads.map((l) => ({
      name: [l.first_name, l.last_name].filter(Boolean).join(" ").trim(),
      email: l.email ?? "",
      date: l.created_at ? new Date(l.created_at).toLocaleDateString("fr-FR") : "",
      flagged: !!l.flagged,
      answers: (() => {
        const byQ = indexAnswers(l.answers);
        return questions
          .map((q, qi) => ({
            q: stripHtml(String(q.question_text ?? "")).trim() || `Q${qi + 1}`,
            a: formatSurveyAnswer(q, byQ.get(qi), locale),
          }))
          .filter((x) => x.a);
      })(),
    }));
  }, [leads, questions, locale]);

  const handleExportPdf = useCallback(async () => {
    setExportingPdf(true);
    try {
      const res = await fetch(`/api/quiz/${quizId}/survey-results?format=json`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        toast.error("Impossible de charger les résultats.");
        return;
      }

      // jspdf + renderer chargés en dynamic import (client-only).
      const [{ jsPDF }, { renderSurveyPdf, BRAND_TIPOTE }] = await Promise.all([
        import("jspdf"),
        import("@/lib/survey/pdfReport"),
      ]);
      const doc = new jsPDF({ unit: "pt", format: "a4" });

      renderSurveyPdf(
        doc,
        {
          title: String(data.title ?? surveyTitle),
          totalResponses: data.totalResponses ?? 0,
          questions: data.questions ?? [],
          // On embarque l'analyse IA déjà chargée dans l'état (zéro
          // round-trip supplémentaire ; absente si jamais générée).
          analysis: state?.analysis ?? null,
          respondents: buildRespondents(),
        },
        BRAND_TIPOTE,
      );

      const safe = String(data.title ?? "sondage").replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
      doc.save(`${safe}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error("[survey pdf]", err);
      toast.error("Erreur lors de la génération du PDF.");
    } finally {
      setExportingPdf(false);
    }
  }, [quizId, surveyTitle, state?.analysis, buildRespondents]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/quiz/${quizId}/survey-analysis`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (data?.error === "NOT_ENOUGH_RESPONSES") {
          toast.error(data.message ?? "Pas assez de réponses pour une analyse pertinente.");
        } else if (data?.error === "NO_CREDITS") {
          toast.error(data.message ?? "Tu n'as plus de crédits IA.");
        } else {
          toast.error("L'analyse a échoué. Réessaie dans un instant.");
        }
        return;
      }
      setState((prev) =>
        prev ? { ...prev, analysis: data.analysis, cost: 0 } : prev,
      );
      toast.success("Analyse prête !");
    } catch {
      toast.error("Erreur réseau.");
    } finally {
      setGenerating(false);
    }
  }, [quizId]);

  return (
    <div className="space-y-4">
      {/* Export */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <Download className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Exporter les résultats</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Au choix : CSV ou Excel (une ligne par répondant, colonnes prêtes :
          identité + réponses), ou PDF (rapport agrégé + détail des répondants,
          prêt à présenter).
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="w-4 h-4 mr-1.5" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="w-4 h-4 mr-1.5" />
            Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={exportingPdf}>
            {exportingPdf ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 mr-1.5" />
            )}
            Export PDF
          </Button>
        </div>
      </Card>

      {/* Analyse IA */}
      <Card className="p-5 border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/30 dark:bg-indigo-950/15">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
          <h3 className="text-sm font-semibold">Analyse IA des résultats</h3>
        </div>

        {state && !state.hasEnough && !state.analysis ? (
          <p className="text-sm text-muted-foreground mt-1">
            Il n&apos;y a pas assez de réponses pour une analyse pertinente
            ({state.totalResponses}/{state.minResponses}). Reviens quand tu auras
            au moins {state.minResponses} réponses.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-3">
              Ce que disent vraiment tes résultats, ce qu&apos;il faut en retenir,
              et les actions à mettre en place.
              {state && state.cost > 0
                ? " La première analyse coûte 1 crédit IA — les mises à jour sont gratuites."
                : " Mise à jour gratuite."}
            </p>

            {state?.analysis && (
              <div className="space-y-3 mb-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Ce que disent les résultats
                  </p>
                  <p className="text-sm mt-1">{state.analysis.summary}</p>
                </div>
                {state.analysis.takeaways.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      À retenir
                    </p>
                    <ul className="mt-1 space-y-1">
                      {state.analysis.takeaways.map((t, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {state.analysis.actions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Actions à mettre en place
                    </p>
                    <ul className="mt-1 space-y-1">
                      {state.analysis.actions.map((a, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="mt-0.5 text-indigo-500 shrink-0">{i + 1}.</span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={generating || (!state?.hasEnough && !state?.analysis)}
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Analyse en cours…
                </>
              ) : state?.analysis ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  Mettre à jour l&apos;analyse
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  Lancer l&apos;analyse
                  {state && state.cost > 0 ? " (1 crédit)" : ""}
                </>
              )}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
