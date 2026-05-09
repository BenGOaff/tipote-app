// lib/compta/fiscalCalendar.ts
//
// Calculateur d'échéances fiscales pour les users français.
// Phase 1i du module Compta — répond à la douleur principale du
// PRODUCT_BRIEF : "Je sais pas où j'en suis côté compta : seuils
// TVA, échéances URSSAF, calendrier fiscal".
//
// Approche : on calcule les échéances à la volée depuis le statut
// + le régime fiscal de l'user, pour les 12 mois à venir. Pas de
// table dédiée — les dates butoir françaises sont déterministes
// (15 décembre CFE, 31 juillet T2 URSSAF AE…) donc inutile de
// les stocker.
//
// **Disclaimer** : Tipote n'est PAS un comptable. Les dates ici
// sont indicatives et peuvent varier (jours ouvrés, départements,
// dérogations COVID, etc.). Le bandeau permanent du tab Compta
// le rappelle. On lie systématiquement vers le site officiel pour
// que l'user déclare au bon endroit.

export type DeadlineKind =
  | "urssaf"
  | "tva"
  | "is_acompte"
  | "is_solde"
  | "ir_2042"
  | "cfe"
  | "bilan"
  | "dsn"
  | "des_intra";

export interface FiscalDeadline {
  /** ID stable pour chaque échéance — sert au tracking "fait" côté
   *  client (localStorage) et aux dédup côté reminders email. */
  id: string;
  /** Date butoir (YYYY-MM-DD). */
  dueDate: string;
  kind: DeadlineKind;
  /** Court titre affiché. */
  title: string;
  /** 1-2 phrases de contexte (ce qu'il faut faire). */
  description: string;
  /** Lien vers le site officiel pour déclarer. */
  officialUrl: string;
  /** Important = à mettre en avant (rouge si imminent), normal = standard. */
  severity: "important" | "normal";
}

/** Sous-set du business_profiles pertinent pour le calendrier. On
 *  prend juste ce qu'on lit pour rester découplé de la table. */
export interface FiscalProfile {
  accounting_status: "particulier" | "auto_entrepreneur" | "sasu" | null;
  // AE
  ae_activity_type: string | null;
  ae_started_at: string | null;
  ae_versement_liberatoire: boolean;
  ae_vat_franchise: boolean;
  ae_urssaf_periodicity?: "mensuelle" | "trimestrielle" | null;
  /** Régime TVA pour AE qui a dépassé la franchise. NULL si toujours
   *  en franchise (cas par défaut). */
  ae_vat_regime?: "reel_mensuel" | "reel_trimestriel" | "simplifie" | null;
  // SASU
  sasu_fiscal_year_calendar: boolean;
  sasu_fiscal_year_start_month: number | null;
  sasu_vat_regime: string | null;
  sasu_vat_intra_enabled: boolean;
  sasu_dirigeant_remunere: boolean;
}

// ───────────────────────── Helpers date ─────────────────────────

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Construit une Date UTC à minuit pour comparer proprement. */
function utcDate(year: number, month1to12: number, day: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, day));
}

/** Génère les déclencheurs récurrents (URSSAF / TVA trimestrielle…)
 *  sur la fenêtre [from, to]. */
function* iterateMonths(from: Date, to: Date): Generator<{ year: number; month: number }> {
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cur <= end) {
    yield { year: cur.getUTCFullYear(), month: cur.getUTCMonth() + 1 };
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
}

// ───────────────────────── Builders ─────────────────────────

/** AE — déclaration URSSAF (CA + paiement cotisations).
 *  Trimestrielle : T1 → 30 avril, T2 → 31 juillet, T3 → 31 oct, T4 → 31 janvier (de N+1).
 *  Mensuelle : avant la fin du mois suivant. */
function urssafAE(profile: FiscalProfile, from: Date, to: Date): FiscalDeadline[] {
  const out: FiscalDeadline[] = [];
  const isMonthly = profile.ae_urssaf_periodicity === "mensuelle";
  const ivLabel = profile.ae_versement_liberatoire
    ? " (URSSAF + impôt sur le revenu via versement libératoire)"
    : " (URSSAF — l'impôt sur le revenu se déclare séparément avec la 2042)";

  if (isMonthly) {
    for (const { year, month } of iterateMonths(from, to)) {
      // Déclaration du mois M se fait avant la fin du mois M+1.
      const declMonth = month === 12 ? 1 : month + 1;
      const declYear = month === 12 ? year + 1 : year;
      // Fin de mois calendaire (30/31/28/29) — JS gère ça via day=0 du mois suivant.
      const lastDayOfDeclMonth = new Date(Date.UTC(declYear, declMonth, 0)).getUTCDate();
      const due = utcDate(declYear, declMonth, lastDayOfDeclMonth);
      if (due < from || due > to) continue;
      out.push({
        id: `urssaf-ae-mensuelle-${year}-${String(month).padStart(2, "0")}`,
        dueDate: ymd(due),
        kind: "urssaf",
        title: `Déclaration URSSAF mensuelle — ${frenchMonthName(month)} ${year}`,
        description: `Déclare ton chiffre d'affaires de ${frenchMonthName(month)} ${year} sur autoentrepreneur.urssaf.fr${ivLabel}.`,
        officialUrl: "https://www.autoentrepreneur.urssaf.fr/portail/accueil/sinformer-sur-le-statut/declarer-payer-en-ligne.html",
        severity: "important",
      });
    }
  } else {
    // Trimestrielle (défaut)
    const quarters: Array<{ q: 1 | 2 | 3 | 4; dueMonth: number; dueDay: number }> = [
      { q: 1, dueMonth: 4, dueDay: 30 },
      { q: 2, dueMonth: 7, dueDay: 31 },
      { q: 3, dueMonth: 10, dueDay: 31 },
      { q: 4, dueMonth: 1, dueDay: 31 }, // pour T4 de N, due en janvier N+1
    ];
    for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
      for (const q of quarters) {
        // Pour T4, le "year" du trimestre est year-1 (puisqu'on déclare en janvier de l'année suivante).
        const trimYear = q.q === 4 ? year - 1 : year;
        const due = utcDate(year, q.dueMonth, q.dueDay);
        if (due < from || due > to) continue;
        out.push({
          id: `urssaf-ae-trim-${trimYear}-T${q.q}`,
          dueDate: ymd(due),
          kind: "urssaf",
          title: `Déclaration URSSAF — T${q.q} ${trimYear}`,
          description: `Déclare ton chiffre d'affaires du trimestre T${q.q} ${trimYear} sur autoentrepreneur.urssaf.fr${ivLabel}.`,
          officialUrl: "https://www.autoentrepreneur.urssaf.fr/portail/accueil/sinformer-sur-le-statut/declarer-payer-en-ligne.html",
          severity: "important",
        });
      }
    }
  }
  return out;
}

/** TVA selon régime (réel mensuel / trimestriel / simplifié) — utilisé
 *  par SASU ET par AE qui a dépassé le seuil franchise. Le idPrefix
 *  permet d'avoir des deadline.id stables et distincts entre les
 *  deux statuts. */
function tvaDeclarations(
  regime: "reel_mensuel" | "reel_trimestriel" | "simplifie",
  intraEnabled: boolean,
  from: Date,
  to: Date,
  idPrefix: "sasu" | "ae",
): FiscalDeadline[] {
  const out: FiscalDeadline[] = [];

  if (regime === "reel_mensuel") {
    for (const { year, month } of iterateMonths(from, to)) {
      // La CA3 du mois M est due entre le 15 et le 24 du mois M+1
      // selon le SIRET. On retient le 24 comme date prudente (pire cas).
      const declMonth = month === 12 ? 1 : month + 1;
      const declYear = month === 12 ? year + 1 : year;
      const due = utcDate(declYear, declMonth, 24);
      if (due < from || due > to) continue;
      out.push({
        id: `tva-${idPrefix}-mens-${year}-${String(month).padStart(2, "0")}`,
        dueDate: ymd(due),
        kind: "tva",
        title: `Déclaration TVA (CA3) — ${frenchMonthName(month)} ${year}`,
        description: `Dépose ta CA3 de ${frenchMonthName(month)} ${year} sur impots.gouv.fr (entre le 15 et le 24 selon ton SIRET).`,
        officialUrl: "https://www.impots.gouv.fr/professionnel",
        severity: "important",
      });
    }
  } else if (regime === "reel_trimestriel") {
    const quarters: Array<{ q: 1 | 2 | 3 | 4; dueMonth: number }> = [
      { q: 1, dueMonth: 4 },
      { q: 2, dueMonth: 7 },
      { q: 3, dueMonth: 10 },
      { q: 4, dueMonth: 1 },
    ];
    for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
      for (const q of quarters) {
        const trimYear = q.q === 4 ? year - 1 : year;
        const due = utcDate(year, q.dueMonth, 24);
        if (due < from || due > to) continue;
        out.push({
          id: `tva-${idPrefix}-trim-${trimYear}-T${q.q}`,
          dueDate: ymd(due),
          kind: "tva",
          title: `Déclaration TVA (CA3) — T${q.q} ${trimYear}`,
          description: `Dépose ta CA3 du T${q.q} ${trimYear} sur impots.gouv.fr.`,
          officialUrl: "https://www.impots.gouv.fr/professionnel",
          severity: "important",
        });
      }
    }
  } else if (regime === "simplifie") {
    // CA12 annuelle (mai N+1) + 2 acomptes (juillet, décembre)
    for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
      const ca12 = utcDate(year, 5, 31);
      if (ca12 >= from && ca12 <= to) {
        out.push({
          id: `tva-${idPrefix}-ca12-${year - 1}`,
          dueDate: ymd(ca12),
          kind: "tva",
          title: `Déclaration TVA annuelle (CA12) — exercice ${year - 1}`,
          description: `Dépose ta CA12 récapitulative de l'exercice ${year - 1} sur impots.gouv.fr.`,
          officialUrl: "https://www.impots.gouv.fr/professionnel",
          severity: "important",
        });
      }
      const acompte1 = utcDate(year, 7, 31);
      if (acompte1 >= from && acompte1 <= to) {
        out.push({
          id: `tva-${idPrefix}-acompte1-${year}`,
          dueDate: ymd(acompte1),
          kind: "tva",
          title: `Acompte semestriel TVA — juillet ${year}`,
          description: `Acompte de TVA (régime simplifié) sur impots.gouv.fr.`,
          officialUrl: "https://www.impots.gouv.fr/professionnel",
          severity: "normal",
        });
      }
      const acompte2 = utcDate(year, 12, 31);
      if (acompte2 >= from && acompte2 <= to) {
        out.push({
          id: `tva-${idPrefix}-acompte2-${year}`,
          dueDate: ymd(acompte2),
          kind: "tva",
          title: `Acompte semestriel TVA — décembre ${year}`,
          description: `Acompte de TVA (régime simplifié) sur impots.gouv.fr.`,
          officialUrl: "https://www.impots.gouv.fr/professionnel",
          severity: "normal",
        });
      }
    }
  }

  // DES (Déclaration Européenne de Services) si TVA intra activée —
  // mensuelle, due le 10 du mois suivant pour les services.
  if (intraEnabled) {
    for (const { year, month } of iterateMonths(from, to)) {
      const declMonth = month === 12 ? 1 : month + 1;
      const declYear = month === 12 ? year + 1 : year;
      const due = utcDate(declYear, declMonth, 10);
      if (due < from || due > to) continue;
      out.push({
        id: `des-${idPrefix}-${year}-${String(month).padStart(2, "0")}`,
        dueDate: ymd(due),
        kind: "des_intra",
        title: `Déclaration Européenne de Services (DES) — ${frenchMonthName(month)} ${year}`,
        description: `Déclare tes services facturés à des clients UE sur pro.douane.gouv.fr (obligatoire dès 1 € facturé).`,
        officialUrl: "https://www.douane.gouv.fr/",
        severity: "normal",
      });
    }
  }

  return out;
}

/** SASU — IS (acomptes 15 mars/juin/sept/déc + solde 4 mois après clôture). */
function isSASU(profile: FiscalProfile, from: Date, to: Date): FiscalDeadline[] {
  const out: FiscalDeadline[] = [];
  // Acomptes (basés sur l'IS de N-1 ; on liste les dates butoir, le
  // calcul du montant nécessite les données comptables).
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    for (const m of [3, 6, 9, 12] as const) {
      const due = utcDate(year, m, 15);
      if (due < from || due > to) continue;
      out.push({
        id: `is-acompte-${year}-${m}`,
        dueDate: ymd(due),
        kind: "is_acompte",
        title: `Acompte d'IS — ${frenchMonthName(m)} ${year}`,
        description: `Acompte trimestriel d'impôt sur les sociétés (calculé sur l'IS de l'exercice N-1). Téléprocédure obligatoire sur impots.gouv.fr.`,
        officialUrl: "https://www.impots.gouv.fr/professionnel",
        severity: "normal",
      });
    }
  }

  // Solde IS : 15 mai pour exercice clôturé 31/12 ; sinon 15 du
  // 4ème mois suivant la clôture.
  const closeMonth = profile.sasu_fiscal_year_calendar
    ? 12
    : (profile.sasu_fiscal_year_start_month ?? 1) === 1
      ? 12
      : ((profile.sasu_fiscal_year_start_month ?? 1) + 11 - 1) % 12 + 1;
  const soldeMonth = ((closeMonth + 4 - 1) % 12) + 1;
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    const due = utcDate(year, soldeMonth, 15);
    if (due < from || due > to) continue;
    out.push({
      id: `is-solde-${year}`,
      dueDate: ymd(due),
      kind: "is_solde",
      title: `Solde d'IS — exercice ${year - 1}`,
      description: `Paie le solde d'impôt sur les sociétés via le formulaire 2572 sur impots.gouv.fr (téléprocédure obligatoire).`,
      officialUrl: "https://www.impots.gouv.fr/professionnel",
      severity: "important",
    });
  }
  return out;
}

/** SASU — bilan + liasse fiscale (en pratique 3 mois après l'AG
 *  d'approbation, soit ~7 mois après clôture pour un exercice civil). */
function bilanSASU(profile: FiscalProfile, from: Date, to: Date): FiscalDeadline[] {
  const out: FiscalDeadline[] = [];
  const closeMonth = profile.sasu_fiscal_year_calendar
    ? 12
    : (profile.sasu_fiscal_year_start_month ?? 1) === 1
      ? 12
      : ((profile.sasu_fiscal_year_start_month ?? 1) + 11 - 1) % 12 + 1;
  // Bilan dépôt : ~7 mois après clôture
  const bilanMonth = ((closeMonth + 7 - 1) % 12) + 1;
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    const due = utcDate(year, bilanMonth, 30);
    if (due < from || due > to) continue;
    out.push({
      id: `bilan-${year - 1}`,
      dueDate: ymd(due),
      kind: "bilan",
      title: `Dépôt des comptes annuels — exercice ${year - 1}`,
      description: `Dépôt du bilan + compte de résultat + annexe au greffe du tribunal de commerce (dans les 7 mois suivant la clôture).`,
      officialUrl: "https://www.infogreffe.fr/",
      severity: "normal",
    });
  }
  return out;
}

/** Particulier / AE / SASU avec dirigeant rémunéré — déclaration
 *  des revenus annuelle (2042 ou 2042-C-PRO selon statut). */
function ir2042(profile: FiscalProfile, from: Date, to: Date): FiscalDeadline[] {
  const out: FiscalDeadline[] = [];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    // Date butoir variable selon département (mai-juin), on prend
    // le 8 juin comme date prudente (= dernière vague papier).
    const due = utcDate(year, 6, 8);
    if (due < from || due > to) continue;
    out.push({
      id: `ir-2042-${year}`,
      dueDate: ymd(due),
      kind: "ir_2042",
      title: `Déclaration de revenus ${year - 1}`,
      description:
        profile.accounting_status === "auto_entrepreneur"
          ? `Déclare tes revenus ${year - 1} (formulaire 2042-C-PRO pour ton activité d'auto-entrepreneur). Date butoir variable selon département (mai-début juin).`
          : profile.accounting_status === "sasu"
            ? `Déclare ta rémunération de dirigeant ${year - 1} dans la 2042 (catégorie traitements et salaires).`
            : `Déclare tes revenus ${year - 1} dans la 2042 sur impots.gouv.fr.`,
      officialUrl: "https://www.impots.gouv.fr/particulier/declaration-en-ligne",
      severity: "important",
    });
  }
  return out;
}

/** CFE — décembre, pour AE et SASU (sauf 1ère année d'exonération). */
function cfe(profile: FiscalProfile, from: Date, to: Date): FiscalDeadline[] {
  const out: FiscalDeadline[] = [];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    const due = utcDate(year, 12, 15);
    if (due < from || due > to) continue;
    out.push({
      id: `cfe-${year}`,
      dueDate: ymd(due),
      kind: "cfe",
      title: `CFE ${year} (Cotisation Foncière des Entreprises)`,
      description: `Paie ta CFE ${year} via ton compte fiscal pro sur impots.gouv.fr. Exonération possible la 1ère année d'activité.`,
      officialUrl: "https://www.impots.gouv.fr/professionnel/cfe",
      severity: "normal",
    });
  }
  return out;
}

/** SASU avec dirigeant rémunéré — DSN mensuelle. */
function dsnSASU(profile: FiscalProfile, from: Date, to: Date): FiscalDeadline[] {
  if (!profile.sasu_dirigeant_remunere) return [];
  const out: FiscalDeadline[] = [];
  for (const { year, month } of iterateMonths(from, to)) {
    // DSN du mois M est due le 15 du mois M+1 (effectif < 50).
    const declMonth = month === 12 ? 1 : month + 1;
    const declYear = month === 12 ? year + 1 : year;
    const due = utcDate(declYear, declMonth, 15);
    if (due < from || due > to) continue;
    out.push({
      id: `dsn-${year}-${String(month).padStart(2, "0")}`,
      dueDate: ymd(due),
      kind: "dsn",
      title: `DSN — ${frenchMonthName(month)} ${year}`,
      description: `Déclaration Sociale Nominative pour la rémunération du dirigeant. À déposer sur net-entreprises.fr.`,
      officialUrl: "https://www.net-entreprises.fr/",
      severity: "normal",
    });
  }
  return out;
}

const FRENCH_MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function frenchMonthName(month1to12: number): string {
  return FRENCH_MONTHS[month1to12 - 1] ?? String(month1to12);
}

// ───────────────────────── API publique ─────────────────────────

/** Calcule les échéances fiscales pour un user sur une fenêtre
 *  donnée. `from` et `to` sont des Date. La sortie est triée par
 *  date croissante. */
export function computeFiscalDeadlines(
  profile: FiscalProfile,
  from: Date,
  to: Date,
): FiscalDeadline[] {
  if (!profile.accounting_status) return [];
  const out: FiscalDeadline[] = [];

  if (profile.accounting_status === "auto_entrepreneur") {
    out.push(...urssafAE(profile, from, to));
    // AE qui a dépassé la franchise : il déclare la TVA selon son
    // régime (par défaut simplifié). On réutilise la même logique
    // que pour la SASU via tvaDeclarations — id préfixé "ae" pour
    // ne pas collisionner avec d'éventuelles deadlines SASU.
    if (!profile.ae_vat_franchise && profile.ae_vat_regime) {
      out.push(...tvaDeclarations(profile.ae_vat_regime, false, from, to, "ae"));
    }
    out.push(...ir2042(profile, from, to));
    out.push(...cfe(profile, from, to));
  } else if (profile.accounting_status === "sasu") {
    if (profile.sasu_vat_regime) {
      out.push(
        ...tvaDeclarations(
          profile.sasu_vat_regime as "reel_mensuel" | "reel_trimestriel" | "simplifie",
          profile.sasu_vat_intra_enabled,
          from,
          to,
          "sasu",
        ),
      );
    }
    out.push(...isSASU(profile, from, to));
    out.push(...bilanSASU(profile, from, to));
    out.push(...ir2042(profile, from, to));
    out.push(...cfe(profile, from, to));
    out.push(...dsnSASU(profile, from, to));
  } else if (profile.accounting_status === "particulier") {
    out.push(...ir2042(profile, from, to));
  }

  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Helper : filtre les échéances "urgentes" (≤ N jours) — utilisé
 *  par le cron rappels et l'affichage UI compact. */
export function pickUrgentDeadlines(
  deadlines: FiscalDeadline[],
  daysAhead: number,
  now: Date = new Date(),
): FiscalDeadline[] {
  const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const cutoffYmd = ymd(cutoff);
  const nowYmd = ymd(now);
  return deadlines.filter((d) => d.dueDate >= nowYmd && d.dueDate <= cutoffYmd);
}
