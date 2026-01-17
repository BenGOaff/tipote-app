"use client";

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

import { BarChart3, History, Loader2 } from "lucide-react";

import { useTutorial } from "@/hooks/useTutorial";
import { ContextualTooltip } from "@/components/tutorial/ContextualTooltip";

import { useMetrics } from "@/hooks/useMetrics";
import { MetricsForm } from "@/components/analytics/MetricsForm";
import { MetricsSummary } from "@/components/analytics/MetricsSummary";
import { MetricsChart } from "@/components/analytics/MetricsChart";
import { AnalysisCard } from "@/components/analytics/AnalysisCard";

import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function AnalyticsLovableClient() {
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

  const [activeTab, setActiveTab] = useState("saisie");

  return (
    <DashboardLayout
      title="Analytics"
      showAnalyticsLink={false}
      contentClassName="p-6 space-y-6 max-w-5xl mx-auto"
    >
      {/* Header */}
      <div>
        <h2 className="text-2xl font-display font-bold">Ton tableau de bord</h2>
        <p className="text-muted-foreground">
          Saisis tes métriques mensuelles et obtiens un diagnostic personnalisé
        </p>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-10 w-10 rounded-xl mb-3" />
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16" />
            </Card>
          ))}
        </div>
      ) : (
        <>
          <MetricsSummary
            metrics={latestMetrics}
            previousMetrics={previousMetrics}
          />
          <MetricsChart metrics={metrics} />
        </>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="saisie" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Saisir mes données
          </TabsTrigger>
          <TabsTrigger value="historique" className="gap-2">
            <History className="w-4 h-4" />
            Historique
          </TabsTrigger>
        </TabsList>

        <TabsContent value="saisie" className="mt-6">
          <ContextualTooltip
            contextKey="first_analytics_visit"
            message={
              hasSeenContext("first_analytics_visit")
                ? "Pense à mettre à jour tes métriques chaque mois pour suivre ta progression."
                : "Commence par saisir tes métriques du mois en cours. Tipote te donnera un diagnostic IA."
            }
            position="top"
          >
            <div className="space-y-6">
              {/* Metrics Form */}
              <MetricsForm
                initialData={latestMetrics}
                onSave={saveMetrics}
                onAnalyze={analyzeMetrics}
                previousMetrics={previousMetrics}
                isSaving={isSaving}
                isAnalyzing={isAnalyzing}
              />

              {/* AI Analysis */}
              <AnalysisCard
                analysis={latestMetrics?.ai_analysis || null}
                month={latestMetrics?.month}
                isLoading={isAnalyzing}
              />
            </div>
          </ContextualTooltip>
        </TabsContent>

        <TabsContent value="historique" className="mt-6">
          {isLoading ? (
            <Card className="p-6">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            </Card>
          ) : metrics.length === 0 ? (
            <Card className="p-12 text-center">
              <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">
                Aucune donnée enregistrée
              </h3>
              <p className="text-muted-foreground mb-4">
                Commence par saisir tes métriques du mois en cours
              </p>
              <Button onClick={() => setActiveTab("saisie")}>
                Saisir mes données
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {metrics.map((metric) => (
                <Card key={metric.id} className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold capitalize">
                        {format(new Date(metric.month), "MMMM yyyy", {
                          locale: fr,
                        })}
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">CA</p>
                          <p className="font-medium">
                            {(metric.revenue || 0).toLocaleString("fr-FR")}€
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Ventes</p>
                          <p className="font-medium">
                            {metric.sales_count || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Conversion</p>
                          <p className="font-medium">
                            {(metric.conversion_rate || 0).toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Inscrits</p>
                          <p className="font-medium">
                            {metric.new_subscribers || 0}
                          </p>
                        </div>
                      </div>
                    </div>

                    {metric.ai_analysis && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // TODO (mature) : modal détail analyse
                          // En bêta, on garde simple.
                        }}
                      >
                        Voir l&apos;analyse
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
