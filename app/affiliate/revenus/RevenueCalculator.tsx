"use client";

import { useState, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useDict } from "../i18n/context";
import { interpolate } from "../i18n";
import {
  COMMISSION_BASE,
  COMMISSION_RATES,
  PRICES_TTC_EUR,
  commissionEur,
} from "@/lib/affiliate/commission";

// Les taux, les prix et LE CALCUL vivent dans lib/affiliate/commission.ts.
// Ce composant ne recalcule rien : il affichait `PRIX_TTC x TAUX` alors
// que le paiement se fait sur le HT, donc il annonçait 16,7% de trop
// (drame du 19 août 2026, voir l'en-tête du module).
const ATELIER_PRICE_EUR = PRICES_TTC_EUR.atelier;
const TIQUIZ_PRICE_EUR = {
  simple: PRICES_TTC_EUR.tiquiz_monthly,
  plus: PRICES_TTC_EUR.tiquiz_monthly_plus,
} as const;

/** La commission d'une vente, telle qu'elle sera VERSÉE. */
function commission(ttcEur: number, rate: number): number {
  return commissionEur({ ttcEur, rate, base: COMMISSION_BASE });
}

type TiquizPlan = keyof typeof TIQUIZ_PRICE_EUR;

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
  const [plan, setPlan] = useState<TiquizPlan>("simple");
  const tiquizPrice = TIQUIZ_PRICE_EUR[plan];

  const projected = useMemo(() => {
    const atelierUnit = commission(ATELIER_PRICE_EUR, COMMISSION_RATES.atelier);
    const tiquizUnit = commission(tiquizPrice, COMMISSION_RATES.tiquiz);
    const atelierMonth = showAtelier ? atelierSales * atelierUnit : 0;
    const tiquizMonth = tiquizSubs * tiquizUnit;
    const atelierYear = atelierMonth * 12;
    const tiquizYear = tiquizSubs * tiquizUnit * RECURRING_MONTHS_OVER_YEAR;
    return {
      month: atelierMonth + tiquizMonth,
      year: atelierYear + tiquizYear,
      atelierYear,
      tiquizYear,
    };
  }, [atelierSales, tiquizSubs, tiquizPrice, showAtelier]);

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

      {/* Deux niveaux Tiquiz : l'accès simple (solo, un projet) et le Plus
          (agence, freelance qui vend des prestations, multi-projets). Le
          Plus triple la commission récurrente, l'affilié doit le voir. */}
      <div>
        <p className="text-sm font-medium mb-2">{t.revenus.calculator_tiquiz_plan}</p>
        <div className="flex flex-wrap gap-2">
          {(["simple", "plus"] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={plan === p ? "default" : "outline"}
              onClick={() => setPlan(p)}
            >
              {p === "simple" ? t.revenus.calculator_plan_simple : t.revenus.calculator_plan_plus}
            </Button>
          ))}
        </div>
      </div>

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
                atelierUnit: eur(commission(ATELIER_PRICE_EUR, COMMISSION_RATES.atelier), 2),
                tiquizUnit: eur(commission(tiquizPrice, COMMISSION_RATES.tiquiz) * 12, 2),
              })
            : interpolate(t.revenus.calculator_per_unit_tiquiz, {
                tiquizUnit: eur(commission(tiquizPrice, COMMISSION_RATES.tiquiz) * 12, 2),
              })}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {interpolate(t.revenus.calculator_assumptions, {
            atelier: eur(ATELIER_PRICE_EUR),
            tiquiz: eur(tiquizPrice),
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
