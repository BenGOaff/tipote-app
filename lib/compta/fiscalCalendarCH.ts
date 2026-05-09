// lib/compta/fiscalCalendarCH.ts
//
// Calculateur d'échéances fiscales pour les users SUISSES (phase 1n).
// Symétrique à fiscalCalendar.ts (FR), avec sa propre grille car les
// dates et concepts sont différents :
//
//   • TVA suisse : décompte trimestriel (T1→31 mai, T2→31 août,
//     T3→30 nov, T4→28 fév N+1) ou mensuel/semestriel/annuel selon
//     l'option de l'user. Seuil d'assujettissement = CHF 100'000/an.
//   • AVS/AI/APG : acomptes trimestriels (mars/juin/sept/déc) pour
//     les indépendants. Décompte annuel envoyé par la caisse AVS.
//   • Impôt cantonal + fédéral : 1 SEULE déclaration personnelle
//     ou société par an. Date de dépôt : variable selon canton
//     (mars-juin pour la majorité). On affiche 31 mars comme date
//     "prudente" et on précise dans la description que le canton
//     peut accorder une prolongation.
//   • Comptes annuels (Sàrl/SA) : à approuver par l'AG dans les
//     6 mois suivant la clôture, dépôt au registre du commerce
//     pour les sociétés cotées (Tipote target des PME, donc on
//     mentionne juste l'AG).
//
// Disclaimer : les particularités cantonales (taux IBO exact,
// caisse AVS, allocations familiales) ne sont PAS modélisées —
// le bandeau du tab Compta le rappelle aux users CH.

import type { FiscalDeadline } from "./fiscalCalendar";
import { getCantonConfig } from "./ch_cantons";

export interface FiscalProfileCH {
  accounting_status:
    | "particulier"
    | "independant_ch"
    | "sarl_ch"
    | "sa_ch"
    | null;
  ch_canton: string | null;
  ch_vat_assujetti: boolean;
  ch_vat_periodicity: "mensuelle" | "trimestrielle" | "semestrielle" | "annuelle" | null;
  /** Méthode TVA — pas d'impact sur les dates butoir, juste sur le
   *  calcul du montant à payer. Présent ici pour compléter le profil. */
  ch_vat_method: "effective" | "tdfn" | null;
  ch_started_at: string | null;
  /** Pour Sàrl/SA : exercice civil ou décalé. On réutilise
   *  sasu_fiscal_year_calendar/start_month si l'user a déjà rempli
   *  ces champs (la majorité des Sàrl CH clôturent au 31/12). */
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

/** TVA suisse — décompte selon la périodicité.
 *  Trimestriel (défaut) : T1→31 mai, T2→31 août, T3→30 nov, T4→28 fév N+1.
 *  Mensuel : 60 jours après la fin du mois.
 *  Semestriel : S1 (jan-juin)→31 août, S2 (juil-déc)→28 fév.
 *  Annuel : 28 février N+1. */
function tvaCH(profile: FiscalProfileCH, from: Date, to: Date): FiscalDeadline[] {
  if (!profile.ch_vat_assujetti) return [];
  const periodicity = profile.ch_vat_periodicity ?? "trimestrielle";
  const out: FiscalDeadline[] = [];

  const description = (period: string) =>
    `Dépose ton décompte TVA pour ${period} sur le portail AFC (estv.admin.ch). Seuil d'assujettissement : CHF 100'000/an de chiffre d'affaires mondial.`;

  if (periodicity === "trimestrielle") {
    // Quatre trimestres, dates butoir fixes :
    const quarters: Array<{
      q: 1 | 2 | 3 | 4;
      dueMonth: number;
      dueDay: number;
      label: string;
    }> = [
      { q: 1, dueMonth: 5, dueDay: 31, label: "1er trimestre (jan-mar)" },
      { q: 2, dueMonth: 8, dueDay: 31, label: "2e trimestre (avr-juin)" },
      { q: 3, dueMonth: 11, dueDay: 30, label: "3e trimestre (juil-sep)" },
      { q: 4, dueMonth: 2, dueDay: 28, label: "4e trimestre (oct-déc)" },
    ];
    for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
      for (const q of quarters) {
        const trimYear = q.q === 4 ? year - 1 : year;
        const due = utcDate(year, q.dueMonth, q.dueDay);
        if (due < from || due > to) continue;
        out.push({
          id: `ch-tva-trim-${trimYear}-T${q.q}`,
          dueDate: ymd(due),
          kind: "tva",
          title: `Décompte TVA — ${q.label} ${trimYear}`,
          description: description(`le ${q.label} ${trimYear}`),
          officialUrl: "https://www.estv.admin.ch/estv/fr/accueil/tva.html",
          severity: "important",
        });
      }
    }
  } else if (periodicity === "mensuelle") {
    // Décompte du mois M dû 60 jours après la fin du mois → ~ le 30
    // du M+2. On retient cette date de prudence.
    for (const { year, month } of iterateMonths(from, to)) {
      const declMonth = ((month - 1 + 2) % 12) + 1;
      const declYear = year + Math.floor((month - 1 + 2) / 12);
      const lastDay = new Date(Date.UTC(declYear, declMonth, 0)).getUTCDate();
      const due = utcDate(declYear, declMonth, Math.min(30, lastDay));
      if (due < from || due > to) continue;
      out.push({
        id: `ch-tva-mens-${year}-${String(month).padStart(2, "0")}`,
        dueDate: ymd(due),
        kind: "tva",
        title: `Décompte TVA mensuel — ${frenchMonthName(month)} ${year}`,
        description: description(`${frenchMonthName(month)} ${year}`),
        officialUrl: "https://www.estv.admin.ch/estv/fr/accueil/tva.html",
        severity: "important",
      });
    }
  } else if (periodicity === "semestrielle") {
    // S1 (jan-juin) → 31 août, S2 (juil-déc) → 28 fév N+1.
    for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
      const s1 = utcDate(year, 8, 31);
      if (s1 >= from && s1 <= to) {
        out.push({
          id: `ch-tva-sem-${year}-S1`,
          dueDate: ymd(s1),
          kind: "tva",
          title: `Décompte TVA — 1er semestre ${year}`,
          description: description(`le 1er semestre ${year}`),
          officialUrl: "https://www.estv.admin.ch/estv/fr/accueil/tva.html",
          severity: "important",
        });
      }
      const s2 = utcDate(year + 1, 2, 28);
      if (s2 >= from && s2 <= to) {
        out.push({
          id: `ch-tva-sem-${year}-S2`,
          dueDate: ymd(s2),
          kind: "tva",
          title: `Décompte TVA — 2e semestre ${year}`,
          description: description(`le 2e semestre ${year}`),
          officialUrl: "https://www.estv.admin.ch/estv/fr/accueil/tva.html",
          severity: "important",
        });
      }
    }
  } else if (periodicity === "annuelle") {
    for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
      const due = utcDate(year + 1, 2, 28);
      if (due >= from && due <= to) {
        out.push({
          id: `ch-tva-ann-${year}`,
          dueDate: ymd(due),
          kind: "tva",
          title: `Décompte TVA annuel — exercice ${year}`,
          description: description(`l'exercice ${year}`),
          officialUrl: "https://www.estv.admin.ch/estv/fr/accueil/tva.html",
          severity: "important",
        });
      }
    }
  }

  return out;
}

/** AVS/AI/APG — acomptes trimestriels pour les indépendants
 *  (mars 10 / juin 10 / sept 10 / déc 10 selon la majorité des
 *  caisses cantonales). Décompte annuel envoyé par la caisse en
 *  début d'année N+1, à régulariser. */
function avsIndependant(_profile: FiscalProfileCH, from: Date, to: Date): FiscalDeadline[] {
  const out: FiscalDeadline[] = [];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    for (const m of [3, 6, 9, 12] as const) {
      const due = utcDate(year, m, 10);
      if (due < from || due > to) continue;
      out.push({
        id: `ch-avs-acompte-${year}-${m}`,
        dueDate: ymd(due),
        kind: "urssaf",
        title: `Acompte AVS/AI/APG — ${frenchMonthName(m)} ${year}`,
        description:
          `Acompte trimestriel de cotisations sociales (AVS/AI/APG, ~10,6% du revenu d'activité indépendante) auprès de ta caisse de compensation cantonale. Le montant exact est fixé par ta caisse selon ton revenu présumé.`,
        officialUrl: "https://www.ahv-iv.ch/fr/Cotisations/Travailleurs-indépendants",
        severity: "normal",
      });
    }
  }
  return out;
}

/** Déclaration d'impôt annuelle (cantonale + fédérale).
 *
 *  Chaque canton a sa propre date butoir (souvent 15 mars / 31 mars
 *  / 30 avril pour les personnes physiques, 30 juin / 30 sept pour
 *  les personnes morales). On lit ces dates depuis ch_cantons.ts qui
 *  contient les 26 cantons avec leur config officielle. Si l'user
 *  n'a pas précisé son canton, on retombe sur 31 mars (PP) /
 *  30 juin (PM) qui sont les dates les plus courantes.
 *
 *  Une prolongation gratuite jusqu'à fin août/septembre est
 *  généralement accordée sur demande dans tous les cantons —
 *  c'est rappelé dans la description.
 */
function impotAnnuelCH(profile: FiscalProfileCH, from: Date, to: Date): FiscalDeadline[] {
  const out: FiscalDeadline[] = [];
  const canton = getCantonConfig(profile.ch_canton);
  const isCorporate =
    profile.accounting_status === "sarl_ch" || profile.accounting_status === "sa_ch";
  const dueSpec = isCorporate ? canton.declarationDuePM : canton.declarationDuePP;

  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    const due = utcDate(year, dueSpec.month, dueSpec.day);
    if (due < from || due > to) continue;
    const cantonSuffix =
      profile.ch_canton ? ` — canton de ${canton.label}` : "";
    out.push({
      id: `ch-impot-${profile.ch_canton ?? "fed"}-${year}`,
      dueDate: ymd(due),
      kind: isCorporate ? "is_solde" : "ir_2042",
      title: isCorporate
        ? `Déclaration d'impôt société — exercice ${year - 1}${cantonSuffix}`
        : `Déclaration d'impôt personnelle ${year - 1}${cantonSuffix}`,
      description: profile.ch_canton
        ? `Date butoir cantonale ${canton.label} : ${dueSpec.day} ${frenchMonthName(dueSpec.month)}. Tu peux demander une prolongation gratuite (souvent jusqu'à fin août/septembre) auprès du service cantonal des contributions. Inclut l'impôt fédéral direct (IFD).`
        : `Précise ton canton dans ta config compta pour avoir la date butoir exacte. Référence par défaut : 31 mars (PP) / 30 juin (PM). Une prolongation est en général accordée sur demande.`,
      officialUrl: canton.portalUrl,
      severity: "important",
    });
  }
  return out;
}

/** Comptes annuels Sàrl/SA — Code des Obligations art. 957a. AG
 *  d'approbation dans les 6 mois suivant la clôture. */
function comptesAnnuelsCH(profile: FiscalProfileCH, from: Date, to: Date): FiscalDeadline[] {
  if (profile.accounting_status !== "sarl_ch" && profile.accounting_status !== "sa_ch") {
    return [];
  }
  const out: FiscalDeadline[] = [];
  const closeMonth = profile.sasu_fiscal_year_calendar
    ? 12
    : (profile.sasu_fiscal_year_start_month ?? 1) === 1
      ? 12
      : ((profile.sasu_fiscal_year_start_month ?? 1) + 11 - 1) % 12 + 1;
  // AG d'approbation : 6 mois après clôture. Pour exercice civil =
  // ~30 juin.
  const agMonth = ((closeMonth + 6 - 1) % 12) + 1;
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    const due = utcDate(year, agMonth, 30);
    if (due < from || due > to) continue;
    out.push({
      id: `ch-comptes-${year - 1}`,
      dueDate: ymd(due),
      kind: "bilan",
      title: `Comptes annuels — exercice ${year - 1}`,
      description:
        `Approbation des comptes annuels (bilan + compte de résultat + annexe) en assemblée générale, dans les 6 mois suivant la clôture (Code des Obligations art. 957a). Pas de dépôt obligatoire au registre du commerce pour les Sàrl/SA non cotées.`,
      officialUrl: "https://www.fedlex.admin.ch/eli/cc/27/317_321_377/fr",
      severity: "normal",
    });
  }
  return out;
}

// ─── API publique ───────────────────────────────────────────────

export function computeFiscalDeadlinesCH(
  profile: FiscalProfileCH,
  from: Date,
  to: Date,
): FiscalDeadline[] {
  if (!profile.accounting_status) return [];
  const out: FiscalDeadline[] = [];

  if (profile.accounting_status === "particulier") {
    // Particulier suisse : juste la déclaration d'impôt annuelle.
    out.push(...impotAnnuelCH(profile, from, to));
  } else if (profile.accounting_status === "independant_ch") {
    out.push(...tvaCH(profile, from, to));
    out.push(...avsIndependant(profile, from, to));
    out.push(...impotAnnuelCH(profile, from, to));
  } else if (
    profile.accounting_status === "sarl_ch" ||
    profile.accounting_status === "sa_ch"
  ) {
    out.push(...tvaCH(profile, from, to));
    // Pas d'AVS auto pour les sociétés — c'est sur la rémunération
    // du dirigeant via la caisse AVS d'employeur (hors scope MVP).
    out.push(...comptesAnnuelsCH(profile, from, to));
    out.push(...impotAnnuelCH(profile, from, to));
  }

  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
