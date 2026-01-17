"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface AnalysisCardProps {
  analysis: string | null;
  month?: string;
  isLoading?: boolean;
}

export const AnalysisCard = ({ analysis, month, isLoading }: AnalysisCardProps) => {
  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-primary-foreground animate-spin" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Analyse en cours...</h3>
            <p className="text-sm text-muted-foreground">L&apos;IA examine tes données</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
          <div className="h-4 bg-muted rounded animate-pulse w-full" />
          <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
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
            <h3 className="text-lg font-bold">Diagnostic IA</h3>
            <p className="text-sm text-muted-foreground">Saisis tes métriques pour obtenir une analyse personnalisée</p>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          L&apos;IA analysera tes données et te donnera des recommandations concrètes pour améliorer tes résultats.
        </p>
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
            <h3 className="text-lg font-bold">Diagnostic IA</h3>
            {month ? (
              <p className="text-sm text-muted-foreground">
                Analyse de {format(new Date(month), "MMMM yyyy", { locale: fr })}
              </p>
            ) : null}
          </div>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Sparkles className="w-3 h-3" />
          IA
        </Badge>
      </div>

      {/* On garde un rendu “prose” sans dépendance react-markdown */}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <div className="whitespace-pre-wrap text-sm leading-6">{analysis}</div>
      </div>
    </Card>
  );
};
