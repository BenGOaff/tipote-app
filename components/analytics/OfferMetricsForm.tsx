"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Plus, Trash2, HelpCircle, ChevronDown, ChevronUp, Mail, BarChart3, ExternalLink } from "lucide-react";
import { format, startOfMonth, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import type { OfferMetric, AggregatedSource, EmailStats } from "@/hooks/useOfferMetrics";
import type { OfferOption } from "@/lib/offers";
import { levelLabel } from "@/lib/offers";

interface OfferMetricsFormProps {
  offers: OfferOption[];
  existingMetrics: OfferMetric[];
  sources: { pages: AggregatedSource[]; quizzes: AggregatedSource[] };
  onSave: (data: Omit<OfferMetric, "id" | "user_id" | "capture_rate" | "sales_conversion" | "revenue_per_visitor" | "created_at" | "updated_at">) => Promise<OfferMetric | null>;
  onSaveEmail: (month: string, stats: EmailStats) => Promise<boolean>;
  getEmailStats: (month: string) => EmailStats | null;
  onFetchSources: (month: string) => void;
  isSaving: boolean;
  onSaveComplete?: () => void;
  /** Pre-select a specific month (used when editing from history tab) */
  initialMonth?: string | null;
  /** Called once the initial month has been consumed/applied */
  onMonthConsumed?: () => void;
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

function pct(n: number, d: number) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return Math.min(9999, Math.max(0, Math.round((n / d) * 1000) / 10));
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
  onSaveEmail,
  getEmailStats,
  onFetchSources,
  isSaving,
  onSaveComplete,
  initialMonth,
  onMonthConsumed,
}: OfferMetricsFormProps) => {
  const availableMonths = useMemo(() => getAvailableMonths(), []);
  const [month, setMonth] = useState(availableMonths[0].value);

  // When navigating from history tab with a specific month to edit
  useEffect(() => {
    if (initialMonth) {
      setMonth(initialMonth);
      onMonthConsumed?.();
    }
  }, [initialMonth, onMonthConsumed]);
  const [rows, setRows] = useState<OfferRow[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [customOfferName, setCustomOfferName] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  // Email stats state
  const [emailListSize, setEmailListSize] = useState("");
  const [emailsSent, setEmailsSent] = useState("");
  const [emailOpenRate, setEmailOpenRate] = useState("");
  const [emailClickRate, setEmailClickRate] = useState("");

  // Initialize rows from offers + existing metrics when month changes
  useEffect(() => {
    onFetchSources(month);

    const monthMetrics = existingMetrics.filter((m) => m.month === month);
    const metricMap = new Map(monthMetrics.map((m) => [m.offer_name, m]));

    const newRows: OfferRow[] = [];
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

    // Load email stats
    const emailData = getEmailStats(month);
    if (emailData) {
      setEmailListSize(emailData.email_list_size > 0 ? emailData.email_list_size.toString() : "");
      setEmailsSent(emailData.emails_sent > 0 ? emailData.emails_sent.toString() : "");
      setEmailOpenRate(emailData.email_open_rate > 0 ? emailData.email_open_rate.toString() : "");
      setEmailClickRate(emailData.email_click_rate > 0 ? emailData.email_click_rate.toString() : "");
    } else {
      setEmailListSize("");
      setEmailsSent("");
      setEmailOpenRate("");
      setEmailClickRate("");
    }
  }, [month, offers, existingMetrics, onFetchSources, getEmailStats]);

  const updateRow = (idx: number, field: keyof OfferRow, value: any) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const addCustomOffer = () => {
    const name = customOfferName.trim();
    if (!name) return;
    if (rows.some((r) => r.offer_name.toLowerCase() === name.toLowerCase())) return;
    setRows((prev) => [
      ...prev,
      { offer_name: name, offer_level: "user_offer", is_paid: false, visitors: "", signups: "", sales_count: "", revenue: "", linked_page_ids: [], linked_quiz_ids: [] },
    ]);
    setCustomOfferName("");
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveAll = async () => {
    // Save offer rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
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

    // Save email stats
    const hasEmailData = (parseInt(emailListSize) || 0) > 0 || (parseInt(emailsSent) || 0) > 0 || (parseFloat(emailOpenRate) || 0) > 0;
    if (hasEmailData) {
      await onSaveEmail(month, {
        email_list_size: parseInt(emailListSize) || 0,
        emails_sent: parseInt(emailsSent) || 0,
        email_open_rate: parseFloat(emailOpenRate) || 0,
        email_click_rate: parseFloat(emailClickRate) || 0,
      });
    }

    setSavingIdx(null);
    onSaveComplete?.();
  };

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div className="space-y-1 flex-1 max-w-xs">
            <Label className="font-semibold">Période des données</Label>
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
      </Card>

      {/* ── CATEGORY: Funnels ── */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-base">Funnels (par offre)</h3>
        </div>

        <div className="space-y-4">
          {rows.map((row, idx) => {
            const visitors = parseInt(row.visitors) || 0;
            const signups = parseInt(row.signups) || 0;
            const sales = parseInt(row.sales_count) || 0;
            const revenue = parseFloat(row.revenue) || 0;
            const captureRate = pct(signups, Math.max(1, visitors));
            const salesConv = row.is_paid ? pct(sales, Math.max(1, signups)) : null;

            return (
              <div key={`${row.offer_name}-${idx}`} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm">{row.offer_name}</h4>
                    <Badge variant="secondary" className="text-xs">{levelLabel(row.offer_level)}</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>Payante</span>
                      <Switch checked={row.is_paid} onCheckedChange={(v) => updateRow(idx, "is_paid", v)} />
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeRow(idx)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Visiteurs de la page de {row.is_paid ? "vente" : "capture"} de cette offre
                    </Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={row.visitors}
                      onChange={(e) => updateRow(idx, "visitors", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {row.is_paid ? "Inscrits qui ont vu la page de vente" : "Nouveaux inscrits via cette page"}
                    </Label>
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
                        <Label className="text-xs text-muted-foreground">
                          Nombre de ventes de &quot;{row.offer_name}&quot; ce mois
                        </Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={row.sales_count}
                          onChange={(e) => updateRow(idx, "sales_count", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          CA total de &quot;{row.offer_name}&quot; ce mois (EUR)
                        </Label>
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

                {/* Auto-calculated rates */}
                {(visitors > 0 || signups > 0) && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {visitors > 0 && (
                      <span className="px-2 py-1 rounded bg-muted/50">
                        Taux de capture : <strong>{captureRate}%</strong>
                      </span>
                    )}
                    {salesConv !== null && sales > 0 && (
                      <span className="px-2 py-1 rounded bg-muted/50">
                        Taux de conversion vente : <strong>{salesConv}%</strong>
                      </span>
                    )}
                    {row.is_paid && revenue > 0 && visitors > 0 && (
                      <span className="px-2 py-1 rounded bg-muted/50">
                        CA/visiteur : <strong>{(revenue / visitors).toFixed(2)} EUR</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add custom offer */}
        <div className="flex gap-2 mt-4">
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
      </Card>

      {/* ── CATEGORY: Emails ── */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-base">Emails</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Nombre total d&apos;emails dans ta liste à la fin de ce mois
            </Label>
            <Input
              type="number"
              placeholder="Ex: 350"
              value={emailListSize}
              onChange={(e) => setEmailListSize(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Nombre d&apos;emails envoyés ce mois (newsletters, sequences...)
            </Label>
            <Input
              type="number"
              placeholder="Ex: 8"
              value={emailsSent}
              onChange={(e) => setEmailsSent(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Taux d&apos;ouverture moyen des emails envoyés ce mois (%)
            </Label>
            <Input
              type="number"
              step="0.1"
              placeholder="Ex: 25.3"
              value={emailOpenRate}
              onChange={(e) => setEmailOpenRate(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Taux de clics moyen des emails envoyés ce mois (%)
            </Label>
            <Input
              type="number"
              step="0.1"
              placeholder="Ex: 3.5"
              value={emailClickRate}
              onChange={(e) => setEmailClickRate(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
      </Card>

      {/* ── Where to find data ── */}
      <Card className="p-4 border-dashed">
        <Button
          variant="ghost"
          className="w-full flex items-center justify-between p-0 h-auto hover:bg-transparent"
          onClick={() => setShowGuide(!showGuide)}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <HelpCircle className="w-4 h-4 text-muted-foreground" />
            Où trouver ces chiffres ?
          </span>
          {showGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>

        {showGuide && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="space-y-2">
              <h4 className="font-bold flex items-center gap-1.5">
                Statistiques Funnels (Systeme.io)
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </h4>
              <ul className="space-y-1.5 text-muted-foreground ml-4">
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground min-w-[120px]">Visiteurs :</span>
                  <span>Tunnels &gt; [Ton tunnel] &gt; Statistiques &gt; colonne &laquo; Pages vues &raquo; (visiteurs uniques de la page de capture ou vente)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground min-w-[120px]">Inscrits :</span>
                  <span>Tunnels &gt; Statistiques &gt; colonne « Opt-in » (personnes ayant laissé leur email)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground min-w-[120px]">Ventes :</span>
                  <span>Tunnels &gt; Statistiques &gt; &laquo; Ventes &raquo; OU Tableau de bord &gt; Ventes (filtre par produit et mois)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground min-w-[120px]">CA :</span>
                  <span>Tableau de bord &gt; Revenus (filtre par mois) OU Stripe/PayPal si paiement externe</span>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold flex items-center gap-1.5">
                Statistiques Emails (Systeme.io)
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </h4>
              <ul className="space-y-1.5 text-muted-foreground ml-4">
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground min-w-[120px]">Taille liste :</span>
                  <span>Contacts &gt; nombre total affiché en haut (prends le chiffre en fin de mois)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground min-w-[120px]">Emails envoyés :</span>
                  <span>Emails &gt; Newsletters &gt; compte les emails envoyés ce mois (newsletters + broadcasts)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground min-w-[120px]">Taux ouverture :</span>
                  <span>Emails &gt; Statistiques &gt; moyenne du taux d&apos;ouverture de tous les emails envoyés ce mois</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground min-w-[120px]">Taux de clics :</span>
                  <span>Emails &gt; Statistiques &gt; moyenne du taux de clics de tous les emails envoyés ce mois</span>
                </li>
              </ul>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Astuce :</strong> Les visiteurs et leads de tes pages Tipote sont comptabilisés automatiquement. Ici tu saisis les chiffres globaux de tes tunnels (Système.io ou autre CRM).
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSaveAll} disabled={isSaving} size="lg">
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Enregistrer tout
        </Button>
      </div>
    </div>
  );
};
