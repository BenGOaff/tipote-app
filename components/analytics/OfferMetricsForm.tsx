"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Plus, Trash2, Info } from "lucide-react";
import { format, startOfMonth, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import type { OfferMetric, AggregatedSource } from "@/hooks/useOfferMetrics";
import type { OfferOption } from "@/lib/offers";
import { levelLabel } from "@/lib/offers";

interface OfferMetricsFormProps {
  offers: OfferOption[];
  existingMetrics: OfferMetric[];
  sources: { pages: AggregatedSource[]; quizzes: AggregatedSource[] };
  onSave: (data: Omit<OfferMetric, "id" | "user_id" | "capture_rate" | "sales_conversion" | "revenue_per_visitor" | "created_at" | "updated_at">) => Promise<OfferMetric | null>;
  onFetchSources: (month: string) => void;
  isSaving: boolean;
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
  return clamp(Math.round((n / d) * 1000) / 10, 0, 9999);
}

interface OfferRow {
  offer_name: string;
  offer_level: string;
  is_paid: boolean;
  visitors: string;
  signups: string;
  sales_count: string;
  revenue: string;
  linked_page_ids: string[];
  linked_quiz_ids: string[];
}

export const OfferMetricsForm = ({
  offers,
  existingMetrics,
  sources,
  onSave,
  onFetchSources,
  isSaving,
}: OfferMetricsFormProps) => {
  const availableMonths = useMemo(() => getAvailableMonths(), []);
  const [month, setMonth] = useState(availableMonths[0].value);
  const [rows, setRows] = useState<OfferRow[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [customOfferName, setCustomOfferName] = useState("");

  // Initialize rows from offers + existing metrics when month changes
  useEffect(() => {
    onFetchSources(month);

    const monthMetrics = existingMetrics.filter((m) => m.month === month);
    const metricMap = new Map(monthMetrics.map((m) => [m.offer_name, m]));

    const newRows: OfferRow[] = [];

    // Add existing offers
    for (const offer of offers) {
      const existing = metricMap.get(offer.name);
      const isPaid = offer.level !== "lead_magnet" && offer.level !== "free";
      newRows.push({
        offer_name: offer.name,
        offer_level: offer.level,
        is_paid: existing?.is_paid ?? isPaid,
        visitors: existing?.visitors?.toString() ?? "",
        signups: existing?.signups?.toString() ?? "",
        sales_count: existing?.sales_count?.toString() ?? "",
        revenue: existing?.revenue?.toString() ?? "",
        linked_page_ids: existing?.linked_page_ids ?? [],
        linked_quiz_ids: existing?.linked_quiz_ids ?? [],
      });
      metricMap.delete(offer.name);
    }

    // Add metrics for offers not in the offers list (custom entries)
    for (const [, m] of metricMap) {
      newRows.push({
        offer_name: m.offer_name,
        offer_level: m.offer_level,
        is_paid: m.is_paid,
        visitors: m.visitors?.toString() ?? "",
        signups: m.signups?.toString() ?? "",
        sales_count: m.sales_count?.toString() ?? "",
        revenue: m.revenue?.toString() ?? "",
        linked_page_ids: m.linked_page_ids ?? [],
        linked_quiz_ids: m.linked_quiz_ids ?? [],
      });
    }

    setRows(newRows);
  }, [month, offers, existingMetrics, onFetchSources]);

  const updateRow = (idx: number, field: keyof OfferRow, value: any) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const addCustomOffer = () => {
    const name = customOfferName.trim();
    if (!name) return;
    if (rows.some((r) => r.offer_name.toLowerCase() === name.toLowerCase())) return;
    setRows((prev) => [
      ...prev,
      {
        offer_name: name,
        offer_level: "user_offer",
        is_paid: false,
        visitors: "",
        signups: "",
        sales_count: "",
        revenue: "",
        linked_page_ids: [],
        linked_quiz_ids: [],
      },
    ]);
    setCustomOfferName("");
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveRow = async (idx: number) => {
    const row = rows[idx];
    setSavingIdx(idx);
    await onSave({
      offer_name: row.offer_name,
      offer_level: row.offer_level,
      is_paid: row.is_paid,
      month,
      visitors: parseInt(row.visitors) || 0,
      signups: parseInt(row.signups) || 0,
      sales_count: parseInt(row.sales_count) || 0,
      revenue: parseFloat(row.revenue) || 0,
      linked_page_ids: row.linked_page_ids,
      linked_quiz_ids: row.linked_quiz_ids,
    });
    setSavingIdx(null);
  };

  const handleSaveAll = async () => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Only save rows with at least some data
      if ((parseInt(row.visitors) || 0) > 0 || (parseInt(row.signups) || 0) > 0 || (parseFloat(row.revenue) || 0) > 0) {
        setSavingIdx(i);
        await onSave({
          offer_name: row.offer_name,
          offer_level: row.offer_level,
          is_paid: row.is_paid,
          month,
          visitors: parseInt(row.visitors) || 0,
          signups: parseInt(row.signups) || 0,
          sales_count: parseInt(row.sales_count) || 0,
          revenue: parseFloat(row.revenue) || 0,
          linked_page_ids: row.linked_page_ids,
          linked_quiz_ids: row.linked_quiz_ids,
        });
      }
    }
    setSavingIdx(null);
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Month selector */}
        <div className="flex items-center gap-4">
          <div className="space-y-1 flex-1 max-w-xs">
            <Label>Mois</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue placeholder="Mois" />
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
        </div>

        {/* Data sources hint */}
        {(sources.pages.length > 0 || sources.quizzes.length > 0) && (
          <div className="p-3 rounded-lg bg-muted/50 border text-sm space-y-1">
            <p className="font-medium flex items-center gap-1.5">
              <Info className="w-4 h-4" /> Tes pages et quiz Tipote
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {sources.pages.map((p) => (
                <Badge key={p.id} variant="secondary" className="text-xs">
                  {p.title} — {p.total_views} vues, {p.month_leads} leads ce mois
                </Badge>
              ))}
              {sources.quizzes.map((q) => (
                <Badge key={q.id} variant="outline" className="text-xs">
                  {q.title} — {q.total_views} vues, {q.month_leads} leads ce mois
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Offer rows */}
        <div className="space-y-4">
          {rows.map((row, idx) => {
            const visitors = parseInt(row.visitors) || 0;
            const signups = parseInt(row.signups) || 0;
            const sales = parseInt(row.sales_count) || 0;
            const revenue = parseFloat(row.revenue) || 0;

            const captureRate = pct(signups, Math.max(1, visitors));
            const salesConv = row.is_paid ? pct(sales, Math.max(1, signups)) : null;
            const rpv = visitors > 0 ? Math.round((revenue / visitors) * 100) / 100 : 0;

            return (
              <div key={`${row.offer_name}-${idx}`} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm">{row.offer_name}</h4>
                    <Badge variant="secondary" className="text-xs">
                      {levelLabel(row.offer_level)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>Offre payante</span>
                      <Switch
                        checked={row.is_paid}
                        onCheckedChange={(v) => updateRow(idx, "is_paid", v)}
                      />
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeRow(idx)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Input fields */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Visiteurs</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={row.visitors}
                      onChange={(e) => updateRow(idx, "visitors", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Inscrits</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={row.signups}
                      onChange={(e) => updateRow(idx, "signups", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  {row.is_paid && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">Ventes</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={row.sales_count}
                          onChange={(e) => updateRow(idx, "sales_count", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">CA (EUR)</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={row.revenue}
                          onChange={(e) => updateRow(idx, "revenue", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Auto-calculated */}
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="px-2 py-1 rounded bg-muted/50">
                    Conv. capture : <strong>{captureRate}%</strong>
                  </span>
                  {salesConv !== null && (
                    <span className="px-2 py-1 rounded bg-muted/50">
                      Conv. vente : <strong>{salesConv}%</strong>
                    </span>
                  )}
                  {row.is_paid && revenue > 0 && (
                    <span className="px-2 py-1 rounded bg-muted/50">
                      CA/visiteur : <strong>{rpv.toFixed(2)}EUR</strong>
                    </span>
                  )}
                </div>

                {/* Save single row */}
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleSaveRow(idx)}
                    disabled={isSaving}
                    className="text-xs"
                  >
                    {savingIdx === idx ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                    Enregistrer
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add custom offer */}
        <div className="flex gap-2">
          <Input
            value={customOfferName}
            onChange={(e) => setCustomOfferName(e.target.value)}
            placeholder="Ajouter une offre manuellement..."
            className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && addCustomOffer()}
          />
          <Button variant="outline" onClick={addCustomOffer} disabled={!customOfferName.trim()}>
            <Plus className="w-4 h-4 mr-1" /> Ajouter
          </Button>
        </div>

        {/* Save all */}
        <div className="flex justify-end pt-2">
          <Button onClick={handleSaveAll} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Tout enregistrer
          </Button>
        </div>
      </div>
    </Card>
  );
};
