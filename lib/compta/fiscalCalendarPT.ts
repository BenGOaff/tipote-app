// lib/compta/fiscalCalendarPT.ts
//
// Calculateur d'échéances fiscales pour les users PORTUGAIS (phase 1o).
// Symétrique à fiscalCalendar.ts (FR) et fiscalCalendarCH.ts (CH).
//
// **Règle UI** : tous les textes affichés à l'user sont en FRANÇAIS
// (titres, descriptions, badges) même si l'user travaille au Portugal —
// l'interface Tipote est francophone. On garde uniquement les noms
// officiels portugais des déclarations (Modelo 22, IRS, IRC, NIF,
// e-fatura, AT, CIVA, etc.) qui sont des termes intraduisibles.
//
// Calendrier couvert :
//
//   • IVA (TVA portugaise) selon périodicité :
//     - Mensuelle (CA > 650k €) : déclaration jour 25 du 2e mois
//       suivant. Ex : IVA juin → 25 août.
//     - Trimestrielle (CA < 650k €) : T1→25 mai, T2→25 août,
//       T3→25 nov, T4→25 fév N+1.
//
//   • IRS (impôt personnel) — Modelo 3 entre le 1er avril et le
//     30 juin de l'année N+1 pour les revenus N. On retient 30 juin
//     comme date butoir.
//
//   • IRC (impôt société) — Modelo 22 jusqu'au 31 mai de l'année
//     N+1. Pour exercice civil (le plus courant). Pour exercice
//     décalé : 5e mois après clôture.
//
//   • Acomptes IRC (pagamento por conta) — 3 par an pour les
//     sociétés à l'IRC : 31 juillet, 30 septembre, 15 décembre.
//     Calculés sur l'IRC de l'année N-1.
//
//   • Segurança Social (indépendants uniquement) — paiement
//     mensuel le 20 du mois suivant. Calculé sur le revenu
//     pertinente déclaré chaque trimestre.
//
//   • E-fatura (comunicação de faturas) — communication mensuelle
//     des factures émises à l'AT, jour 5 du mois suivant. Concerne
//     tous les statuts assujettis.

import type { FiscalDeadline } from "./fiscalCalendar";

export interface FiscalProfilePT {
  accounting_status:
    | "particulier"
    | "trabalhador_independente_pt"
    | "eni_pt"
    | "lda_unipessoal_pt"
    | "lda_pt"
    | "sa_pt"
    | null;
  pt_nif: string | null;
  pt_region: "continente" | "madeira" | "acores" | null;
  pt_iva_isento: boolean;
  pt_iva_periodicity: "mensal" | "trimestral" | null;
  pt_tax_regime: "simplificado" | "organizada" | null;
  pt_started_at: string | null;
  /** Pour LDA/SA : exercice civil ou décalé. On réutilise les
   *  colonnes sasu_fiscal_year_* (la majorité des sociétés PT
   *  clôturent au 31/12). */
  sasu_fiscal_year_calendar: boolean;
  sasu_fiscal_year_start_month: number | null;
}

// ─── Helpers date ───────────────────────────────────────────────

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function utcDate(year: number, month1to12: number, day: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, day));
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

function frenchMonthName(month1to12: number): string {
  return FRENCH_MONTHS[month1to12 - 1] ?? String(month1to12);
}

// ─── Builders ───────────────────────────────────────────────────

/** IVA (TVA portugaise) — date butoir = jour 25 du 2e mois suivant
 *  la période. Mensuelle si CA > 650k €, trimestrielle sinon. */
function ivaPT(profile: FiscalProfilePT, from: Date, to: Date): FiscalDeadline[] {
  if (profile.pt_iva_isento) return [];
  const periodicity = profile.pt_iva_periodicity ?? "trimestral";
  const out: FiscalDeadline[] = [];

  const description = (period: string) =>
    `Dépose ta déclaration IVA pour ${period} sur le portail Finanças (portaldasfinancas.gov.pt). Le seuil de franchise est 15 000 € de CA — au-dessus, tu collectes la TVA et déclares chaque mois ou trimestre.`;

  if (periodicity === "mensal") {
    for (const { year, month } of iterateMonths(from, to)) {
      // Le mois M est dû le 25 du mois M+2.
      const declMonth = ((month - 1 + 2) % 12) + 1;
      const declYear = year + Math.floor((month - 1 + 2) / 12);
      const due = utcDate(declYear, declMonth, 25);
      if (due < from || due > to) continue;
      out.push({
        id: `pt-iva-mens-${year}-${String(month).padStart(2, "0")}`,
        dueDate: ymd(due),
        kind: "tva",
        title: `Déclaration IVA mensuelle — ${frenchMonthName(month)} ${year}`,
        description: description(`${frenchMonthName(month)} ${year}`),
        officialUrl: "https://www.portaldasfinancas.gov.pt/",
        severity: "important",
      });
    }
  } else {
    // Trimestriel : T1 (jan-mar) → 25 mai, T2 (avr-juin) → 25 août,
    // T3 (juil-sep) → 25 nov, T4 (oct-déc) → 25 fév N+1.
    const quarters: Array<{ q: 1 | 2 | 3 | 4; dueMonth: number; label: string }> = [
      { q: 1, dueMonth: 5, label: "1er trimestre (jan-mars)" },
      { q: 2, dueMonth: 8, label: "2e trimestre (avr-juin)" },
      { q: 3, dueMonth: 11, label: "3e trimestre (juil-sept)" },
      { q: 4, dueMonth: 2, label: "4e trimestre (oct-déc)" },
    ];
    for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
      for (const q of quarters) {
        const trimYear = q.q === 4 ? year - 1 : year;
        const due = utcDate(year, q.dueMonth, 25);
        if (due < from || due > to) continue;
        out.push({
          id: `pt-iva-trim-${trimYear}-T${q.q}`,
          dueDate: ymd(due),
          kind: "tva",
          title: `Déclaration IVA — ${q.label} ${trimYear}`,
          description: description(`le ${q.label} ${trimYear}`),
          officialUrl: "https://www.portaldasfinancas.gov.pt/",
          severity: "important",
        });
      }
    }
  }

  return out;
}

/** IRS (Modelo 3) — déclaration personnelle annuelle entre le
 *  1er avril et le 30 juin N+1. On retient 30 juin comme date butoir. */
function irsPT(_profile: FiscalProfilePT, from: Date, to: Date): FiscalDeadline[] {
  const out: FiscalDeadline[] = [];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    const due = utcDate(year, 6, 30);
    if (due < from || due > to) continue;
    out.push({
      id: `pt-irs-${year - 1}`,
      dueDate: ymd(due),
      kind: "ir_2042",
      title: `Déclaration de revenus IRS (Modelo 3) — ${year - 1}`,
      description: `Dépose ta Modelo 3 sur portaldasfinancas.gov.pt entre le 1er avril et le 30 juin. Concerne les revenus de l'année ${year - 1}, qu'ils proviennent d'une activité indépendante (catégorie B) ou d'autres sources.`,
      officialUrl: "https://www.portaldasfinancas.gov.pt/",
      severity: "important",
    });
  }
  return out;
}

/** IRC (Modelo 22) — déclaration société à l'IRC, due le 31 mai N+1
 *  pour exercice civil. Si exercice décalé : 5e mois après clôture. */
function ircPT(profile: FiscalProfilePT, from: Date, to: Date): FiscalDeadline[] {
  const out: FiscalDeadline[] = [];
  const closeMonth = profile.sasu_fiscal_year_calendar
    ? 12
    : (profile.sasu_fiscal_year_start_month ?? 1) === 1
      ? 12
      : ((profile.sasu_fiscal_year_start_month ?? 1) + 11 - 1) % 12 + 1;
  const dueMonth = ((closeMonth + 5 - 1) % 12) + 1;

  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    const due = utcDate(year, dueMonth, 31);
    if (due < from || due > to) continue;
    out.push({
      id: `pt-irc-${year - 1}`,
      dueDate: ymd(due),
      kind: "is_solde",
      title: `Déclaration IRC (Modelo 22) — exercice ${year - 1}`,
      description: `Dépose ta Modelo 22 sur portaldasfinancas.gov.pt — date butoir le ${frenchMonthName(dueMonth)} ${dueMonth === 5 ? "(31 mai pour exercice civil)" : ""}. Le taux IRC est de 21% (+ derrama municipal selon ta commune).`,
      officialUrl: "https://www.portaldasfinancas.gov.pt/",
      severity: "important",
    });
  }
  return out;
}

/** Acomptes IRC (pagamento por conta) — 3 par an : 31 juillet,
 *  30 septembre, 15 décembre. Calculés sur l'IRC de N-1. */
function ircAcomptesPT(_profile: FiscalProfilePT, from: Date, to: Date): FiscalDeadline[] {
  const out: FiscalDeadline[] = [];
  const dates: Array<{ month: number; day: number; label: string; n: 1 | 2 | 3 }> = [
    { month: 7, day: 31, label: "1er acompte", n: 1 },
    { month: 9, day: 30, label: "2e acompte", n: 2 },
    { month: 12, day: 15, label: "3e acompte", n: 3 },
  ];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    for (const d of dates) {
      const due = utcDate(year, d.month, d.day);
      if (due < from || due > to) continue;
      out.push({
        id: `pt-irc-acompte-${year}-${d.n}`,
        dueDate: ymd(due),
        kind: "is_acompte",
        title: `${d.label} IRC ${year} (pagamento por conta)`,
        description: `Acompte d'impôt sur les sociétés (calculé sur l'IRC de l'année précédente). Téléprocédure obligatoire sur portaldasfinancas.gov.pt.`,
        officialUrl: "https://www.portaldasfinancas.gov.pt/",
        severity: "normal",
      });
    }
  }
  return out;
}

/** Segurança Social — paiement mensuel le 20 du mois suivant pour
 *  les indépendants. Concerne uniquement trabalhador_independente_pt
 *  et eni_pt. */
function segurancaSocialPT(profile: FiscalProfilePT, from: Date, to: Date): FiscalDeadline[] {
  if (
    profile.accounting_status !== "trabalhador_independente_pt" &&
    profile.accounting_status !== "eni_pt"
  ) {
    return [];
  }
  const out: FiscalDeadline[] = [];
  for (const { year, month } of iterateMonths(from, to)) {
    const declMonth = month === 12 ? 1 : month + 1;
    const declYear = month === 12 ? year + 1 : year;
    const due = utcDate(declYear, declMonth, 20);
    if (due < from || due > to) continue;
    out.push({
      id: `pt-seg-soc-${year}-${String(month).padStart(2, "0")}`,
      dueDate: ymd(due),
      kind: "urssaf",
      title: `Cotisations Segurança Social — ${frenchMonthName(month)} ${year}`,
      description: `Paie tes cotisations sociales (21,4% du revenu pertinente) sur seg-social.pt. Le calcul est basé sur ta dernière déclaration trimestrielle de revenus.`,
      officialUrl: "https://www.seg-social.pt/",
      severity: "normal",
    });
  }
  return out;
}

/** E-fatura — communication mensuelle des factures émises à l'AT,
 *  due le jour 5 du mois suivant. Concerne tous les assujettis. */
function efaturaPT(profile: FiscalProfilePT, from: Date, to: Date): FiscalDeadline[] {
  // Les particulers et les régimes "isento" sans factures n'y sont
  // pas soumis — on cible les pros assujettis qui émettent des factures.
  if (profile.accounting_status === "particulier" || profile.accounting_status === null) {
    return [];
  }
  if (profile.pt_iva_isento) {
    // Les indépendants en régime de isenção émettent quand même des
    // factures (sans IVA) qui doivent être communiquées. On garde
    // donc l'échéance.
  }
  const out: FiscalDeadline[] = [];
  for (const { year, month } of iterateMonths(from, to)) {
    const declMonth = month === 12 ? 1 : month + 1;
    const declYear = month === 12 ? year + 1 : year;
    const due = utcDate(declYear, declMonth, 5);
    if (due < from || due > to) continue;
    out.push({
      id: `pt-efatura-${year}-${String(month).padStart(2, "0")}`,
      dueDate: ymd(due),
      kind: "des_intra",
      title: `Communication des factures e-fatura — ${frenchMonthName(month)} ${year}`,
      description: `Communique tes factures émises sur le portail e-fatura (e-fatura.pt) avant le 5 du mois suivant. Obligatoire pour toute activité économique au Portugal, même en régime de isenção.`,
      officialUrl: "https://faturas.portaldasfinancas.gov.pt/",
      severity: "normal",
    });
  }
  return out;
}

// ─── API publique ───────────────────────────────────────────────

export function computeFiscalDeadlinesPT(
  profile: FiscalProfilePT,
  from: Date,
  to: Date,
): FiscalDeadline[] {
  if (!profile.accounting_status) return [];
  const out: FiscalDeadline[] = [];

  const isIndepOrEni =
    profile.accounting_status === "trabalhador_independente_pt" ||
    profile.accounting_status === "eni_pt";
  const isCorporate =
    profile.accounting_status === "lda_unipessoal_pt" ||
    profile.accounting_status === "lda_pt" ||
    profile.accounting_status === "sa_pt";

  if (profile.accounting_status === "particulier") {
    out.push(...irsPT(profile, from, to));
  } else if (isIndepOrEni) {
    out.push(...ivaPT(profile, from, to));
    out.push(...segurancaSocialPT(profile, from, to));
    out.push(...irsPT(profile, from, to));
    out.push(...efaturaPT(profile, from, to));
  } else if (isCorporate) {
    out.push(...ivaPT(profile, from, to));
    out.push(...ircPT(profile, from, to));
    out.push(...ircAcomptesPT(profile, from, to));
    out.push(...efaturaPT(profile, from, to));
  }

  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
