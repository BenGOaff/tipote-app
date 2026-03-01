"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AIContent } from "@/components/ui/ai-content";
import { Sparkles, Loader2 } from "lucide-react";

interface OfferAnalysisCardProps {
  analysis: string | null;
  isLoading: boolean;
  onAnalyze: () => void;
  hasData: boolean;
}

export const OfferAnalysisCard = ({ analysis, isLoading, onAnalyze, hasData }: OfferAnalysisCardProps) => {
  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-primary-foreground animate-spin" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Analyse en cours...</h3>
            <p className="text-sm text-muted-foreground">L&apos;IA examine tes données par offre</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
          <div className="h-4 bg-muted rounded animate-pulse w-full" />
          <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
          <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
        </div>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card className="p-6 border-dashed">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Diagnostic IA par offre</h3>
            <p className="text-sm text-muted-foreground">
              Analyse les performances de chaque offre et obtiens des recommandations
            </p>
          </div>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          L&apos;IA va analyser tes métriques par offre, identifier les goulots d&apos;étranglement (visiteurs → inscrits → ventes) et te donner des actions concrètes : modifier le CTA, poster plus souvent, revoir le positionnement, améliorer la page de capture...
        </p>
        <Button onClick={onAnalyze} disabled={!hasData} className="gradient-primary">
          <Sparkles className="w-4 h-4 mr-2" />
          Lancer l&apos;analyse
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Diagnostic IA par offre</h3>
            <p className="text-sm text-muted-foreground">
              Recommandations basées sur tes performances
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="w-3 h-3" /> IA
          </Badge>
          <Button size="sm" variant="outline" onClick={onAnalyze}>
            Relancer
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-background p-5">
        <AIContent content={analysis} mode="auto" className="text-sm" />
      </div>
    </Card>
  );
};
