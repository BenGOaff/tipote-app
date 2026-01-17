"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Sparkles } from "lucide-react";
import { format, startOfMonth, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import type { MetricsData } from "@/hooks/useMetrics";

interface MetricsFormProps {
  initialData?: MetricsData | null;
  onSave: (
    data: Omit<MetricsData, "id" | "user_id" | "capture_rate" | "conversion_rate" | "avg_basket" | "subscriber_value">,
  ) => Promise<MetricsData | null>;
  onAnalyze: (data: MetricsData, previous?: MetricsData | null) => Promise<string | null>;
  previousMetrics?: MetricsData | null;
  isSaving: boolean;
  isAnalyzing: boolean;
}

const getAvailableMonths = () => {
  const months: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = startOfMonth(subMonths(now, i));
    months.push({
      value: format(date, "yyyy-MM-dd"),
      label: format(date, "MMMM yyyy", { locale: fr }),
    });
  }
  return months;
};

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function pct(n: number, d: number) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return clamp(Math.round((n / d) * 1000) / 10, 0, 9999); // 1 décimale
}

export const MetricsForm = ({
  initialData,
  onSave,
  onAnalyze,
  previousMetrics,
  isSaving,
  isAnalyzing,
}: MetricsFormProps) => {
  const availableMonths = useMemo(() => getAvailableMonths(), []);

  const [formData, setFormData] = useState({
    month: initialData?.month || availableMonths[0].value,
    visitors: initialData?.visitors?.toString() || "",
    new_subscribers: initialData?.new_subscribers?.toString() || "",
    email_open_rate: initialData?.email_open_rate?.toString() || "",
    email_click_rate: initialData?.email_click_rate?.toString() || "",
    sales_page_views: initialData?.sales_page_views?.toString() || "",
    sales_count: initialData?.sales_count?.toString() || "",
    revenue: initialData?.revenue?.toString() || "",
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        month: initialData.month,
        visitors: initialData.visitors?.toString() || "",
        new_subscribers: initialData.new_subscribers?.toString() || "",
        email_open_rate: initialData.email_open_rate?.toString() || "",
        email_click_rate: initialData.email_click_rate?.toString() || "",
        sales_page_views: initialData.sales_page_views?.toString() || "",
        sales_count: initialData.sales_count?.toString() || "",
        revenue: initialData.revenue?.toString() || "",
      });
    }
  }, [initialData]);

  const visitors = parseInt(formData.visitors) || 0;
  const newSubs = parseInt(formData.new_subscribers) || 0;
  const spv = parseInt(formData.sales_page_views) || 0;
  const sales = parseInt(formData.sales_count) || 0;
  const revenue = parseFloat(formData.revenue) || 0;

  const captureRate = pct(newSubs, Math.max(1, visitors));
  const conversionRate = pct(sales, Math.max(1, spv));
  const avgBasket = clamp(Math.round((revenue / Math.max(1, sales)) * 10) / 10, 0, 999999);
  const subscriberValue = clamp(Math.round((revenue / Math.max(1, newSubs)) * 10) / 10, 0, 999999);

  const handleSubmit = async (analyze: boolean = false) => {
    const metricsToSave = {
      month: formData.month,
      visitors,
      new_subscribers: newSubs,
      email_open_rate: parseFloat(formData.email_open_rate) || 0,
      email_click_rate: parseFloat(formData.email_click_rate) || 0,
      sales_page_views: spv,
      sales_count: sales,
      revenue,
      ai_analysis: initialData?.ai_analysis || null,
    };

    const saved = await onSave(metricsToSave as any);
    if (!saved) return;

    if (analyze) {
      await onAnalyze(saved, previousMetrics || null);
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Month selector */}
        <div className="space-y-2">
          <Label>Mois</Label>
          <Select value={formData.month} onValueChange={(value) => setFormData({ ...formData, month: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionne un mois" />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Input metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="visitors">🚀 Visiteurs</Label>
            <Input
              id="visitors"
              type="number"
              placeholder="854"
              value={formData.visitors}
              onChange={(e) => setFormData({ ...formData, visitors: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new_subscribers">📧 Nouveaux inscrits</Label>
            <Input
              id="new_subscribers"
              type="number"
              placeholder="10"
              value={formData.new_subscribers}
              onChange={(e) => setFormData({ ...formData, new_subscribers: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email_open_rate">📬 Taux d&apos;ouverture (%)</Label>
            <Input
              id="email_open_rate"
              type="number"
              placeholder="34"
              value={formData.email_open_rate}
              onChange={(e) => setFormData({ ...formData, email_open_rate: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email_click_rate">🖱️ Taux de clic (%)</Label>
            <Input
              id="email_click_rate"
              type="number"
              placeholder="3.2"
              value={formData.email_click_rate}
              onChange={(e) => setFormData({ ...formData, email_click_rate: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sales_page_views">👀 Vues page vente</Label>
            <Input
              id="sales_page_views"
              type="number"
              placeholder="120"
              value={formData.sales_page_views}
              onChange={(e) => setFormData({ ...formData, sales_page_views: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sales_count">🛒 Ventes</Label>
            <Input
              id="sales_count"
              type="number"
              placeholder="4"
              value={formData.sales_count}
              onChange={(e) => setFormData({ ...formData, sales_count: e.target.value })}
            />
          </div>

          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="revenue">💶 Chiffre d&apos;affaires</Label>
            <Input
              id="revenue"
              type="number"
              placeholder="490"
              value={formData.revenue}
              onChange={(e) => setFormData({ ...formData, revenue: e.target.value })}
            />
          </div>
        </div>

        {/* Calculated metrics */}
        <div className="border-t pt-4">
          <p className="text-sm text-muted-foreground mb-3">📈 Taux calculés automatiquement</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Taux de capture</p>
              <p className="text-lg font-bold">{captureRate}%</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Taux de conversion</p>
              <p className="text-lg font-bold">{conversionRate}%</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Panier moyen</p>
              <p className="text-lg font-bold">{avgBasket}€</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Valeur/inscrit</p>
              <p className="text-lg font-bold">{subscriberValue}€</p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <Button onClick={() => handleSubmit(false)} disabled={isSaving || isAnalyzing} variant="outline">
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Enregistrer
          </Button>
          <Button onClick={() => handleSubmit(true)} disabled={isSaving || isAnalyzing} className="gradient-primary">
            {isAnalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Enregistrer &amp; Analyser
          </Button>
        </div>
      </div>
    </Card>
  );
};
