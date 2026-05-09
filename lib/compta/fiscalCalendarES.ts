// lib/compta/fiscalCalendarES.ts
//
// Échéances fiscales pour les users espagnols. UI en français,
// noms officiels espagnols conservés (Modelo 303/100/200, IVA, IRPF,
// IS, RETA, Hacienda, AEAT, etc.).
//
// Spécificités modélisées :
//   - País Vasco + Navarra : Régimen Foral, déclarations via Hacienda
//     Foral (pas AEAT). Calendrier identique mais URLs et modelos
//     spécifiques. On adapte le portail.
//   - Canarias : IGIC au lieu d'IVA, périodicité trimestrielle
//     (Modelo 420). Pas d'opérations intracommunautaires UE.
//   - Ceuta + Melilla : IPSI au lieu d'IVA. Hors scope MVP — on
//     affiche un disclaimer dans le profil.

import type { FiscalDeadline } from "./fiscalCalendar";

export interface FiscalProfileES {
  accounting_status:
    | "particulier"
    | "autonomo_es"
    | "slu_es"
    | "sl_es"
    | "sa_es"
    | null;
  es_community:
    | "AN" | "AR" | "AS" | "IB" | "CN" | "CB" | "CL" | "CM" | "CT" | "VC"
    | "EX" | "GA" | "MD" | "MC" | "NC" | "PV" | "RI" | "CE" | "ML"
    | null;
  es_company_number: string | null;
  es_iva_regime: "general" | "simplificado" | "recargo_equivalencia" | "exencion" | null;
  es_iva_periodicity: "mensual" | "trimestral" | null;
  es_redeme: boolean;
  es_irpf_method: "directa" | "objetiva" | null;
  es_started_at: string | null;
  sasu_fiscal_year_calendar: boolean;
  sasu_fiscal_year_start_month: number | null;
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

const isForal = (c: FiscalProfileES["es_community"]) => c === "PV" || c === "NC";
const isCanarias = (c: FiscalProfileES["es_community"]) => c === "CN";
const isIPSI = (c: FiscalProfileES["es_community"]) => c === "CE" || c === "ML";

// Pour Régimen Foral, l'AEAT est remplacée par les Haciendas Forales.
function aeatOrForalUrl(community: FiscalProfileES["es_community"]): string {
  if (community === "PV") return "https://www.euskadi.eus/web01-s2ekono/es/k34tQrntApp/";
  if (community === "NC") return "https://www.navarra.es/home_es/Temas/Hacienda/";
  return "https://sede.agenciatributaria.gob.es/";
}

function ivaES(profile: FiscalProfileES, from: Date, to: Date): FiscalDeadline[] {
  if (profile.es_iva_regime === "exencion") return [];
  if (isIPSI(profile.es_community)) return []; // Ceuta/Melilla : IPSI hors MVP
  const out: FiscalDeadline[] = [];
  const isCanary = isCanarias(profile.es_community);
  const taxName = isCanary ? "IGIC" : "IVA";
  const modelo303 = isCanary ? "Modelo 420" : "Modelo 303";
  const modelo390 = isCanary ? "Modelo 425" : "Modelo 390";
  const portalUrl = isCanary
    ? "https://sede.gobiernodecanarias.org/sede/tributos"
    : aeatOrForalUrl(profile.es_community);

  const periodicity = profile.es_redeme ? "mensual" : profile.es_iva_periodicity ?? "trimestral";

  if (periodicity === "mensual") {
    for (const { year, month } of iterateMonths(from, to)) {
      const declMonth = month === 12 ? 1 : month + 1;
      const declYear = month === 12 ? year + 1 : year;
      // Mensuelle : entre 1er et 30 du mois suivant (20 pour Modelo 303 général).
      const due = utcDate(declYear, declMonth, 30);
      if (due < from || due > to) continue;
      out.push({
        id: `es-${taxName.toLowerCase()}-mens-${year}-${String(month).padStart(2, "0")}`,
        dueDate: ymd(due),
        kind: "tva",
        title: `Déclaration ${taxName} (${modelo303}) — ${fr(month)} ${year}`,
        description: `Dépose ton ${modelo303} pour ${fr(month)} ${year} avant le 30 du mois suivant. ${isCanary ? "L'IGIC remplace l'IVA aux Canaries." : "Inscrit au REDEME ou CA > 6 M€ → mensuel obligatoire."}`,
        officialUrl: portalUrl,
        severity: "important",
      });
    }
  } else {
    // Trimestriel : T1→20/04, T2→20/07, T3→20/10, T4→30/01 N+1
    const quarters: Array<{ q: 1 | 2 | 3 | 4; m: number; d: number; label: string }> = [
      { q: 1, m: 4, d: 20, label: "1er trimestre (jan-mars)" },
      { q: 2, m: 7, d: 20, label: "2e trimestre (avr-juin)" },
      { q: 3, m: 10, d: 20, label: "3e trimestre (juil-sept)" },
      { q: 4, m: 1, d: 30, label: "4e trimestre (oct-déc)" },
    ];
    for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
      for (const q of quarters) {
        const trimYear = q.q === 4 ? year - 1 : year;
        const due = utcDate(year, q.m, q.d);
        if (due < from || due > to) continue;
        out.push({
          id: `es-${taxName.toLowerCase()}-trim-${trimYear}-T${q.q}`,
          dueDate: ymd(due),
          kind: "tva",
          title: `Déclaration ${taxName} (${modelo303}) — ${q.label} ${trimYear}`,
          description: `Dépose ton ${modelo303} du ${q.label} ${trimYear} sur ${isCanary ? "le portail GobCan (IGIC)" : isForal(profile.es_community) ? "le portail de ta Hacienda Foral" : "la sede AEAT"}. ${q.q === 4 ? `Le ${modelo390} (résumé annuel) est dû à la même date.` : ""}`,
          officialUrl: portalUrl,
          severity: "important",
        });
      }
    }
  }

  // Modelo 390 (résumé annuel IVA) : 30 janvier — déjà inclus avec T4 ci-dessus
  // mais on l'affiche en deadline séparée pour clarté UI.
  if (!isCanary && periodicity === "trimestral") {
    for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
      const due = utcDate(year, 1, 30);
      if (due < from || due > to) continue;
      out.push({
        id: `es-iva-390-${year - 1}`,
        dueDate: ymd(due),
        kind: "tva",
        title: `Résumé annuel IVA (Modelo 390) — exercice ${year - 1}`,
        description: `Récapitulatif annuel des opérations IVA. À déposer avec le ${modelo303} du T4 ${year - 1}.`,
        officialUrl: portalUrl,
        severity: "normal",
      });
    }
  }

  return out;
}

// Modelo 349 — déclaration récapitulative intra-UE. Trimestriel par défaut.
// Pas applicable aux Canaries (hors UE pour la TVA), Ceuta, Melilla.
function modelo349ES(profile: FiscalProfileES, from: Date, to: Date): FiscalDeadline[] {
  if (isCanarias(profile.es_community) || isIPSI(profile.es_community)) return [];
  const out: FiscalDeadline[] = [];
  const quarters: Array<{ q: 1 | 2 | 3 | 4; m: number }> = [
    { q: 1, m: 4 },
    { q: 2, m: 7 },
    { q: 3, m: 10 },
    { q: 4, m: 1 },
  ];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    for (const q of quarters) {
      const trimYear = q.q === 4 ? year - 1 : year;
      const due = utcDate(year, q.m, q.q === 4 ? 30 : 20);
      if (due < from || due > to) continue;
      out.push({
        id: `es-349-${trimYear}-T${q.q}`,
        dueDate: ymd(due),
        kind: "des_intra",
        title: `Déclaration intra-UE (Modelo 349) — T${q.q} ${trimYear}`,
        description: `Récapitulatif des opérations intracommunautaires (livraisons et acquisitions de biens/services UE). Obligatoire dès 1 € facturé à un client UE assujetti.`,
        officialUrl: aeatOrForalUrl(profile.es_community),
        severity: "normal",
      });
    }
  }
  return out;
}

// IRPF — Modelo 130 (estimación directa) ou 131 (módulos), trimestriel
// pour les autónomos. Pour persona física standard sans activité pro :
// uniquement Modelo 100 annuel.
function irpfPagosFraccionadosES(profile: FiscalProfileES, from: Date, to: Date): FiscalDeadline[] {
  if (profile.accounting_status !== "autonomo_es") return [];
  const out: FiscalDeadline[] = [];
  const modelo = profile.es_irpf_method === "objetiva" ? "Modelo 131" : "Modelo 130";
  const methodLabel = profile.es_irpf_method === "objetiva" ? "estimación objetiva (módulos)" : "estimación directa";
  const quarters: Array<{ q: 1 | 2 | 3 | 4; m: number; d: number }> = [
    { q: 1, m: 4, d: 20 },
    { q: 2, m: 7, d: 20 },
    { q: 3, m: 10, d: 20 },
    { q: 4, m: 1, d: 30 },
  ];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    for (const q of quarters) {
      const trimYear = q.q === 4 ? year - 1 : year;
      const due = utcDate(year, q.m, q.d);
      if (due < from || due > to) continue;
      out.push({
        id: `es-irpf-pf-${trimYear}-T${q.q}`,
        dueDate: ymd(due),
        kind: "is_acompte",
        title: `Pago fraccionado IRPF (${modelo}) — T${q.q} ${trimYear}`,
        description: `Acompte trimestriel d'IRPF en ${methodLabel}. ${isForal(profile.es_community) ? "À déposer auprès de ta Hacienda Foral." : "À déposer sur la sede AEAT."}`,
        officialUrl: aeatOrForalUrl(profile.es_community),
        severity: "normal",
      });
    }
  }
  return out;
}

// IRPF Modelo 100 — déclaration annuelle. Date butoir 30 juin.
function irpf100ES(profile: FiscalProfileES, from: Date, to: Date): FiscalDeadline[] {
  const out: FiscalDeadline[] = [];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    const due = utcDate(year, 6, 30);
    if (due < from || due > to) continue;
    out.push({
      id: `es-irpf-100-${year - 1}`,
      dueDate: ymd(due),
      kind: "ir_2042",
      title: `Déclaration IRPF (Modelo 100) — ${year - 1}`,
      description: `Déclaration annuelle d'IRPF (revenus ${year - 1}). Campagne ouverte d'avril à juin sur ${isForal(profile.es_community) ? "le portail de ta Hacienda Foral" : "la sede AEAT (Renta Web)"}.`,
      officialUrl: aeatOrForalUrl(profile.es_community),
      severity: "important",
    });
  }
  return out;
}

// IS — Modelo 200, déclaration annuelle. Date butoir : 25 juillet
// pour exercice civil (1-25 juillet, période de declaration). Pour
// exercice décalé : dans les 25 jours après les 6 mois post-clôture.
function isES(profile: FiscalProfileES, from: Date, to: Date): FiscalDeadline[] {
  const out: FiscalDeadline[] = [];
  const closeMonth = profile.sasu_fiscal_year_calendar
    ? 12
    : (profile.sasu_fiscal_year_start_month ?? 1) === 1
      ? 12
      : ((profile.sasu_fiscal_year_start_month ?? 1) + 11 - 1) % 12 + 1;
  const dueMonth = ((closeMonth + 6 - 1) % 12) + 1; // ~6 mois après clôture
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    const due = utcDate(year, dueMonth, 25);
    if (due < from || due > to) continue;
    out.push({
      id: `es-is-200-${year - 1}`,
      dueDate: ymd(due),
      kind: "is_solde",
      title: `Déclaration IS (Modelo 200) — exercice ${year - 1}`,
      description: `Impuesto sobre Sociedades. Taux 25% (général) ou 23% (CA < 1 M€) ou 15% (nouvelle entreprise, 2 premiers exercices avec bénéfices). Pour exercice civil, période de dépôt 1-25 juillet.`,
      officialUrl: aeatOrForalUrl(profile.es_community),
      severity: "important",
    });
  }
  return out;
}

// IS — Modelo 202, acomptes 3x par an : 20 avril, 20 octobre, 20 décembre.
function isAcomptesES(profile: FiscalProfileES, from: Date, to: Date): FiscalDeadline[] {
  const out: FiscalDeadline[] = [];
  const dates: Array<{ m: number; d: number; n: 1 | 2 | 3 }> = [
    { m: 4, d: 20, n: 1 },
    { m: 10, d: 20, n: 2 },
    { m: 12, d: 20, n: 3 },
  ];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    for (const x of dates) {
      const due = utcDate(year, x.m, x.d);
      if (due < from || due > to) continue;
      out.push({
        id: `es-is-202-${year}-${x.n}`,
        dueDate: ymd(due),
        kind: "is_acompte",
        title: `Pago fraccionado IS (Modelo 202) — ${year} (${x.n}/3)`,
        description: `Acompte trimestriel d'IS basé sur la cuenta de pérdidas y ganancias ou la cuota du dernier exercice. Dépôt sur la sede AEAT.`,
        officialUrl: aeatOrForalUrl(profile.es_community),
        severity: "normal",
      });
    }
  }
  return out;
}

// RETA — cotisaciones mensuelles via TGSS, fin de mois.
function retaES(profile: FiscalProfileES, from: Date, to: Date): FiscalDeadline[] {
  if (profile.accounting_status !== "autonomo_es") return [];
  const out: FiscalDeadline[] = [];
  for (const { year, month } of iterateMonths(from, to)) {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const due = utcDate(year, month, lastDay);
    if (due < from || due > to) continue;
    out.push({
      id: `es-reta-${year}-${String(month).padStart(2, "0")}`,
      dueDate: ymd(due),
      kind: "urssaf",
      title: `Cotisation RETA — ${fr(month)} ${year}`,
      description: `Cotisation mensuelle au Régimen Especial de Trabajadores Autónomos (TGSS). Depuis 2023, le montant dépend de tes revenus nets prévisibles (15 tranches). Tarifa plana à 80 €/mois pendant les 12 premiers mois pour les nouveaux autónomos.`,
      officialUrl: "https://sede.seg-social.gob.es/",
      severity: "normal",
    });
  }
  return out;
}

// Comptes annuels au Registro Mercantil — dans les 7 mois après l'AG
// (qui doit avoir lieu max 6 mois après clôture).
function comptesAnnuelsES(profile: FiscalProfileES, from: Date, to: Date): FiscalDeadline[] {
  if (profile.accounting_status !== "slu_es" && profile.accounting_status !== "sl_es" && profile.accounting_status !== "sa_es") {
    return [];
  }
  const out: FiscalDeadline[] = [];
  const closeMonth = profile.sasu_fiscal_year_calendar
    ? 12
    : (profile.sasu_fiscal_year_start_month ?? 1) === 1
      ? 12
      : ((profile.sasu_fiscal_year_start_month ?? 1) + 11 - 1) % 12 + 1;
  const dueMonth = ((closeMonth + 7 - 1) % 12) + 1;
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    const due = utcDate(year, dueMonth, 30);
    if (due < from || due > to) continue;
    out.push({
      id: `es-comptes-${year - 1}`,
      dueDate: ymd(due),
      kind: "bilan",
      title: `Dépôt des comptes annuels — exercice ${year - 1}`,
      description: `Dépôt des cuentas anuales (balance + cuenta de pérdidas y ganancias + memoria) au Registro Mercantil dans le mois suivant l'AG (qui doit avoir lieu dans les 6 mois post-clôture).`,
      officialUrl: "https://www.registradores.org/",
      severity: "normal",
    });
  }
  return out;
}

export function computeFiscalDeadlinesES(
  profile: FiscalProfileES,
  from: Date,
  to: Date,
): FiscalDeadline[] {
  if (!profile.accounting_status) return [];
  const out: FiscalDeadline[] = [];

  if (profile.accounting_status === "particulier") {
    out.push(...irpf100ES(profile, from, to));
  } else if (profile.accounting_status === "autonomo_es") {
    out.push(...ivaES(profile, from, to));
    out.push(...modelo349ES(profile, from, to));
    out.push(...irpfPagosFraccionadosES(profile, from, to));
    out.push(...irpf100ES(profile, from, to));
    out.push(...retaES(profile, from, to));
  } else if (
    profile.accounting_status === "slu_es" ||
    profile.accounting_status === "sl_es" ||
    profile.accounting_status === "sa_es"
  ) {
    out.push(...ivaES(profile, from, to));
    out.push(...modelo349ES(profile, from, to));
    out.push(...isES(profile, from, to));
    out.push(...isAcomptesES(profile, from, to));
    out.push(...comptesAnnuelsES(profile, from, to));
    out.push(...irpf100ES(profile, from, to));
  }

  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
