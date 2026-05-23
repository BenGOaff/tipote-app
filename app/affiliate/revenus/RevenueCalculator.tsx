"use client";

import { useState, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useDict } from "../i18n/context";
import { interpolate } from "../i18n";

// Mêmes paliers que lib/affiliate/attribution.ts
const TIERS = [
  { minSales: 0, rate: 0.4 },
  { minSales: 10, rate: 0.45 },
  { minSales: 25, rate: 0.5 },
];

// Panier moyen mixte Tiquiz + Tipote (approximation conservative en €).
// 1/3 gratuit (0 €), 1/3 mensuel (9 €), 1/3 annuel (90 €).
// Sur les payants, en pondérant LTV à 1 an : (9×12 + 90)/2 ≈ 99 €.
// On prend 75 € pour rester conservatif.
const AVG_CART_EUR = 75;
const PRESET_VISITORS = [100, 300, 500, 1000, 2000];

function rateForSales(sales: number): number {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (sales >= TIERS[i].minSales) return TIERS[i].rate;
  }
  return TIERS[0].rate;
}

function eur(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function RevenueCalculator({ currentTier }: { currentTier: number }) {
  const t = useDict();
  const [visitors, setVisitors] = useState(200);
  const [conversionRate, setConversionRate] = useState(3); // %

  const projected = useMemo(() => {
    const sales = (visitors * conversionRate) / 100;
    const totalSalesProjected = currentTier + sales;
    const rate = rateForSales(Math.floor(totalSalesProjected));
    const revenueMonth = sales * AVG_CART_EUR * rate;
    return {
      sales: Math.round(sales * 10) / 10,
      rate,
      revenueMonth: Math.round(revenueMonth),
      revenueYear: Math.round(revenueMonth * 12),
    };
  }, [visitors, conversionRate, currentTier]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">{t.revenus.calculator_visitors}</label>
          <span className="text-lg font-bold">{visitors.toLocaleString("fr-FR")}</span>
        </div>
        <Slider
          value={[visitors]}
          onValueChange={(v) => setVisitors(v[0])}
          min={50}
          max={5000}
          step={50}
          className="my-2"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {PRESET_VISITORS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={visitors === p ? "default" : "outline"}
              onClick={() => setVisitors(p)}
              className="h-7 px-2.5 text-xs"
            >
              {p.toLocaleString("fr-FR")}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">{t.revenus.calculator_conversion_rate}</label>
          <span className="text-lg font-bold">{conversionRate}%</span>
        </div>
        <Slider
          value={[conversionRate]}
          onValueChange={(v) => setConversionRate(v[0])}
          min={0.5}
          max={10}
          step={0.5}
          className="my-2"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {t.revenus.calculator_rate_hint}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-border">
        <Stat label={t.revenus.calculator_sales_per_month} value={projected.sales.toLocaleString("fr-FR")} />
        <Stat label={t.revenus.calculator_revenue_per_month} value={eur(projected.revenueMonth)} highlight />
        <Stat label={t.revenus.calculator_revenue_per_year} value={eur(projected.revenueYear)} success />
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {interpolate(t.revenus.calculator_disclaimer, {
          avgCart: `${AVG_CART_EUR} €`,
          rate: Math.round(projected.rate * 100),
          totalSales: currentTier,
        })}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight = false,
  success = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  success?: boolean;
}) {
  const classes = highlight
    ? "border-primary/30 bg-primary/5"
    : success
      ? "border-emerald-300/40 bg-emerald-50 dark:bg-emerald-950/20"
      : "";
  const textClasses = highlight
    ? "text-primary"
    : success
      ? "text-emerald-700 dark:text-emerald-300"
      : "";
  return (
    <div className={`rounded-lg border p-4 text-center ${classes}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className={`text-2xl font-bold tracking-tight ${textClasses}`}>{value}</div>
    </div>
  );
}
