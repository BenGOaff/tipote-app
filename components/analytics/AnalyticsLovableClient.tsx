"use client";

import { useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import DashboardLayout from "@/components/DashboardLayout";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

import { BarChart3, History, Loader2, Target } from "lucide-react";

import { useOfferMetrics } from "@/hooks/useOfferMetrics";
import { OfferMetricsForm } from "@/components/analytics/OfferMetricsForm";
import { OfferMetricsDashboard } from "@/components/analytics/OfferMetricsDashboard";

import { format, Locale } from "date-fns";
import { fr, enUS, es, it, ar } from "date-fns/locale";

const DATE_FNS_LOCALES: Record<string, Locale> = { fr, en: enUS, es, it, ar };

export default function AnalyticsLovableClient() {
  const t = useTranslations("analytics");
  const locale = useLocale();
  const dateFnsLocale = DATE_FNS_LOCALES[locale] ?? fr;

  const offerState = useOfferMetrics();
  const [activeTab, setActiveTab] = useState("resultats");

  // Latest month for analysis triggers
  const latestOfferMonth = offerState.sortedMonths[offerState.sortedMonths.length - 1] ?? null;

  // Trigger analysis after saving data
  const handleSaveComplete = useCallback(() => {
    if (latestOfferMonth) {
      offerState.analyzeOfferMetrics(latestOfferMonth);
    }
    setActiveTab("resultats");
  }, [latestOfferMonth, offerState]);

  return (
    <DashboardLayout
      title={t("title")}
      showAnalyticsLink={false}
      contentClassName="p-6 space-y-6 max-w-5xl mx-auto"
    >
      {/* Header */}
      <div>
        <h2 className="text-2xl font-display font-bold">{t("subtitle")}</h2>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      {/* 3 Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="resultats" className="gap-2">
            <Target className="w-4 h-4" />
            Resultats
          </TabsTrigger>
          <TabsTrigger value="saisie" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Saisir mes donnees
          </TabsTrigger>
          <TabsTrigger value="historique" className="gap-2">
            <History className="w-4 h-4" />
            Historique
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Resultats totaux ── */}
        <TabsContent value="resultats" className="mt-6">
          {offerState.isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {[...Array(5)].map((_, i) => (
                <Card key={i} className="p-4">
                  <Skeleton className="h-8 w-8 rounded-lg mb-2" />
                  <Skeleton className="h-3 w-16 mb-1" />
                  <Skeleton className="h-6 w-12" />
                </Card>
              ))}
            </div>
          ) : (
            <OfferMetricsDashboard
              metrics={offerState.metrics}
              sortedMonths={offerState.sortedMonths}
              grandTotals={offerState.grandTotals}
              getMonthTotals={offerState.getMonthTotals}
              getEmailStats={offerState.getEmailStats}
              analysis={offerState.analysis}
              isAnalyzing={offerState.isAnalyzing}
              onAnalyze={() => latestOfferMonth && offerState.analyzeOfferMetrics(latestOfferMonth)}
            />
          )}
        </TabsContent>

        {/* ── TAB 2: Saisir mes donnees ── */}
        <TabsContent value="saisie" className="mt-6">
          {offerState.isLoading ? (
            <Card className="p-6">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            </Card>
          ) : (
            <OfferMetricsForm
              offers={offerState.offers}
              existingMetrics={offerState.metrics}
              sources={offerState.sources}
              onSave={offerState.saveOfferMetric}
              onSaveEmail={offerState.saveEmailStats}
              getEmailStats={offerState.getEmailStats}
              onFetchSources={offerState.fetchSources}
              isSaving={offerState.isSaving}
              onSaveComplete={handleSaveComplete}
            />
          )}
        </TabsContent>

        {/* ── TAB 3: Historique ── */}
        <TabsContent value="historique" className="mt-6">
          {offerState.isLoading ? (
            <Card className="p-6">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            </Card>
          ) : offerState.sortedMonths.length === 0 ? (
            <Card className="p-12 text-center">
              <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Aucun historique</h3>
              <p className="text-muted-foreground mb-4">Saisis tes donnees pour voir l&apos;historique ici.</p>
              <Button onClick={() => setActiveTab("saisie")}>Saisir mes donnees</Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {offerState.sortedMonths.slice().reverse().map((month) => {
                const totals = offerState.getMonthTotals(month);
                const monthMetrics = offerState.getMonthMetrics(month);
                const emailStats = offerState.getEmailStats(month);

                return (
                  <Card key={month} className="p-5">
                    <h4 className="font-bold capitalize mb-3">
                      {format(new Date(month), "MMMM yyyy", { locale: dateFnsLocale })}
                    </h4>

                    {/* Per-offer breakdown */}
                    {monthMetrics.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Funnels</p>
                        <div className="space-y-1">
                          {monthMetrics.map((m) => (
                            <div key={m.offer_name} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                              <span className="font-medium">{m.offer_name}</span>
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <span>{m.visitors} vis.</span>
                                <span>{m.signups} insc.</span>
                                {m.is_paid && <span>{m.sales_count} ventes</span>}
                                {m.is_paid && m.revenue > 0 && <span>{m.revenue.toLocaleString("fr-FR")} EUR</span>}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Totals */}
                        <div className="flex gap-4 text-xs mt-2 pt-2 border-t font-medium">
                          <span>Total : {totals.visitors} vis.</span>
                          <span>{totals.signups} insc.</span>
                          <span>{totals.sales} ventes</span>
                          {totals.revenue > 0 && <span>{totals.revenue.toLocaleString("fr-FR")} EUR</span>}
                        </div>
                      </div>
                    )}

                    {/* Email stats */}
                    {emailStats && (emailStats.email_list_size > 0 || emailStats.emails_sent > 0) && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Emails</p>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>Liste : {emailStats.email_list_size}</span>
                          <span>Envoyes : {emailStats.emails_sent}</span>
                          {emailStats.email_open_rate > 0 && <span>Ouverture : {emailStats.email_open_rate}%</span>}
                          {emailStats.email_click_rate > 0 && <span>Clics : {emailStats.email_click_rate}%</span>}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
