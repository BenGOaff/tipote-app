"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { loadAllOffers, type OfferOption } from "@/lib/offers";
import { useToast } from "@/hooks/use-toast";

export interface OfferMetric {
  id?: string;
  user_id?: string;
  offer_name: string;
  offer_level: string;
  is_paid: boolean;
  month: string;
  visitors: number;
  signups: number;
  sales_count: number;
  revenue: number;
  capture_rate?: number;
  sales_conversion?: number;
  revenue_per_visitor?: number;
  linked_page_ids?: string[];
  linked_quiz_ids?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface AggregatedSource {
  id: string;
  title: string;
  type: "page" | "quiz";
  page_type?: string;
  slug?: string;
  total_views: number;
  total_leads?: number;
  month_leads: number;
}

export const useOfferMetrics = () => {
  const { toast } = useToast();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [metrics, setMetrics] = useState<OfferMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);

  // Aggregated sources from pages/quizzes
  const [sources, setSources] = useState<{ pages: AggregatedSource[]; quizzes: AggregatedSource[] }>({
    pages: [],
    quizzes: [],
  });

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [offersResult, metricsRes] = await Promise.all([
        loadAllOffers(supabase),
        fetch("/api/analytics/offer-metrics").then((r) => r.json()),
      ]);

      setOffers(offersResult);
      setMetrics(metricsRes?.metrics ?? []);
    } catch (error) {
      console.error("Error fetching offer metrics:", error);
      toast({ title: "Erreur", description: "Impossible de charger les métriques", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [supabase, toast]);

  const fetchSources = useCallback(async (month: string) => {
    try {
      const res = await fetch("/api/analytics/offer-metrics/aggregate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const json = await res.json();
      if (json?.ok) {
        setSources({ pages: json.pages ?? [], quizzes: json.quizzes ?? [] });
      }
    } catch {
      // non-blocking
    }
  }, []);

  const saveOfferMetric = useCallback(async (data: Omit<OfferMetric, "id" | "user_id" | "capture_rate" | "sales_conversion" | "revenue_per_visitor" | "created_at" | "updated_at">): Promise<OfferMetric | null> => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/analytics/offer-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erreur");

      // Refresh
      await fetchAll();
      return json.metric ?? null;
    } catch (error) {
      console.error("Error saving offer metric:", error);
      toast({ title: "Erreur", description: error instanceof Error ? error.message : "Impossible d'enregistrer", variant: "destructive" });
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [fetchAll, toast]);

  const analyzeOfferMetrics = useCallback(async (month: string): Promise<string | null> => {
    setIsAnalyzing(true);
    try {
      const currentMonth = metrics.filter((m) => m.month === month);
      // Find previous month
      const d = new Date(month);
      d.setMonth(d.getMonth() - 1);
      const prevMonth = d.toISOString().slice(0, 10);
      const previousMonthData = metrics.filter((m) => m.month === prevMonth);

      const res = await fetch("/api/analytics/offer-metrics/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentMetrics: currentMonth,
          previousMetrics: previousMonthData,
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Analyse impossible");

      setAnalysis(json.analysis);
      return json.analysis;
    } catch (error) {
      console.error("Error analyzing:", error);
      toast({ title: "Erreur d'analyse", description: error instanceof Error ? error.message : "Impossible d'analyser", variant: "destructive" });
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [metrics, toast]);

  // Group metrics by month for charts
  const metricsByMonth = useMemo(() => {
    const grouped: Record<string, OfferMetric[]> = {};
    for (const m of metrics) {
      if (!grouped[m.month]) grouped[m.month] = [];
      grouped[m.month].push(m);
    }
    return grouped;
  }, [metrics]);

  // Get sorted unique months
  const sortedMonths = useMemo(() => {
    return Object.keys(metricsByMonth).sort((a, b) => a.localeCompare(b));
  }, [metricsByMonth]);

  // Get metrics for a specific month
  const getMonthMetrics = useCallback((month: string): OfferMetric[] => {
    return metricsByMonth[month] ?? [];
  }, [metricsByMonth]);

  // Get previous month metrics for comparison
  const getPreviousMonthMetrics = useCallback((month: string): OfferMetric[] => {
    const d = new Date(month);
    d.setMonth(d.getMonth() - 1);
    const prevMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    return metricsByMonth[prevMonth] ?? [];
  }, [metricsByMonth]);

  // Totals for a given month
  const getMonthTotals = useCallback((month: string) => {
    const items = getMonthMetrics(month);
    const totalVisitors = items.reduce((s, m) => s + m.visitors, 0);
    const totalSignups = items.reduce((s, m) => s + m.signups, 0);
    const totalSales = items.reduce((s, m) => s + m.sales_count, 0);
    const totalRevenue = items.reduce((s, m) => s + m.revenue, 0);
    return {
      visitors: totalVisitors,
      signups: totalSignups,
      sales: totalSales,
      revenue: totalRevenue,
      captureRate: totalVisitors > 0 ? (totalSignups / totalVisitors) * 100 : 0,
      salesConversion: totalSignups > 0 ? (totalSales / totalSignups) * 100 : 0,
      revenuePerVisitor: totalVisitors > 0 ? totalRevenue / totalVisitors : 0,
    };
  }, [getMonthMetrics]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    offers,
    metrics,
    sources,
    isLoading,
    isSaving,
    isAnalyzing,
    analysis,
    sortedMonths,
    metricsByMonth,
    fetchAll,
    fetchSources,
    saveOfferMetric,
    analyzeOfferMetrics,
    getMonthMetrics,
    getPreviousMonthMetrics,
    getMonthTotals,
  };
};
