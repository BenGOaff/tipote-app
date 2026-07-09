"use client";

// components/quiz/QuizInsightsPanel.tsx (Tipote)
//
// Analyse IA STRATÉGIQUE d'un quiz ou sondage : diagnostic funnel +
// capture + profil des visiteurs + axes d'amelioration + actions
// ventes/captures. Endpoint /api/quiz/[quizId]/insights. Gate par CREDIT
// (1 credit a la 1ere generation, MAJ gratuites). Style aligne sur le
// panneau d'analyse de sondage Tipote (accent indigo).

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, RefreshCw, TrendingUp, Users, Wrench, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface InsightsResult {
  summary: string;
  funnel: string;
  audience: string;
  improvements: string[];
  actions: string[];
  generated_at?: string;
}

interface PanelState {
  analysis: InsightsResult | null;
  analysisAt: string | null;
  hasEnough: boolean;
  minLeads: number;
  minViews: number;
  cost: number;
}

export default function QuizInsightsPanel({ quizId }: { quizId: string }) {
  const [state, setState] = useState<PanelState | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/quiz/${quizId}/insights`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.ok) return;
        setState({
          analysis: d.analysis ?? null,
          analysisAt: d.analysisAt ?? null,
          hasEnough: !!d.hasEnough,
          minLeads: d.minLeads ?? 5,
          minViews: d.minViews ?? 20,
          cost: d.cost ?? 1,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/quiz/${quizId}/insights`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (data?.error === "NOT_ENOUGH_DATA") toast.error(data.message ?? "Pas assez d'activite.");
        else if (data?.error === "NO_CREDITS") toast.error(data.message ?? "Plus de credits IA.");
        else toast.error("L'analyse a echoue. Reessaie dans un instant.");
        return;
      }
      setState((prev) => (prev ? { ...prev, analysis: data.analysis, analysisAt: data.analysisAt, cost: 0 } : prev));
      toast.success("Analyse prete !");
    } catch {
      toast.error("Erreur reseau.");
    } finally {
      setGenerating(false);
    }
  }, [quizId]);

  const a = state?.analysis ?? null;

  return (
    <Card className="p-5 border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/30 dark:bg-indigo-950/15">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
        <h3 className="text-sm font-semibold">Analyse IA de tes statistiques</h3>
      </div>

      {state && !state.hasEnough && !a ? (
        <p className="text-sm text-muted-foreground mt-1">
          Pas encore assez d&apos;activite pour une analyse fiable. Reviens quand tu auras au moins{" "}
          {state.minLeads} leads ou {state.minViews} vues : l&apos;IA a besoin de vrais chiffres pour
          te donner des conclusions justes.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            Ton diagnostic complet : ce qui marche, ou tu perds des gens, qui sont tes visiteurs, et
            quoi faire pour capter et vendre plus.
            {state && state.cost > 0
              ? " La premiere analyse coute 1 credit IA, les mises a jour sont gratuites."
              : " Mise a jour gratuite."}
          </p>

          {a && (
            <div className="space-y-3 mb-3">
              <Section icon={<TrendingUp className="w-3.5 h-3.5" />} label="Diagnostic">
                <p className="text-sm">{a.summary}</p>
              </Section>
              {a.funnel && (
                <Section icon={<TrendingUp className="w-3.5 h-3.5" />} label="Ton funnel (vues, completion, capture)">
                  <p className="text-sm">{a.funnel}</p>
                </Section>
              )}
              {a.audience && (
                <Section icon={<Users className="w-3.5 h-3.5" />} label="Profil de tes visiteurs">
                  <p className="text-sm">{a.audience}</p>
                </Section>
              )}
              {a.improvements.length > 0 && (
                <Section icon={<Wrench className="w-3.5 h-3.5" />} label="Axes d'amelioration">
                  <ul className="mt-1 space-y-1">
                    {a.improvements.map((t, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {a.actions.length > 0 && (
                <Section icon={<Rocket className="w-3.5 h-3.5" />} label="Actions pour capter et vendre plus">
                  <ul className="mt-1 space-y-1">
                    {a.actions.map((t, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="mt-0.5 text-indigo-500 shrink-0 font-medium">{i + 1}.</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          )}

          <Button size="sm" onClick={handleGenerate} disabled={generating || (!state?.hasEnough && !a)}>
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Analyse en cours…
              </>
            ) : a ? (
              <>
                <RefreshCw className="w-4 h-4 mr-1.5" />
                Mettre a jour l&apos;analyse
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-1.5" />
                Lancer l&apos;analyse
                {state && state.cost > 0 ? " (1 credit)" : ""}
              </>
            )}
          </Button>
          {a?.generated_at && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Derniere analyse : {new Date(a.generated_at).toLocaleString("fr-FR")}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <span className="text-indigo-500">{icon}</span>
        {label}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
