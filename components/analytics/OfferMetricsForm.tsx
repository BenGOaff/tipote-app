"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Save, Plus, Trash2, HelpCircle, ChevronDown, ChevronUp, Mail, BarChart3, ExternalLink, CalendarIcon } from "lucide-react";
import { format, startOfMonth, subMonths, parseISO } from "date-fns";
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

const getQuickDates = (todayLabel: string) => {
  const dates: Array<{ value: string; label: string }> = [];
  const now = new Date();
  // Today
  dates.push({
    value: format(now, "yyyy-MM-dd"),
    label: `${todayLabel} (${format(now, "d MMM yyyy", { locale: fr })})`,
  });
  // Last 6 months (first of month)
  for (let i = 0; i < 6; i++) {
    const date = startOfMonth(subMonths(now, i));
    dates.push({
      value: format(date, "yyyy-MM-dd"),
      label: format(date, "MMMM yyyy", { locale: fr }),
    });
  }
  return dates;
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
  const t = useTranslations("offerMetrics");
  const quickDates = useMemo(() => getQuickDates(t("today")), [t]);
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM-dd"));
  const [calendarOpen, setCalendarOpen] = useState(false);

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
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div className="space-y-1">
            <Label className="font-semibold">{t("dateLabel")}</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[240px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(parseISO(month), "d MMMM yyyy", { locale: fr })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={parseISO(month)}
                  onSelect={(date) => {
                    if (date) {
                      setMonth(format(date, "yyyy-MM-dd"));
                      setCalendarOpen(false);
                    }
                  }}
                  locale={fr}
                  disabled={(date) => date > new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {quickDates.map((d) => (
              <Button
                key={d.value}
                variant={month === d.value ? "default" : "outline"}
                size="sm"
                className="text-xs h-7"
                onClick={() => setMonth(d.value)}
              >
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {/* ── CATEGORY: Pages ── */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-base">{t("pagesSection")}</h3>
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
                      <span>{t("paid")}</span>
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
                      {row.is_paid ? t("visitorsSale") : t("visitorsCapture")}
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
                      {row.is_paid ? t("signupsSale") : t("signupsCapture")}
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
                          {t("salesCount", { name: row.offer_name })}
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
                          {t("revenueLabel", { name: row.offer_name })}
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
                        {t("captureRate")} <strong>{captureRate}%</strong>
                      </span>
                    )}
                    {salesConv !== null && sales > 0 && (
                      <span className="px-2 py-1 rounded bg-muted/50">
                        {t("salesConvRate")} <strong>{salesConv}%</strong>
                      </span>
                    )}
                    {row.is_paid && revenue > 0 && visitors > 0 && (
                      <span className="px-2 py-1 rounded bg-muted/50">
                        {t("revenuePerVisitor")} <strong>{(revenue / visitors).toFixed(2)} EUR</strong>
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
            placeholder={t("addOfferPlaceholder")}
            className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && addCustomOffer()}
          />
          <Button variant="outline" onClick={addCustomOffer} disabled={!customOfferName.trim()}>
            <Plus className="w-4 h-4 mr-1" /> {t("add")}
          </Button>
        </div>
      </Card>

      {/* ── CATEGORY: Emails ── */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-base">{t("emails")}</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("emailsListLabel")}
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
              {t("emailsSentLabel")}
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
              {t("emailsOpenLabel")}
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
              {t("emailsClickLabel")}
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
            {t("whereToFind")}
          </span>
          {showGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>

        {showGuide && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="space-y-2">
              <h4 className="font-bold flex items-center gap-1.5">
                {t("guidePagesTitle")}
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </h4>
              <ul className="space-y-1.5 text-muted-foreground ml-4">
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground min-w-[80px] sm:min-w-[120px]">{t("guideVisitors")}</span>
                  <span>{t("guideVisitorsDesc")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground min-w-[80px] sm:min-w-[120px]">{t("guideSignups")}</span>
                  <span>{t("guideSignupsDesc")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground min-w-[80px] sm:min-w-[120px]">{t("guideSales")}</span>
                  <span>{t("guideSalesDesc")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground min-w-[80px] sm:min-w-[120px]">{t("guideRevenue")}</span>
                  <span>{t("guideRevenueDesc")}</span>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold flex items-center gap-1.5">
                {t("guideEmailsTitle")}
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </h4>
              <ul className="space-y-1.5 text-muted-foreground ml-4">
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground min-w-[80px] sm:min-w-[120px]">{t("guideListSize")}</span>
                  <span>{t("guideListSizeDesc")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground min-w-[80px] sm:min-w-[120px]">{t("guideEmailsSent")}</span>
                  <span>{t("guideEmailsSentDesc")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground min-w-[80px] sm:min-w-[120px]">{t("guideOpenRate")}</span>
                  <span>{t("guideOpenRateDesc")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-foreground min-w-[80px] sm:min-w-[120px]">{t("guideClickRate")}</span>
                  <span>{t("guideClickRateDesc")}</span>
                </li>
              </ul>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">{t("tipLabel")}</strong> {t("tipText")}
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSaveAll} disabled={isSaving} size="lg">
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {t("saveAll")}
        </Button>
      </div>
    </div>
  );
};
