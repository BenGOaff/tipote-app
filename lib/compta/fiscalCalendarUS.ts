// lib/compta/fiscalCalendarUS.ts
//
// Échéances fiscales pour les users américains. UI en français,
// noms officiels des forms IRS conservés (1040, 1120, 1120-S, 1065,
// 1040-ES, 1099-NEC, Schedule C, K-1, etc.).
//
// Spécificités modélisées :
//   - 5 statuts : sole prop / single-member LLC / multi-member LLC /
//     C-Corp / S-Corp. LLC peut élire S/C via Form 2553 ou 8832.
//   - 9 états sans state income tax sur revenus business : AK, FL,
//     NV, NH, SD, TN, TX, WA, WY → on n'émet pas d'échéance state.
//   - Sales tax : par état inscrit (us_sales_tax_states), périodicité
//     mensuelle par défaut (assignée par chaque state department of
//     revenue). 5 états sans sales tax : NH, OR, MT, DE (et AK qui
//     n'en a pas au niveau state mais en a au niveau local).
//   - Estimated taxes (1040-ES) : Q1 15/04, Q2 15/06, Q3 15/09,
//     Q4 15/01 N+1. Obligatoire si tax due > 1 000 $/an.
//   - Self-employment tax (15.3 %) : payé via 1040 + estimated taxes,
//     pas d'échéance distincte.
//   - 1099-NEC pour les contractors payés > 600 $/an : 31 janvier.

import type { FiscalDeadline } from "./fiscalCalendar";

export interface FiscalProfileUS {
  accounting_status:
    | "particulier"
    | "sole_proprietorship_us"
    | "single_member_llc_us"
    | "multi_member_llc_us"
    | "c_corp_us"
    | "s_corp_us"
    | null;
  us_state: string | null;
  us_ein: string | null;
  us_llc_tax_classification: "disregarded" | "partnership" | "s_corp" | "c_corp" | null;
  us_sales_tax_states: string[];
  us_fiscal_year_calendar: boolean;
  us_fiscal_year_start_month: number | null;
  us_started_at: string | null;
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function utcDate(year: number, m: number, day: number): Date {
  return new Date(Date.UTC(year, m - 1, day));
}

function* iterateMonths(from: Date, to: Date): Generator<{ year: number; month: number }> {
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cur <= end) {
    yield { year: cur.getUTCFullYear(), month: cur.getUTCMonth() + 1 };
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
}

const FRENCH_MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const fr = (m: number) => FRENCH_MONTHS[m - 1] ?? String(m);

const NO_INCOME_TAX_STATES = new Set([
  "AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY",
]);

function hasStateIncomeTax(state: string | null): boolean {
  if (!state) return false;
  return !NO_INCOME_TAX_STATES.has(state);
}

/** Détermine l'effective entity type pour le calendrier (en tenant
 *  compte de l'élection LLC). */
type EffectiveEntity = "schedule_c" | "partnership" | "s_corp" | "c_corp";

function effectiveEntity(profile: FiscalProfileUS): EffectiveEntity | null {
  const s = profile.accounting_status;
  if (!s || s === "particulier") return null;
  if (s === "sole_proprietorship_us") return "schedule_c";
  if (s === "c_corp_us") return "c_corp";
  if (s === "s_corp_us") return "s_corp";
  if (s === "single_member_llc_us") {
    const c = profile.us_llc_tax_classification;
    if (c === "s_corp") return "s_corp";
    if (c === "c_corp") return "c_corp";
    return "schedule_c"; // disregarded par défaut
  }
  if (s === "multi_member_llc_us") {
    const c = profile.us_llc_tax_classification;
    if (c === "s_corp") return "s_corp";
    if (c === "c_corp") return "c_corp";
    return "partnership"; // partnership par défaut
  }
  return null;
}

// ───────────────────────── Form 1040 (individual income tax) ─────────────────────────

function form1040US(profile: FiscalProfileUS, from: Date, to: Date): FiscalDeadline[] {
  // Le 1040 concerne les particuliers + tous les pass-through (sole
  // prop, LLC disregarded, partnership members, S-Corp shareholders)
  // qui rapportent leur part des revenus sur leur 1040 personnel.
  const eff = effectiveEntity(profile);
  if (
    profile.accounting_status !== "particulier" &&
    eff !== "schedule_c" &&
    eff !== "partnership" &&
    eff !== "s_corp"
  ) return [];

  const out: FiscalDeadline[] = [];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    // 15 avril année N pour les revenus de N-1.
    const due = utcDate(year, 4, 15);
    if (due >= from && due <= to) {
      out.push({
        id: `us-1040-${year - 1}`,
        dueDate: ymd(due),
        kind: "ir_2042",
        title: `Form 1040 (federal income tax) — tax year ${year - 1}`,
        description: `Production et paiement du 1040 fédéral dus le 15 avril. Extension automatique disponible via Form 4868 (production repoussée au 15 octobre, mais paiement reste dû au 15 avril).`,
        officialUrl: "https://www.irs.gov/forms-pubs/about-form-1040",
        severity: "important",
      });
    }
    // State income tax — la plupart des états alignent leur deadline
    // sur le 15 avril fédéral. On émet un rappel groupé sauf pour
    // les 9 états sans income tax.
    if (hasStateIncomeTax(profile.us_state)) {
      const stateDue = utcDate(year, 4, 15);
      if (stateDue >= from && stateDue <= to) {
        out.push({
          id: `us-state-tax-${profile.us_state}-${year - 1}`,
          dueDate: ymd(stateDue),
          kind: "ir_2042",
          title: `${profile.us_state} state income tax — tax year ${year - 1}`,
          description: `Déclaration et paiement du state income tax (${profile.us_state}) généralement alignés sur le 15 avril fédéral. Vérifie le portail de ton state department of revenue pour les éventuelles spécificités locales.`,
          officialUrl: stateRevenueUrl(profile.us_state),
          severity: "normal",
        });
      }
    }
  }
  return out;
}

function stateRevenueUrl(state: string | null): string {
  // URL générique — les portails officiels par état ne sont pas
  // tous au même format. On pointe sur l'IRS en fallback (qui a un
  // index des state portals).
  if (!state) return "https://www.irs.gov/tax-professionals/government-sites";
  return `https://www.irs.gov/tax-professionals/government-sites`;
}

// ───────────────────────── Estimated taxes (Form 1040-ES) ─────────────────────────

function estimatedTaxesUS(profile: FiscalProfileUS, from: Date, to: Date): FiscalDeadline[] {
  // Les estimated taxes concernent tous les pass-through (sole prop,
  // LLC disregarded, partnership members, S-Corp shareholders) dès
  // que la dette fiscale annuelle dépasse 1 000 $.
  const eff = effectiveEntity(profile);
  if (eff !== "schedule_c" && eff !== "partnership" && eff !== "s_corp") return [];

  const out: FiscalDeadline[] = [];
  // Q1 15/04, Q2 15/06, Q3 15/09, Q4 15/01 N+1.
  const quarters: Array<{ q: 1 | 2 | 3 | 4; m: number; d: number; periodLabel: string; nextYearDue: boolean }> = [
    { q: 1, m: 4,  d: 15, periodLabel: "Q1 (jan-mars)",  nextYearDue: false },
    { q: 2, m: 6,  d: 15, periodLabel: "Q2 (avr-mai)",   nextYearDue: false },
    { q: 3, m: 9,  d: 15, periodLabel: "Q3 (juin-août)", nextYearDue: false },
    { q: 4, m: 1,  d: 15, periodLabel: "Q4 (sept-déc)",  nextYearDue: true  },
  ];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    for (const q of quarters) {
      const periodYear = q.nextYearDue ? year - 1 : year;
      const due = utcDate(year, q.m, q.d);
      if (due < from || due > to) continue;
      out.push({
        id: `us-1040es-${periodYear}-q${q.q}`,
        dueDate: ymd(due),
        kind: "ir_2042",
        title: `Estimated tax (1040-ES) — ${q.periodLabel} ${periodYear}`,
        description: `Acompte trimestriel d'estimated tax (federal income tax + self-employment tax 15,3 %). Obligatoire si la dette fiscale annuelle dépasse 1 000 $. Verse via IRS Direct Pay ou EFTPS.`,
        officialUrl: "https://www.irs.gov/forms-pubs/about-form-1040-es",
        severity: "normal",
      });
    }
  }
  return out;
}

// ───────────────────────── Form 1120 (C-Corp income tax) ─────────────────────────

function fiscalYearEndsUS(profile: FiscalProfileUS, from: Date, to: Date): Array<{ endDate: Date }> {
  const out: Array<{ endDate: Date }> = [];
  const startMonth = profile.us_fiscal_year_calendar
    ? 1
    : profile.us_fiscal_year_start_month ?? 1;
  for (let year = from.getUTCFullYear() - 1; year <= to.getUTCFullYear() + 1; year++) {
    const endMonth = startMonth === 1 ? 12 : startMonth - 1;
    const endDate = utcDate(year, endMonth + 1, 0);
    out.push({ endDate });
  }
  return out;
}

function form1120CCorp(profile: FiscalProfileUS, from: Date, to: Date): FiscalDeadline[] {
  if (effectiveEntity(profile) !== "c_corp") return [];

  const out: FiscalDeadline[] = [];
  for (const fy of fiscalYearEndsUS(profile, from, to)) {
    // C-Corp 1120 : dû le 15e jour du 4e mois après la fin d'exercice
    // (= 15 avril pour calendar year). Extension automatique 6 mois.
    const due = new Date(Date.UTC(
      fy.endDate.getUTCFullYear(),
      fy.endDate.getUTCMonth() + 4,
      15,
    ));
    if (due >= from && due <= to) {
      out.push({
        id: `us-1120-${fy.endDate.getUTCFullYear()}-${fy.endDate.getUTCMonth() + 1}`,
        dueDate: ymd(due),
        kind: "is_solde",
        title: `Form 1120 (C-Corp federal income tax) — fiscal year ending ${ymd(fy.endDate)}`,
        description: `Form 1120 due le 15e jour du 4e mois après la fin d'exercice (15 avril pour calendar year). Taux fédéral flat 21 %. Extension automatique de 6 mois via Form 7004. Les actionnaires paient à nouveau l'impôt sur les dividendes reçus (double taxation).`,
        officialUrl: "https://www.irs.gov/forms-pubs/about-form-1120",
        severity: "important",
      });
    }
    // Estimated tax C-Corp : 15/04, 15/06, 15/09, 15/12 (Form 1120-W)
    for (const m of [4, 6, 9, 12] as const) {
      const acomp = utcDate(fy.endDate.getUTCFullYear(), m, 15);
      if (acomp < from || acomp > to) continue;
      out.push({
        id: `us-1120w-${fy.endDate.getUTCFullYear()}-${m}`,
        dueDate: ymd(acomp),
        kind: "is_acompte",
        title: `C-Corp estimated tax (Form 1120-W) — ${fr(m)} ${fy.endDate.getUTCFullYear()}`,
        description: `Acompte fédéral C-Corp (15 mars/juin/sept/déc en calendar year). Obligatoire si la dette fiscale dépasse 500 $/an.`,
        officialUrl: "https://www.irs.gov/forms-pubs/about-form-1120-w",
        severity: "normal",
      });
    }
  }
  return out;
}

// ───────────────────────── Form 1120-S (S-Corp) et Form 1065 (Partnership) ─────────────────────────

function form1120SOr1065(profile: FiscalProfileUS, from: Date, to: Date): FiscalDeadline[] {
  const eff = effectiveEntity(profile);
  if (eff !== "s_corp" && eff !== "partnership") return [];

  const isPartnership = eff === "partnership";
  const formName = isPartnership ? "Form 1065" : "Form 1120-S";
  const formUrl = isPartnership
    ? "https://www.irs.gov/forms-pubs/about-form-1065"
    : "https://www.irs.gov/forms-pubs/about-form-1120-s";

  const out: FiscalDeadline[] = [];
  for (const fy of fiscalYearEndsUS(profile, from, to)) {
    // S-Corp et Partnership : dû le 15e jour du 3e mois après la fin
    // d'exercice (= 15 mars pour calendar year). Extension auto 6 mois.
    const due = new Date(Date.UTC(
      fy.endDate.getUTCFullYear(),
      fy.endDate.getUTCMonth() + 3,
      15,
    ));
    if (due >= from && due <= to) {
      out.push({
        id: `us-${isPartnership ? "1065" : "1120s"}-${fy.endDate.getUTCFullYear()}-${fy.endDate.getUTCMonth() + 1}`,
        dueDate: ymd(due),
        kind: "is_solde",
        title: `${formName} (${isPartnership ? "Partnership" : "S-Corp"} return) — fiscal year ending ${ymd(fy.endDate)}`,
        description: `${formName} due le 15e jour du 3e mois après la fin d'exercice (15 mars pour calendar year). Pass-through : pas d'impôt fédéral au niveau de l'entité, les revenus passent sur les K-1 des associés/actionnaires. Extension automatique 6 mois via Form 7004.`,
        officialUrl: formUrl,
        severity: "important",
      });
    }
  }
  return out;
}

// ───────────────────────── Form 1099-NEC (independent contractors) ─────────────────────────

function form1099NEC(profile: FiscalProfileUS, from: Date, to: Date): FiscalDeadline[] {
  // Concerne toutes les entités qui paient des contractors > 600 $/an.
  // On émet un rappel pour tout statut business (pas pour particulier).
  if (
    profile.accounting_status === null ||
    profile.accounting_status === "particulier"
  ) return [];

  const out: FiscalDeadline[] = [];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    const due = utcDate(year, 1, 31);
    if (due < from || due > to) continue;
    out.push({
      id: `us-1099nec-${year - 1}`,
      dueDate: ymd(due),
      kind: "dsn",
      title: `Form 1099-NEC — tax year ${year - 1}`,
      description: `Form 1099-NEC à émettre pour chaque contractor non-employé payé plus de 600 $ sur ${year - 1}. Copie au contractor + filing à l'IRS dus le 31 janvier. Form 1096 cover sheet si filing papier (e-filing requis si 10+ forms depuis 2024).`,
      officialUrl: "https://www.irs.gov/forms-pubs/about-form-1099-nec",
      severity: "normal",
    });
  }
  return out;
}

// ───────────────────────── Sales tax (par état inscrit) ─────────────────────────

function salesTaxUS(profile: FiscalProfileUS, from: Date, to: Date): FiscalDeadline[] {
  if (!profile.us_sales_tax_states || profile.us_sales_tax_states.length === 0) return [];
  if (
    profile.accounting_status === null ||
    profile.accounting_status === "particulier"
  ) return [];

  const out: FiscalDeadline[] = [];
  // Périodicité par défaut : mensuelle. Chaque state department of
  // revenue assigne sa propre fréquence (mens/trim/annuelle) selon
  // le volume — l'user peut adapter dans la UI plus tard. Pour MVP,
  // on émet un rappel mensuel par état avec échéance le 20 du mois
  // suivant (cas le plus courant : CA, NY, TX, FL le sont au 20).
  for (const state of profile.us_sales_tax_states) {
    for (const { year, month } of iterateMonths(from, to)) {
      const dueMonth = month === 12 ? 1 : month + 1;
      const dueYear = month === 12 ? year + 1 : year;
      const due = utcDate(dueYear, dueMonth, 20);
      if (due < from || due > to) continue;
      out.push({
        id: `us-salestax-${state}-${year}-${String(month).padStart(2, "0")}`,
        dueDate: ymd(due),
        kind: "tva",
        title: `Sales tax ${state} — ${fr(month)} ${year}`,
        description: `Déclaration et reversement de la sales tax collectée au ${state} pour ${fr(month)} ${year}. Échéance courante le 20 du mois suivant — confirme la périodicité exacte assignée par le ${state} department of revenue (mens/trim/annuelle selon ton volume).`,
        officialUrl: stateRevenueUrl(state),
        severity: "normal",
      });
    }
  }
  return out;
}

// ───────────────────────── Annual report (state filing fee) ─────────────────────────

function annualReportUS(profile: FiscalProfileUS, from: Date, to: Date): FiscalDeadline[] {
  // LLC / Corp doivent déposer un annual report (ou biennial) auprès
  // de la state Secretary of State. Date variable selon l'état (souvent
  // anniversaire de formation, ou date fixe). On émet un rappel
  // approximatif au 1er trimestre — l'user ajustera si son état utilise
  // une autre date.
  const s = profile.accounting_status;
  if (
    s !== "single_member_llc_us" &&
    s !== "multi_member_llc_us" &&
    s !== "c_corp_us" &&
    s !== "s_corp_us"
  ) return [];

  const out: FiscalDeadline[] = [];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    const due = utcDate(year, 3, 31);
    if (due < from || due > to) continue;
    out.push({
      id: `us-annual-report-${profile.us_state ?? "XX"}-${year}`,
      dueDate: ymd(due),
      kind: "bilan",
      title: `Annual report ${profile.us_state ? `(${profile.us_state})` : ""} ${year}`,
      description: `Annual report (ou biennial selon l'état) à déposer auprès du Secretary of State ${profile.us_state ?? ""}. Date exacte variable selon l'état (souvent anniversaire de formation). Frais de filing typiques 50-500 $. Le rappel ici est approximatif — vérifie ta date sur le portail de ton état.`,
      officialUrl: "https://www.usa.gov/state-business",
      severity: "normal",
    });
  }
  return out;
}

// ───────────────────────── Entrée principale ─────────────────────────

export function computeFiscalDeadlinesUS(
  profile: FiscalProfileUS,
  from: Date,
  to: Date,
): FiscalDeadline[] {
  if (!profile.accounting_status) return [];
  const out: FiscalDeadline[] = [];

  out.push(...form1040US(profile, from, to));
  out.push(...estimatedTaxesUS(profile, from, to));
  out.push(...form1120CCorp(profile, from, to));
  out.push(...form1120SOr1065(profile, from, to));
  out.push(...form1099NEC(profile, from, to));
  out.push(...salesTaxUS(profile, from, to));
  out.push(...annualReportUS(profile, from, to));

  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
