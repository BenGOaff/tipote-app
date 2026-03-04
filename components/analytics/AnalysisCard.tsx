"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIContent } from "@/components/ui/ai-content";
import { Sparkles, Loader2 } from "lucide-react";
import { useTranslations, useLocale } from 'next-intl';
import { format } from "date-fns";
import { fr, enUS, es, it, ar } from "date-fns/locale";
import type { Locale } from "date-fns";

const dateFnsLocales: Record<string, Locale> = { fr, en: enUS, es, it, ar };

interface AnalysisCardProps {
  analysis: string | null;
  month?: string;
  isLoading?: boolean;
}

export const AnalysisCard = ({ analysis, month, isLoading }: AnalysisCardProps) => {
  const t = useTranslations('analysisCard');
  const locale = useLocale();

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-primary-foreground animate-spin" />
          </div>
          <div>
            <h3 className="text-lg font-bold">{t('analyzing')}</h3>
            <p className="text-sm text-muted-foreground">{t('analyzingDesc')}</p>
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
            <h3 className="text-lg font-bold">{t('aiDiagnosis')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('enterMetrics')}
            </p>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          {t('analyzeRecommendations')}
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
            <h3 className="text-lg font-bold">{t('aiDiagnosis')}</h3>
            {month ? (
              <p className="text-sm text-muted-foreground">
                Analyse de {format(new Date(month), "MMMM yyyy", { locale: dateFnsLocales[locale] ?? fr })}
              </p>
            ) : null}
          </div>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Sparkles className="w-3 h-3" />
          IA
        </Badge>
      </div>

      {/* Rendu IA : markdown léger (titres, gras, listes, séparateurs, code) */}
      <div className="rounded-xl border bg-background p-5">
        <AIContent content={analysis} mode="auto" className="text-sm" />
      </div>
    </Card>
  );
};
