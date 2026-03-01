"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import DashboardLayout from "@/components/DashboardLayout";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

import { BarChart3, History, Loader2, Target, Sparkles } from "lucide-react";

import { useTutorial } from "@/hooks/useTutorial";
import { ContextualTooltip } from "@/components/tutorial/ContextualTooltip";

import { useMetrics } from "@/hooks/useMetrics";
import { useOfferMetrics } from "@/hooks/useOfferMetrics";
import { MetricsForm } from "@/components/analytics/MetricsForm";
import { MetricsSummary } from "@/components/analytics/MetricsSummary";
import { MetricsChart } from "@/components/analytics/MetricsChart";
import { AnalysisCard } from "@/components/analytics/AnalysisCard";
import { OfferMetricsForm } from "@/components/analytics/OfferMetricsForm";
import { OfferMetricsDashboard } from "@/components/analytics/OfferMetricsDashboard";
import { OfferAnalysisCard } from "@/components/analytics/OfferAnalysisCard";
import { SioDataGuide } from "@/components/analytics/SioDataGuide";

import { format, Locale } from "date-fns";
import { fr, enUS, es, it, ar } from "date-fns/locale";

const DATE_FNS_LOCALES: Record<string, Locale> = { fr, en: enUS, es, it, ar };

export default function AnalyticsLovableClient() {
  const t = useTranslations("analytics");
  const locale = useLocale();
  const dateFnsLocale = DATE_FNS_LOCALES[locale] ?? fr;
  const { hasSeenContext } = useTutorial();
  const {
    metrics,
    latestMetrics,
    previousMetrics,
    isLoading,
    isSaving,
    isAnalyzing,
    saveMetrics,
    analyzeMetrics,
  } = useMetrics();

  const offerState = useOfferMetrics();

  const [activeTab, setActiveTab] = useState("offres");

  // Determine latest month for offer analysis
  const latestOfferMonth = offerState.sortedMonths[offerState.sortedMonths.length - 1] ?? null;

  return (
    <DashboardLayout
      title={t("title")}
      showAnalyticsLink={false}
      contentClassName="p-6 space-y-6 max-w-6xl mx-auto"
    >
      {/* Header */}
      <div>
        <h2 className="text-2xl font-display font-bold">{t("subtitle")}</h2>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="offres" className="gap-2">
            <Target className="w-4 h-4" />
            Par offre
          </TabsTrigger>
          <TabsTrigger value="saisie" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            {t("tabs.enter")}
          </TabsTrigger>
          <TabsTrigger value="analyse" className="gap-2">
            <Sparkles className="w-4 h-4" />
            Analyse IA
          </TabsTrigger>
          <TabsTrigger value="historique" className="gap-2">
            <History className="w-4 h-4" />
            {t("tabs.history")}
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Per-offer metrics ── */}
        <TabsContent value="offres" className="mt-6 space-y-6">
          {offerState.isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="p-4">
                  <Skeleton className="h-8 w-8 rounded-lg mb-2" />
                  <Skeleton className="h-3 w-16 mb-1" />
                  <Skeleton className="h-6 w-12" />
                </Card>
              ))}
            </div>
          ) : (
            <>
              {/* Dashboard with charts */}
              <OfferMetricsDashboard
                metrics={offerState.metrics}
                sortedMonths={offerState.sortedMonths}
                getMonthTotals={offerState.getMonthTotals}
              />

              {/* Per-offer entry form */}
              <OfferMetricsForm
                offers={offerState.offers}
                existingMetrics={offerState.metrics}
                sources={offerState.sources}
                onSave={offerState.saveOfferMetric}
                onFetchSources={offerState.fetchSources}
                isSaving={offerState.isSaving}
              />

              {/* Guide: where to find data */}
              <SioDataGuide />
            </>
          )}
        </TabsContent>

        {/* ── TAB 2: Global metrics entry (existing) ── */}
        <TabsContent value="saisie" className="mt-6">
          {/* Summary Cards */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[...Array(4)].map((_, i) => (
                <Card key={i} className="p-5">
                  <Skeleton className="h-10 w-10 rounded-xl mb-3" />
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <MetricsSummary
                metrics={latestMetrics}
                previousMetrics={previousMetrics}
              />
              <MetricsChart metrics={metrics} />
            </div>
          )}

          <div className="mt-6">
            <ContextualTooltip
              contextKey="first_analytics_visit"
              message={
                hasSeenContext("first_analytics_visit")
                  ? t("tooltipUpdate")
                  : t("tooltipFirst")
              }
              position="top"
            >
              <MetricsForm
                initialData={latestMetrics}
                onSave={saveMetrics}
                onAnalyze={analyzeMetrics}
                previousMetrics={previousMetrics}
                isSaving={isSaving}
                isAnalyzing={isAnalyzing}
              />
            </ContextualTooltip>
          </div>
        </TabsContent>

        {/* ── TAB 3: AI Analysis ── */}
        <TabsContent value="analyse" className="mt-6 space-y-6">
          {/* Per-offer AI analysis */}
          <OfferAnalysisCard
            analysis={offerState.analysis}
            isLoading={offerState.isAnalyzing}
            onAnalyze={() => latestOfferMonth && offerState.analyzeOfferMetrics(latestOfferMonth)}
            hasData={offerState.metrics.length > 0}
          />

          {/* Global AI analysis (existing) */}
          <AnalysisCard
            analysis={latestMetrics?.ai_analysis || null}
            month={latestMetrics?.month}
            isLoading={isAnalyzing}
          />
        </TabsContent>

        {/* ── TAB 4: History ── */}
        <TabsContent value="historique" className="mt-6">
          {isLoading ? (
            <Card className="p-6">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            </Card>
          ) : metrics.length === 0 ? (
            <Card className="p-12 text-center">
              <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">{t("emptyTitle")}</h3>
              <p className="text-muted-foreground mb-4">{t("emptyBody")}</p>
              <Button onClick={() => setActiveTab("saisie")}>{t("enterData")}</Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {metrics.map((metric) => (
                <Card key={metric.id} className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold capitalize">
                        {format(new Date(metric.month), "MMMM yyyy", {
                          locale: dateFnsLocale,
                        })}
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">{t("metrics.revenue")}</p>
                          <p className="font-medium">
                            {(metric.revenue || 0).toLocaleString()}EUR
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{t("metrics.sales")}</p>
                          <p className="font-medium">{metric.sales_count || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{t("metrics.conversion")}</p>
                          <p className="font-medium">
                            {(metric.conversion_rate || 0).toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{t("metrics.subscribers")}</p>
                          <p className="font-medium">{metric.new_subscribers || 0}</p>
                        </div>
                      </div>
                    </div>

                    {metric.ai_analysis && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // TODO (mature) : modal détail analyse
                        }}
                      >
                        {t("seeAnalysis")}
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
