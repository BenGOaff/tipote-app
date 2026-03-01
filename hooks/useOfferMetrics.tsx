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
  email_list_size?: number;
  emails_sent?: number;
  email_open_rate?: number;
  email_click_rate?: number;
  linked_page_ids?: string[];
  linked_quiz_ids?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface EmailStats {
  email_list_size: number;
  emails_sent: number;
  email_open_rate: number;
  email_click_rate: number;
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
      toast({ title: "Erreur", description: "Impossible de charger les metriques", variant: "destructive" });
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
    } catch { /* non-blocking */ }
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

  // Save email stats as a special "__email_stats__" offer row
  const saveEmailStats = useCallback(async (month: string, stats: EmailStats): Promise<boolean> => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/analytics/offer-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offer_name: "__email_stats__",
          offer_level: "email",
          is_paid: false,
          month,
          visitors: 0,
          signups: 0,
          sales_count: 0,
          revenue: 0,
          email_list_size: stats.email_list_size,
          emails_sent: stats.emails_sent,
          email_open_rate: stats.email_open_rate,
          email_click_rate: stats.email_click_rate,
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erreur");
      await fetchAll();
      return true;
    } catch (error) {
      console.error("Error saving email stats:", error);
      toast({ title: "Erreur", description: error instanceof Error ? error.message : "Impossible d'enregistrer", variant: "destructive" });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [fetchAll, toast]);

  // Get email stats for a given month
  const getEmailStats = useCallback((month: string): EmailStats | null => {
    const row = metrics.find((m) => m.month === month && m.offer_name === "__email_stats__");
    if (!row) return null;
    return {
      email_list_size: row.email_list_size ?? 0,
      emails_sent: row.emails_sent ?? 0,
      email_open_rate: row.email_open_rate ?? 0,
      email_click_rate: row.email_click_rate ?? 0,
    };
  }, [metrics]);

  // Filter out email stats rows from regular offer metrics
  const offerMetrics = useMemo(() => {
    return metrics.filter((m) => m.offer_name !== "__email_stats__");
  }, [metrics]);

  const analyzeOfferMetrics = useCallback(async (month: string): Promise<string | null> => {
    setIsAnalyzing(true);
    try {
      const currentMonth = offerMetrics.filter((m) => m.month === month);
      const d = new Date(month);
      d.setMonth(d.getMonth() - 1);
      const prevMonth = d.toISOString().slice(0, 10);
      const previousMonthData = offerMetrics.filter((m) => m.month === prevMonth);

      const emailStats = getEmailStats(month);
      const previousEmailStats = getEmailStats(prevMonth);

      const res = await fetch("/api/analytics/offer-metrics/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentMetrics: currentMonth,
          previousMetrics: previousMonthData,
          emailStats,
          previousEmailStats,
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
  }, [offerMetrics, getEmailStats, toast]);

  // Group offer metrics (excluding emails) by month
  const metricsByMonth = useMemo(() => {
    const grouped: Record<string, OfferMetric[]> = {};
    for (const m of offerMetrics) {
      if (!grouped[m.month]) grouped[m.month] = [];
      grouped[m.month].push(m);
    }
    return grouped;
  }, [offerMetrics]);

  const sortedMonths = useMemo(() => {
    // Include months from both offer metrics and email stats
    const allMonths = new Set<string>();
    for (const m of metrics) allMonths.add(m.month);
    return [...allMonths].sort((a, b) => a.localeCompare(b));
  }, [metrics]);

  const getMonthMetrics = useCallback((month: string): OfferMetric[] => {
    return metricsByMonth[month] ?? [];
  }, [metricsByMonth]);

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

  // Grand totals across ALL months
  const grandTotals = useMemo(() => {
    const totalVisitors = offerMetrics.reduce((s, m) => s + m.visitors, 0);
    const totalSignups = offerMetrics.reduce((s, m) => s + m.signups, 0);
    const totalSales = offerMetrics.reduce((s, m) => s + m.sales_count, 0);
    const totalRevenue = offerMetrics.reduce((s, m) => s + m.revenue, 0);

    // Average email stats across all months
    const emailRows = metrics.filter((m) => m.offer_name === "__email_stats__");
    const avgOpenRate = emailRows.length > 0
      ? emailRows.reduce((s, m) => s + (m.email_open_rate ?? 0), 0) / emailRows.length
      : 0;
    const avgClickRate = emailRows.length > 0
      ? emailRows.reduce((s, m) => s + (m.email_click_rate ?? 0), 0) / emailRows.length
      : 0;
    const latestEmailRow = emailRows.sort((a, b) => b.month.localeCompare(a.month))[0];

    return {
      visitors: totalVisitors,
      signups: totalSignups,
      sales: totalSales,
      revenue: totalRevenue,
      captureRate: totalVisitors > 0 ? (totalSignups / totalVisitors) * 100 : 0,
      salesConversion: totalSignups > 0 ? (totalSales / totalSignups) * 100 : 0,
      avgEmailOpenRate: avgOpenRate,
      avgEmailClickRate: avgClickRate,
      latestEmailListSize: latestEmailRow?.email_list_size ?? 0,
      monthCount: sortedMonths.length,
    };
  }, [offerMetrics, metrics, sortedMonths]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    offers,
    metrics: offerMetrics,
    allMetrics: metrics,
    sources,
    isLoading,
    isSaving,
    isAnalyzing,
    analysis,
    sortedMonths,
    metricsByMonth,
    grandTotals,
    fetchAll,
    fetchSources,
    saveOfferMetric,
    saveEmailStats,
    getEmailStats,
    analyzeOfferMetrics,
    getMonthMetrics,
    getMonthTotals,
  };
};
