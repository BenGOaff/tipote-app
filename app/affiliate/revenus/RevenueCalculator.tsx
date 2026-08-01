"use client";

import { useState, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { useDict } from "../i18n/context";
import { interpolate } from "../i18n";

// Taux de commission réels du programme (Béné 17 juil 2026 : pas de
// palier, taux fixes).
const ATELIER_RATE = 0.7;
const TIQUIZ_RATE = 0.4;

// Prix publics réels. On n'invente aucun chiffre : l'Atelier du Quiz est
// un paiement unique à 47 €, l'abonnement Tiquiz mensuel est à 9 €/mois.
// Les autres plans Tiquiz (annuel, Plus) rapportent davantage : la
// simulation prend volontairement le plan le moins cher pour rester
// conservative.
const ATELIER_PRICE_EUR = 47;
const TIQUIZ_MONTHLY_EUR = 9;

// Un abonné ramené au mois m rapporte une commission de m à m+11. Sur une
// fenêtre de 12 mois avec un rythme constant, ça fait 12+11+…+1 = 78 mois
// de commission cumulés. C'est ce qui fait que le récurrent grossit.
const RECURRING_MONTHS_OVER_YEAR = 78;

function eur(value: number, decimals = 0): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function RevenueCalculator({ showAtelier = true }: { showAtelier?: boolean }) {
  const t = useDict();
  const [atelierSales, setAtelierSales] = useState(showAtelier ? 3 : 0);
  const [tiquizSubs, setTiquizSubs] = useState(3);

  const projected = useMemo(() => {
    const atelierMonth = showAtelier ? atelierSales * ATELIER_PRICE_EUR * ATELIER_RATE : 0;
    const tiquizMonth = tiquizSubs * TIQUIZ_MONTHLY_EUR * TIQUIZ_RATE;
    const atelierYear = atelierMonth * 12;
    const tiquizYear = tiquizSubs * TIQUIZ_MONTHLY_EUR * TIQUIZ_RATE * RECURRING_MONTHS_OVER_YEAR;
    return {
      month: atelierMonth + tiquizMonth,
      year: atelierYear + tiquizYear,
      atelierYear,
      tiquizYear,
    };
  }, [atelierSales, tiquizSubs, showAtelier]);

  return (
    <div className="space-y-6">
      {showAtelier && (
        <SalesSlider
          label={t.revenus.calculator_atelier_sales}
          value={atelierSales}
          onChange={setAtelierSales}
        />
      )}

      <SalesSlider
        label={t.revenus.calculator_tiquiz_subs}
        value={tiquizSubs}
        onChange={setTiquizSubs}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4 border-t border-border">
        <Stat label={t.revenus.calculator_month_total} value={eur(projected.month)} highlight />
        <Stat label={t.revenus.calculator_year_total} value={eur(projected.year)} success />
      </div>

      {showAtelier && projected.year > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {interpolate(t.revenus.calculator_breakdown, {
            atelier: eur(projected.atelierYear),
            tiquiz: eur(projected.tiquizYear),
          })}
        </p>
      )}

      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 space-y-2">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {showAtelier
            ? interpolate(t.revenus.calculator_per_unit, {
                atelierUnit: eur(ATELIER_PRICE_EUR * ATELIER_RATE, 2),
                tiquizUnit: eur(TIQUIZ_MONTHLY_EUR * TIQUIZ_RATE * 12, 2),
              })
            : interpolate(t.revenus.calculator_per_unit_tiquiz, {
                tiquizUnit: eur(TIQUIZ_MONTHLY_EUR * TIQUIZ_RATE * 12, 2),
              })}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {interpolate(t.revenus.calculator_assumptions, {
            atelier: eur(ATELIER_PRICE_EUR),
            tiquiz: eur(TIQUIZ_MONTHLY_EUR),
          })}
        </p>
      </div>
    </div>
  );
}

function SalesSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-lg font-bold">{value}</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        min={0}
        max={30}
        step={1}
        className="my-2"
      />
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
