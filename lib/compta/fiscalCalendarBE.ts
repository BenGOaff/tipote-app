// lib/compta/fiscalCalendarBE.ts
//
// Calculateur d'échéances fiscales pour les users BELGES (phase 1p).
// Symétrique aux helpers FR/CH/PT.
//
// **Règle UI** : libellés en français (interface Tipote francophone).
// On garde les noms officiels des déclarations (Tax-on-web, Biztax,
// Intervat, INASTI, RSVZ, BCE, BNB, MyMinfin) qui sont des termes
// belges intraduisibles.
//
// Calendrier couvert :
//
//   • TVA — déclaration via Intervat. Dates butoir = 20 du mois
//     suivant la période.
//     - Trimestrielle (CA < 2,5 M€, défaut) : 20 avril, 20 juillet,
//       20 octobre, 20 janvier.
//     - Mensuelle (CA > 2,5 M€) : 20 du mois suivant chaque mois.
//
//   • Listing client annuel — déclaration des clients assujettis BE
//     auxquels on a facturé > 250 € sur l'année. Date butoir : 31 mars
//     de N+1.
//
//   • Listing intra-UE (état 723) — pour les ventes UE. Trimestriel,
//     dates similaires à la TVA trimestrielle.
//
//   • IPP (Impôt des Personnes Physiques) — déclaration annuelle via
//     Tax-on-web. Date butoir Tax-on-web : 15 juillet (cas général,
//     varie selon convention SPF Finances). Papier : 30 juin.
//
//   • ISoc (Impôt des Sociétés) — déclaration via Biztax. Date butoir
//     ~7 mois après clôture (= ~30 septembre pour exercice civil
//     31/12). Le délai exact varie chaque année selon arrêté royal —
//     on retient 30 septembre comme date prudente.
//
//   • Versements anticipés (VA) — 4 par an pour IPP et ISoc :
//     10 avril, 10 juillet, 10 octobre, 20 décembre. Permettent
//     d'éviter la majoration pour défaut/insuffisance d'anticipation.
//
//   • Cotisations INASTI / RSVZ — caisse d'assurances sociales pour
//     indépendants. Acomptes trimestriels : 20 mars, 20 juin,
//     20 septembre, 20 décembre. Taux 20,5% du revenu net.
//     Réduction pour les indépendants à titre complémentaire.
//
//   • Comptes annuels BNB — dépôt à la Banque Nationale de Belgique
//     dans les 7 mois après l'AG (qui a lieu max 6 mois après
//     clôture). En pratique, ~7 mois après clôture.

import type { FiscalDeadline } from "./fiscalCalendar";

export interface FiscalProfileBE {
  accounting_status:
    | "particulier"
    | "independant_principal_be"
    | "independant_complementaire_be"
    | "srl_be"
    | "sa_be"
    | null;
  be_region: "wallonie" | "flandre" | "bruxelles" | null;
  be_company_number: string | null;
  be_vat_franchise: boolean;
  be_vat_periodicity: "mensuelle" | "trimestrielle" | null;
  be_intra_eu_listing: boolean;
  be_started_at: string | null;
  /** Pour SRL/SA : exercice civil ou décalé. On réutilise les
   *  colonnes sasu_fiscal_year_*. */
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

/** Déclaration TVA — date butoir = 20 du mois suivant la période.
 *  Mensuelle (CA > 2,5 M€) ou trimestrielle (défaut). */
function tvaBE(profile: FiscalProfileBE, from: Date, to: Date): FiscalDeadline[] {
  if (profile.be_vat_franchise) return [];
  const periodicity = profile.be_vat_periodicity ?? "trimestrielle";
  const out: FiscalDeadline[] = [];

  if (periodicity === "mensuelle") {
    for (const { year, month } of iterateMonths(from, to)) {
      const declMonth = month === 12 ? 1 : month + 1;
      const declYear = month === 12 ? year + 1 : year;
      const due = utcDate(declYear, declMonth, 20);
      if (due < from || due > to) continue;
      out.push({
        id: `be-tva-mens-${year}-${String(month).padStart(2, "0")}`,
        dueDate: ymd(due),
        kind: "tva",
        title: `Déclaration TVA mensuelle — ${frenchMonthName(month)} ${year}`,
        description: `Dépose ta déclaration TVA pour ${frenchMonthName(month)} ${year} sur Intervat (intervat.fgov.be) avant le 20 du mois suivant. Le seuil de franchise est 25 000 € — au-dessus, déclaration obligatoire.`,
        officialUrl: "https://finances.belgium.be/fr/E-services/Intervat",
        severity: "important",
      });
    }
  } else {
    // Trimestrielle — 4 déclarations par an : 20 avril (T1),
    // 20 juillet (T2), 20 octobre (T3), 20 janvier (T4 N+1).
    const quarters: Array<{ q: 1 | 2 | 3 | 4; dueMonth: number; label: string }> = [
      { q: 1, dueMonth: 4, label: "1er trimestre (jan-mars)" },
      { q: 2, dueMonth: 7, label: "2e trimestre (avr-juin)" },
      { q: 3, dueMonth: 10, label: "3e trimestre (juil-sept)" },
      { q: 4, dueMonth: 1, label: "4e trimestre (oct-déc)" },
    ];
    for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
      for (const q of quarters) {
        const trimYear = q.q === 4 ? year - 1 : year;
        const due = utcDate(year, q.dueMonth, 20);
        if (due < from || due > to) continue;
        out.push({
          id: `be-tva-trim-${trimYear}-T${q.q}`,
          dueDate: ymd(due),
          kind: "tva",
          title: `Déclaration TVA — ${q.label} ${trimYear}`,
          description: `Dépose ta déclaration TVA du ${q.label} ${trimYear} sur Intervat avant le 20 du mois suivant le trimestre.`,
          officialUrl: "https://finances.belgium.be/fr/E-services/Intervat",
          severity: "important",
        });
      }
    }
  }
  return out;
}

/** Listing client annuel — déclaration des clients assujettis BE
 *  auxquels on a facturé > 250 € sur l'année. Date butoir 31 mars N+1. */
function listingClientBE(profile: FiscalProfileBE, from: Date, to: Date): FiscalDeadline[] {
  if (profile.be_vat_franchise) return [];
  const out: FiscalDeadline[] = [];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    const due = utcDate(year, 3, 31);
    if (due < from || due > to) continue;
    out.push({
      id: `be-listing-client-${year - 1}`,
      dueDate: ymd(due),
      kind: "tva",
      title: `Listing client TVA — exercice ${year - 1}`,
      description: `Déclare la liste de tes clients assujettis BE (auxquels tu as facturé plus de 250 € sur l'année ${year - 1}) sur Intervat avant le 31 mars.`,
      officialUrl: "https://finances.belgium.be/fr/E-services/Intervat",
      severity: "normal",
    });
  }
  return out;
}

/** Listing intra-UE (état 723) — trimestriel, dates similaires à la
 *  TVA trimestrielle (20 avril, 20 juillet, 20 octobre, 20 janvier). */
function listingIntraBE(profile: FiscalProfileBE, from: Date, to: Date): FiscalDeadline[] {
  if (!profile.be_intra_eu_listing) return [];
  const out: FiscalDeadline[] = [];
  const quarters: Array<{ q: 1 | 2 | 3 | 4; dueMonth: number; label: string }> = [
    { q: 1, dueMonth: 4, label: "1er trimestre" },
    { q: 2, dueMonth: 7, label: "2e trimestre" },
    { q: 3, dueMonth: 10, label: "3e trimestre" },
    { q: 4, dueMonth: 1, label: "4e trimestre" },
  ];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    for (const q of quarters) {
      const trimYear = q.q === 4 ? year - 1 : year;
      const due = utcDate(year, q.dueMonth, 20);
      if (due < from || due > to) continue;
      out.push({
        id: `be-listing-intra-${trimYear}-T${q.q}`,
        dueDate: ymd(due),
        kind: "des_intra",
        title: `Listing intra-UE (état 723) — ${q.label} ${trimYear}`,
        description: `Déclare tes ventes de biens et services à des clients assujettis dans l'UE pour le ${q.label} ${trimYear}, sur Intervat. Obligatoire dès 1 € facturé.`,
        officialUrl: "https://finances.belgium.be/fr/E-services/Intervat",
        severity: "normal",
      });
    }
  }
  return out;
}

/** IPP — Impôt des Personnes Physiques, déclaration annuelle via
 *  Tax-on-web (MyMinfin). Date butoir Tax-on-web ~15 juillet
 *  (varie selon SPF Finances chaque année). */
function ippBE(_profile: FiscalProfileBE, from: Date, to: Date): FiscalDeadline[] {
  const out: FiscalDeadline[] = [];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    const due = utcDate(year, 7, 15);
    if (due < from || due > to) continue;
    out.push({
      id: `be-ipp-${year - 1}`,
      dueDate: ymd(due),
      kind: "ir_2042",
      title: `Déclaration IPP — revenus ${year - 1}`,
      description: `Dépose ta déclaration d'impôt des personnes physiques sur Tax-on-web (myminfin.be). La date butoir Tax-on-web est généralement ~15 juillet ; pour la version papier, c'est le 30 juin. Le SPF Finances publie le calendrier précis chaque année.`,
      officialUrl: "https://finances.belgium.be/fr/E-services/Tax-on-web",
      severity: "important",
    });
  }
  return out;
}

/** ISoc — Impôt des Sociétés via Biztax. Date butoir ~7 mois après
 *  clôture (~30 septembre pour exercice civil). */
function isocBE(profile: FiscalProfileBE, from: Date, to: Date): FiscalDeadline[] {
  const out: FiscalDeadline[] = [];
  const closeMonth = profile.sasu_fiscal_year_calendar
    ? 12
    : (profile.sasu_fiscal_year_start_month ?? 1) === 1
      ? 12
      : ((profile.sasu_fiscal_year_start_month ?? 1) + 11 - 1) % 12 + 1;
  // ISoc : ~7 mois après clôture (le SPF Finances arrête la date
  // précise chaque année).
  const dueMonth = ((closeMonth + 7 - 1) % 12) + 1;
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    const due = utcDate(year, dueMonth, 30);
    if (due < from || due > to) continue;
    out.push({
      id: `be-isoc-${year - 1}`,
      dueDate: ymd(due),
      kind: "is_solde",
      title: `Déclaration ISoc (Biztax) — exercice ${year - 1}`,
      description: `Dépose ta déclaration d'impôt des sociétés via Biztax (biztax.fin.belgium.be) avant la date butoir fixée par le SPF Finances. Taux ISoc : 25% (normal) ou 20% pour la 1re tranche jusqu'à 100 000 € (PME).`,
      officialUrl: "https://finances.belgium.be/fr/E-services/Biztax",
      severity: "important",
    });
  }
  return out;
}

/** Versements anticipés (VA) — 4 par an, pour IPP et ISoc. Dates
 *  fixes : 10 avril, 10 juillet, 10 octobre, 20 décembre. */
function versementsAnticipesBE(profile: FiscalProfileBE, from: Date, to: Date): FiscalDeadline[] {
  // Particulier : pas de VA pro (les retenues à la source du salarié
  // suffisent). On les ajoute pour les indépendants et les sociétés.
  if (profile.accounting_status === "particulier" || profile.accounting_status === null) {
    return [];
  }
  const out: FiscalDeadline[] = [];
  const dates: Array<{ month: number; day: number; n: 1 | 2 | 3 | 4 }> = [
    { month: 4, day: 10, n: 1 },
    { month: 7, day: 10, n: 2 },
    { month: 10, day: 10, n: 3 },
    { month: 12, day: 20, n: 4 },
  ];
  const isCorporate = profile.accounting_status === "srl_be" || profile.accounting_status === "sa_be";
  const taxLabel = isCorporate ? "ISoc" : "IPP";
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    for (const d of dates) {
      const due = utcDate(year, d.month, d.day);
      if (due < from || due > to) continue;
      out.push({
        id: `be-va-${taxLabel}-${year}-${d.n}`,
        dueDate: ymd(due),
        kind: "is_acompte",
        title: `Versement anticipé ${taxLabel} ${year} — VA${d.n}`,
        description: `Versement anticipé d'impôt (${taxLabel}). Permet d'éviter la majoration pour défaut ou insuffisance d'anticipation. Plus tu paies tôt dans l'année, meilleur est le bonus de bonification.`,
        officialUrl: "https://finances.belgium.be/fr/entreprises/impot_des_societes/versements_anticipes",
        severity: "normal",
      });
    }
  }
  return out;
}

/** Cotisations INASTI / RSVZ — caisse d'assurances sociales pour
 *  indépendants. Acomptes trimestriels : 20 mars, 20 juin, 20 sept,
 *  20 décembre. Concerne les indépendants en personne physique
 *  (principal ou complémentaire). Pour les sociétés, c'est le
 *  dirigeant rémunéré qui cotise via sa propre caisse. */
function inastiBE(profile: FiscalProfileBE, from: Date, to: Date): FiscalDeadline[] {
  if (
    profile.accounting_status !== "independant_principal_be" &&
    profile.accounting_status !== "independant_complementaire_be"
  ) {
    return [];
  }
  const isComplementary =
    profile.accounting_status === "independant_complementaire_be";
  const out: FiscalDeadline[] = [];
  const dates: Array<{ month: number; n: 1 | 2 | 3 | 4 }> = [
    { month: 3, n: 1 },
    { month: 6, n: 2 },
    { month: 9, n: 3 },
    { month: 12, n: 4 },
  ];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    for (const d of dates) {
      const due = utcDate(year, d.month, 20);
      if (due < from || due > to) continue;
      out.push({
        id: `be-inasti-${year}-T${d.n}`,
        dueDate: ymd(due),
        kind: "urssaf",
        title: `Cotisations INASTI/RSVZ — T${d.n} ${year}`,
        description: isComplementary
          ? `Acompte trimestriel de cotisations sociales (taux réduit pour les indépendants à titre complémentaire). À payer auprès de ta caisse d'assurances sociales (Acerta, Group S, Partena, Liantis, Xerius…).`
          : `Acompte trimestriel de cotisations sociales (20,5% du revenu net, taux principal). À payer auprès de ta caisse d'assurances sociales (Acerta, Group S, Partena, Liantis, Xerius…).`,
        officialUrl: "https://www.inasti.be/fr",
        severity: "normal",
      });
    }
  }
  return out;
}

/** Comptes annuels — dépôt obligatoire à la BNB dans les 7 mois
 *  après clôture pour SRL/SA. */
function comptesAnnuelsBE(profile: FiscalProfileBE, from: Date, to: Date): FiscalDeadline[] {
  if (profile.accounting_status !== "srl_be" && profile.accounting_status !== "sa_be") {
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
      id: `be-comptes-${year - 1}`,
      dueDate: ymd(due),
      kind: "bilan",
      title: `Dépôt des comptes annuels BNB — exercice ${year - 1}`,
      description: `Dépose tes comptes annuels (bilan + compte de résultat + annexe) à la Banque Nationale de Belgique dans les 7 mois suivant l'AG (qui doit avoir lieu dans les 6 mois post-clôture). Plan Comptable Minimum Normalisé (PCMN) obligatoire.`,
      officialUrl: "https://www.nbb.be/fr/centrale-des-bilans",
      severity: "normal",
    });
  }
  return out;
}

// ─── API publique ───────────────────────────────────────────────

export function computeFiscalDeadlinesBE(
  profile: FiscalProfileBE,
  from: Date,
  to: Date,
): FiscalDeadline[] {
  if (!profile.accounting_status) return [];
  const out: FiscalDeadline[] = [];

  const isIndep =
    profile.accounting_status === "independant_principal_be" ||
    profile.accounting_status === "independant_complementaire_be";
  const isCorporate =
    profile.accounting_status === "srl_be" || profile.accounting_status === "sa_be";

  if (profile.accounting_status === "particulier") {
    out.push(...ippBE(profile, from, to));
  } else if (isIndep) {
    out.push(...tvaBE(profile, from, to));
    out.push(...listingClientBE(profile, from, to));
    out.push(...listingIntraBE(profile, from, to));
    out.push(...inastiBE(profile, from, to));
    out.push(...versementsAnticipesBE(profile, from, to));
    out.push(...ippBE(profile, from, to));
  } else if (isCorporate) {
    out.push(...tvaBE(profile, from, to));
    out.push(...listingClientBE(profile, from, to));
    out.push(...listingIntraBE(profile, from, to));
    out.push(...versementsAnticipesBE(profile, from, to));
    out.push(...isocBE(profile, from, to));
    out.push(...comptesAnnuelsBE(profile, from, to));
    // L'IPP du dirigeant rémunéré reste géré via sa déclaration
    // personnelle — on l'ajoute aussi.
    out.push(...ippBE(profile, from, to));
  }

  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
