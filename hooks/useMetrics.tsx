"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { useToast } from "@/hooks/use-toast";

export interface MetricsData {
  id?: string;
  user_id?: string;

  month: string; // yyyy-mm-dd (DATE)
  visitors: number;
  new_subscribers: number;
  email_open_rate: number;
  email_click_rate: number;
  sales_page_views: number;
  sales_count: number;
  revenue: number;

  capture_rate?: number;
  conversion_rate?: number;
  avg_basket?: number;
  subscriber_value?: number;

  ai_analysis?: string | null;

  created_at?: string;
  updated_at?: string;
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function safePct(num: number, den: number) {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 0;
  return clamp((num / den) * 100, 0, 9999);
}

function safeDiv(num: number, den: number) {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 0;
  return num / den;
}

export const useMetrics = () => {
  const { toast } = useToast();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [metrics, setMetrics] = useState<MetricsData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const latestMetrics = metrics[0] ?? null;
  const previousMetrics = metrics[1] ?? null;

  const fetchMetrics = async () => {
    setIsLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        setMetrics([]);
        return;
      }

      const { data, error } = await supabase
        .from("metrics")
        .select("*")
        .eq("user_id", user.id)
        .order("month", { ascending: false })
        .limit(12);

      if (error) throw error;

      setMetrics((data as MetricsData[]) || []);
    } catch (error) {
      console.error("Error fetching metrics:", error);
      toast({
        title: "Erreur",
        description: "Impossible de charger tes métriques",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveMetrics = async (
    metricsData: Omit<
      MetricsData,
      | "id"
      | "user_id"
      | "capture_rate"
      | "conversion_rate"
      | "avg_basket"
      | "subscriber_value"
    >,
  ): Promise<MetricsData | null> => {
    setIsSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) return null;

      const capture_rate = safePct(
        metricsData.new_subscribers,
        metricsData.visitors,
      );
      const conversion_rate = safePct(
        metricsData.sales_count,
        metricsData.sales_page_views,
      );
      const avg_basket = safeDiv(
        metricsData.revenue,
        Math.max(1, metricsData.sales_count),
      );
      const subscriber_value = safeDiv(
        metricsData.revenue,
        Math.max(1, metricsData.new_subscribers),
      );

      const payload = {
        user_id: user.id,
        month: metricsData.month,
        visitors: metricsData.visitors,
        new_subscribers: metricsData.new_subscribers,
        email_open_rate: metricsData.email_open_rate,
        email_click_rate: metricsData.email_click_rate,
        sales_page_views: metricsData.sales_page_views,
        sales_count: metricsData.sales_count,
        revenue: metricsData.revenue,
        capture_rate,
        conversion_rate,
        avg_basket,
        subscriber_value,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("metrics")
        .upsert(payload, { onConflict: "user_id,month" })
        .select()
        .single();

      if (error) throw error;

      await fetchMetrics();
      return (data as MetricsData) || null;
    } catch (error) {
      console.error("Error saving metrics:", error);
      toast({
        title: "Erreur",
        description:
          error instanceof Error
            ? error.message
            : "Impossible d'enregistrer tes métriques",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * IMPORTANT:
   * On accepte `previous` = null (pour matcher MetricsFormProps).
   * Ça règle l'erreur TS quand on passe analyzeMetrics directement à <MetricsForm onAnalyze={...} />
   */
  const analyzeMetrics = async (
    metricsData: MetricsData,
    previous?: MetricsData | null,
  ): Promise<string | null> => {
    setIsAnalyzing(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) return null;

      const metricId = metricsData.id;
      if (!metricId) {
        toast({
          title: "Info",
          description: "Enregistre d'abord tes métriques, puis relance l'analyse.",
        });
        return null;
      }

      const res = await fetch("/api/analytics/analyze-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metricId,
          metrics: metricsData,
          previousMetrics: previous ?? null,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Analyse impossible pour le moment.");
      }

      const json = (await res.json()) as {
        ok: boolean;
        analysis?: string | null;
        error?: string;
      };

      if (!json.ok) {
        throw new Error(json.error || "Analyse impossible pour le moment.");
      }

      await fetchMetrics();
      return json.analysis ?? null;
    } catch (error) {
      console.error("Error analyzing metrics:", error);
      toast({
        title: "Erreur d'analyse",
        description:
          error instanceof Error ? error.message : "Impossible d'analyser tes métriques",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    metrics,
    latestMetrics,
    previousMetrics,
    isLoading,
    isSaving,
    isAnalyzing,
    saveMetrics,
    analyzeMetrics,
    refetch: fetchMetrics,
  };
};
