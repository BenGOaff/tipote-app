// lib/compta/fiscalCalendarCA.ts
//
// Échéances fiscales pour les users canadiens (toutes provinces et
// territoires). UI en français, noms officiels conservés (TPS, TVQ,
// TVH, T1, T2, CO-17, RRQ, RPC, RQAP, ARC, RQ, etc.).
//
// Spécificités modélisées :
//   - QC : TVQ + TPS gérées ensemble par Revenu Québec via FPZ-500.
//          Impôt particulier TP-1 (RQ) en plus du T1 fédéral (ARC).
//          Impôt société CO-17 (RQ) en plus du T2 fédéral.
//          RRQ + RQAP perçus avec l'impôt.
//   - ON, NB, NL, NS, PE : TVH harmonisée. ARC gère tout.
//          Impôt T1 + T2 fédéral, déclaration provinciale incluse.
//   - BC, SK, MB : TPS fédérale + PST/RST provinciale séparée
//          (ministère des Finances de la province).
//   - AB, YT, NT, NU : TPS seule, pas de taxe provinciale à percevoir.
//   - Petit fournisseur (CA < 30k$ sur 4 trimestres) → pas de TPS.
//
// Périodicité TPS/TVH/TVQ :
//   * mensuelle (CA > 6 M$) : déclaration + paiement à 1 mois fin de période
//   * trimestrielle (CA 1,5–6 M$) : à 1 mois fin de trimestre
//   * annuelle (CA < 1,5 M$) : à 3 mois fin d'exercice + 4 acomptes trimestriels

import type { FiscalDeadline } from "./fiscalCalendar";

export interface FiscalProfileCA {
  accounting_status:
    | "particulier"
    | "travailleur_autonome_ca"
    | "entreprise_individuelle_ca"
    | "inc_provincial_ca"
    | "inc_federal_ca"
    | null;
  ca_province:
    | "QC" | "ON" | "BC" | "AB" | "MB" | "SK"
    | "NS" | "NB" | "NL" | "PE"
    | "YT" | "NT" | "NU"
    | null;
  ca_business_number: string | null;
  ca_gst_registered: boolean;
  ca_gst_periodicity: "mensuelle" | "trimestrielle" | "annuelle" | null;
  ca_petit_fournisseur: boolean;
  ca_fiscal_year_calendar: boolean;
  ca_fiscal_year_start_month: number | null;
  ca_started_at: string | null;
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

type CaProvinceCode = NonNullable<FiscalProfileCA["ca_province"]>;

const isQC = (p: FiscalProfileCA["ca_province"]) => p === "QC";
const isHST = (p: FiscalProfileCA["ca_province"]) =>
  p === "ON" || p === "NB" || p === "NL" || p === "NS" || p === "PE";
const isPST = (p: FiscalProfileCA["ca_province"]) =>
  p === "BC" || p === "SK" || p === "MB";

/** Nom du régime de taxes affiché à l'user (TPS+TVQ, TVH, TPS+PST, TPS). */
function taxLabel(province: FiscalProfileCA["ca_province"]): string {
  if (isQC(province)) return "TPS + TVQ";
  if (isHST(province)) return "TVH";
  if (province === "BC" || province === "SK") return "TPS + PST";
  if (province === "MB") return "TPS + RST";
  return "TPS";
}

/** Portail officiel pour déposer la déclaration de taxes. Au QC c'est
 *  Revenu Québec qui gère TPS+TVQ ensemble ; ailleurs c'est l'ARC qui
 *  gère la TPS et la TVH. La taxe provinciale séparée (BC/SK/MB) a son
 *  propre portail provincial. */
function taxFilingUrl(province: FiscalProfileCA["ca_province"]): string {
  if (isQC(province)) return "https://www.revenuquebec.ca/";
  return "https://www.canada.ca/fr/agence-revenu.html";
}

function provincialTaxFilingUrl(province: CaProvinceCode): string | null {
  switch (province) {
    case "BC": return "https://www.gov.bc.ca/pst";
    case "SK": return "https://www.sets.saskatchewan.ca/";
    case "MB": return "https://www.gov.mb.ca/finance/taxation/";
    default: return null;
  }
}

// ───────────────────────── TPS / TVH / TVQ ─────────────────────────

function gstHstQstCA(profile: FiscalProfileCA, from: Date, to: Date): FiscalDeadline[] {
  if (!profile.ca_gst_registered) return [];
  if (profile.ca_petit_fournisseur && !profile.ca_gst_registered) return [];

  const periodicity = profile.ca_gst_periodicity ?? "annuelle";
  const out: FiscalDeadline[] = [];
  const label = taxLabel(profile.ca_province);
  const url = taxFilingUrl(profile.ca_province);
  const provNote = isQC(profile.ca_province)
    ? "Dépose la déclaration combinée TPS-TVQ (FPZ-500) via Revenu Québec."
    : isHST(profile.ca_province)
      ? `Dépose la déclaration TVH (${label}) via l'ARC.`
      : "Dépose la déclaration TPS via l'ARC.";

  if (periodicity === "mensuelle") {
    for (const { year, month } of iterateMonths(from, to)) {
      // Mensuel : déclaration + paiement dus à 1 mois fin de période.
      const declMonth = month === 12 ? 1 : month + 1;
      const declYear = month === 12 ? year + 1 : year;
      const due = utcDate(declYear, declMonth === 12 ? 1 : declMonth + 1, 0);
      // Dernier jour du mois suivant la période. utcDate(y, m+1, 0) = dernier jour de m.
      const lastDayOfNextMonth = utcDate(declYear, declMonth + 1, 0);
      if (lastDayOfNextMonth < from || lastDayOfNextMonth > to) continue;
      out.push({
        id: `ca-tps-mens-${year}-${String(month).padStart(2, "0")}`,
        dueDate: ymd(lastDayOfNextMonth),
        kind: "tva",
        title: `Déclaration ${label} — ${fr(month)} ${year}`,
        description: `${provNote} Période mensuelle (CA > 6 M$). Dépôt et paiement dus à la fin du mois suivant.`,
        officialUrl: url,
        severity: "important",
      });
    }
  } else if (periodicity === "trimestrielle") {
    // Q1=jan-mars, Q2=avr-juin, Q3=juil-sept, Q4=oct-déc.
    // Déclaration due fin du mois suivant la fin de trimestre.
    const quarters: Array<{ q: 1 | 2 | 3 | 4; endMonth: number; dueMonth: number; label: string }> = [
      { q: 1, endMonth: 3,  dueMonth: 4,  label: "1er trimestre (jan-mars)" },
      { q: 2, endMonth: 6,  dueMonth: 7,  label: "2e trimestre (avr-juin)" },
      { q: 3, endMonth: 9,  dueMonth: 10, label: "3e trimestre (juil-sept)" },
      { q: 4, endMonth: 12, dueMonth: 1,  label: "4e trimestre (oct-déc)" },
    ];
    for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
      for (const q of quarters) {
        const dueYear = q.q === 4 ? year + 1 : year;
        const due = utcDate(dueYear, q.dueMonth, 30);
        if (due < from || due > to) continue;
        const periodYear = q.q === 4 ? year : year;
        out.push({
          id: `ca-tps-trim-${periodYear}-q${q.q}`,
          dueDate: ymd(due),
          kind: "tva",
          title: `Déclaration ${label} — ${q.label} ${periodYear}`,
          description: `${provNote} Période trimestrielle (CA 1,5–6 M$). Échéance fin du mois suivant la fin du trimestre.`,
          officialUrl: url,
          severity: "important",
        });
      }
    }
  } else {
    // Annuel : déclaration due à 3 mois fin d'exercice (= 31 mars pour
    // exercice civil), + 4 acomptes trimestriels (15 avril/juillet/
    // octobre/janvier) si le solde net annuel dépasse 3 000 $.
    for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
      const due = utcDate(year, 3, 31);
      if (due >= from && due <= to) {
        out.push({
          id: `ca-tps-annu-${year - 1}`,
          dueDate: ymd(due),
          kind: "tva",
          title: `Déclaration ${label} annuelle ${year - 1}`,
          description: `${provNote} Période annuelle (CA < 1,5 M$). Dépôt + solde dus à 3 mois fin d'exercice (31 mars pour exercice civil).`,
          officialUrl: url,
          severity: "important",
        });
      }
      // Acomptes trimestriels TPS
      for (const m of [4, 7, 10] as const) {
        const acomp = utcDate(year, m, 30);
        if (acomp >= from && acomp <= to) {
          out.push({
            id: `ca-tps-acompte-${year}-${m}`,
            dueDate: ymd(acomp),
            kind: "tva",
            title: `Acompte ${label} — ${fr(m)} ${year}`,
            description: `Acompte trimestriel ${label} (régime annuel). Obligatoire si la taxe nette annuelle dépasse 3 000 $.`,
            officialUrl: url,
            severity: "normal",
          });
        }
      }
      const acompJan = utcDate(year + 1, 1, 31);
      if (acompJan >= from && acompJan <= to) {
        out.push({
          id: `ca-tps-acompte-${year}-q4`,
          dueDate: ymd(acompJan),
          kind: "tva",
          title: `Acompte ${label} — janvier ${year + 1}`,
          description: `Acompte trimestriel ${label} (régime annuel). Obligatoire si la taxe nette annuelle dépasse 3 000 $.`,
          officialUrl: url,
          severity: "normal",
        });
      }
    }
  }

  // PST/RST séparée (BC/SK/MB) : périodicité indépendante de la TPS,
  // généralement mensuelle pour > 12k$/an de PST collectée, sinon
  // trimestrielle voire semestrielle. On affiche un rappel mensuel
  // par défaut en pointant vers le portail provincial — l'user ajustera
  // selon sa fréquence réelle assignée par le ministère provincial.
  if (isPST(profile.ca_province)) {
    const provUrl = provincialTaxFilingUrl(profile.ca_province as CaProvinceCode);
    const provLabel = profile.ca_province === "MB" ? "RST" : "PST";
    if (provUrl) {
      for (const { year, month } of iterateMonths(from, to)) {
        const dueMonth = month === 12 ? 1 : month + 1;
        const dueYear = month === 12 ? year + 1 : year;
        const due = utcDate(dueYear, dueMonth, 20);
        if (due < from || due > to) continue;
        out.push({
          id: `ca-pst-${profile.ca_province}-${year}-${String(month).padStart(2, "0")}`,
          dueDate: ymd(due),
          kind: "tva",
          title: `Déclaration ${provLabel} — ${fr(month)} ${year}`,
          description: `${provLabel} provincial (${profile.ca_province}) — distinct de la TPS fédérale. La fréquence (mens/trim/sem) est assignée par le ministère provincial selon ton volume.`,
          officialUrl: provUrl,
          severity: "normal",
        });
      }
    }
  }

  return out;
}

// ───────────────────────── Impôt particulier (T1 / TP-1) ─────────────────────────

function impotParticulierCA(profile: FiscalProfileCA, from: Date, to: Date): FiscalDeadline[] {
  // S'applique aux particuliers, travailleurs autonomes et entreprises
  // individuelles (revenu déclaré sur le T1 personnel via T2125).
  if (
    profile.accounting_status !== "particulier" &&
    profile.accounting_status !== "travailleur_autonome_ca" &&
    profile.accounting_status !== "entreprise_individuelle_ca"
  ) return [];

  const out: FiscalDeadline[] = [];
  const isAutonome =
    profile.accounting_status === "travailleur_autonome_ca" ||
    profile.accounting_status === "entreprise_individuelle_ca";

  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
    // Date limite paiement : 30 avril N (toujours).
    const paiementDue = utcDate(year, 4, 30);
    if (paiementDue >= from && paiementDue <= to) {
      out.push({
        id: `ca-t1-paiement-${year - 1}`,
        dueDate: ymd(paiementDue),
        kind: "ir_2042",
        title: `Paiement solde impôt ${year - 1}`,
        description: isQC(profile.ca_province)
          ? `Solde d'impôt fédéral (T1, ARC) et provincial (TP-1, Revenu Québec) dû le 30 avril, peu importe la date de production.`
          : `Solde d'impôt fédéral (T1, ARC) dû le 30 avril, peu importe la date de production.`,
        officialUrl: isQC(profile.ca_province)
          ? "https://www.revenuquebec.ca/fr/citoyens/declaration-de-revenus/"
          : "https://www.canada.ca/fr/agence-revenu/services/impot/particuliers.html",
        severity: "important",
      });
    }
    // Date limite production : 30 avril (général) ou 15 juin (autonomes,
    // mais paiement reste dû au 30 avril).
    const prodMonth = isAutonome ? 6 : 4;
    const prodDay = isAutonome ? 15 : 30;
    const prodDue = utcDate(year, prodMonth, prodDay);
    if (prodDue >= from && prodDue <= to) {
      out.push({
        id: `ca-t1-prod-${year - 1}`,
        dueDate: ymd(prodDue),
        kind: "ir_2042",
        title: `Production déclaration ${year - 1} (T1${isQC(profile.ca_province) ? " + TP-1" : ""})`,
        description: isAutonome
          ? `Travailleur autonome → production jusqu'au 15 juin, mais le paiement du solde reste dû le 30 avril (intérêts au-delà).`
          : `Production de la déclaration de revenus ${year - 1}. Échéance générale 30 avril.`,
        officialUrl: isQC(profile.ca_province)
          ? "https://www.revenuquebec.ca/fr/citoyens/declaration-de-revenus/"
          : "https://www.canada.ca/fr/agence-revenu/services/impot/particuliers.html",
        severity: "important",
      });
    }
    // Acomptes provisionnels trimestriels (15 mars, 15 juin, 15 sept,
    // 15 déc) — obligatoires si l'impôt net dépasse 3 000 $/année
    // (1 800 $ au QC) deux années consécutives.
    if (isAutonome) {
      for (const [monthN, dayN] of [[3, 15], [6, 15], [9, 15], [12, 15]] as const) {
        const due = utcDate(year, monthN, dayN);
        if (due >= from && due <= to) {
          out.push({
            id: `ca-t1-acompte-${year}-${monthN}`,
            dueDate: ymd(due),
            kind: "ir_2042",
            title: `Acompte provisionnel ${fr(monthN)} ${year}`,
            description: isQC(profile.ca_province)
              ? `Acompte trimestriel (ARC + Revenu Québec). Obligatoire si l'impôt net dépasse 3 000 $/an au fédéral ou 1 800 $/an au QC, deux années consécutives.`
              : `Acompte trimestriel (ARC). Obligatoire si l'impôt net dépasse 3 000 $/an deux années consécutives.`,
            officialUrl: "https://www.canada.ca/fr/agence-revenu/services/impot/particuliers/sujets/acomptes-provisionnels.html",
            severity: "normal",
          });
        }
      }
    }
  }
  return out;
}

// ───────────────────────── Impôt société (T2 / CO-17) ─────────────────────────

function fiscalYearEndsCA(profile: FiscalProfileCA, from: Date, to: Date): Array<{ endDate: Date; year: number }> {
  const out: Array<{ endDate: Date; year: number }> = [];
  const startMonth = profile.ca_fiscal_year_calendar
    ? 1
    : profile.ca_fiscal_year_start_month ?? 1;
  for (let year = from.getUTCFullYear() - 1; year <= to.getUTCFullYear() + 1; year++) {
    // Fin d'exercice = dernier jour du mois précédant le mois de début.
    const endMonth = startMonth === 1 ? 12 : startMonth - 1;
    const endYear = startMonth === 1 ? year : year;
    const endDate = utcDate(endYear, endMonth + 1, 0); // dernier jour du mois
    out.push({ endDate, year: endYear });
  }
  return out;
}

function impotSocieteCA(profile: FiscalProfileCA, from: Date, to: Date): FiscalDeadline[] {
  if (
    profile.accounting_status !== "inc_provincial_ca" &&
    profile.accounting_status !== "inc_federal_ca"
  ) return [];

  const out: FiscalDeadline[] = [];
  for (const fy of fiscalYearEndsCA(profile, from, to)) {
    // T2 fédéral : production due 6 mois après fin d'exercice.
    const t2Due = new Date(Date.UTC(fy.endDate.getUTCFullYear(), fy.endDate.getUTCMonth() + 6, fy.endDate.getUTCDate()));
    if (t2Due >= from && t2Due <= to) {
      out.push({
        id: `ca-t2-${fy.endDate.getUTCFullYear()}-${fy.endDate.getUTCMonth() + 1}`,
        dueDate: ymd(t2Due),
        kind: "is_solde",
        title: `Production T2 (impôt société fédéral)`,
        description: `Déclaration T2 due 6 mois après la fin de l'exercice (${ymd(fy.endDate)}). Le paiement du solde est dû à 2 mois (3 mois pour SPCC admissible à la déduction accordée aux petites entreprises).`,
        officialUrl: "https://www.canada.ca/fr/agence-revenu/services/impot/entreprises/sujets/societes.html",
        severity: "important",
      });
    }
    // Paiement du solde : 2 mois (ou 3 pour SPCC < 500k$ revenu actif).
    // On affiche 2 mois par défaut, le commentaire mentionne le 3 mois.
    const soldeDue = new Date(Date.UTC(fy.endDate.getUTCFullYear(), fy.endDate.getUTCMonth() + 2, fy.endDate.getUTCDate()));
    if (soldeDue >= from && soldeDue <= to) {
      out.push({
        id: `ca-t2-solde-${fy.endDate.getUTCFullYear()}-${fy.endDate.getUTCMonth() + 1}`,
        dueDate: ymd(soldeDue),
        kind: "is_solde",
        title: `Paiement solde impôt société`,
        description: `Solde T2 (et CO-17 au QC) dû 2 mois après la fin de l'exercice (3 mois pour SPCC admissible DPE). Les intérêts courent au-delà.`,
        officialUrl: "https://www.canada.ca/fr/agence-revenu/services/impot/entreprises/sujets/societes/payer-impot-societes.html",
        severity: "important",
      });
    }
    // CO-17 au QC : production due aussi 6 mois après fin d'exercice.
    if (isQC(profile.ca_province)) {
      const co17Due = new Date(Date.UTC(fy.endDate.getUTCFullYear(), fy.endDate.getUTCMonth() + 6, fy.endDate.getUTCDate()));
      if (co17Due >= from && co17Due <= to) {
        out.push({
          id: `ca-co17-${fy.endDate.getUTCFullYear()}-${fy.endDate.getUTCMonth() + 1}`,
          dueDate: ymd(co17Due),
          kind: "is_solde",
          title: `Production CO-17 (impôt société Québec)`,
          description: `Déclaration CO-17 due 6 mois après la fin de l'exercice (${ymd(fy.endDate)}). Solde dû à 2 mois (3 mois pour SPCC admissible).`,
          officialUrl: "https://www.revenuquebec.ca/fr/entreprises/impots/impot-des-societes/",
          severity: "important",
        });
      }
    }
  }

  // Acomptes mensuels T2 (le 15 de chaque mois) — par défaut, mensuel
  // dès que l'impôt fédéral net dépasse 3 000 $/an. SPCC admissible
  // peut payer trimestriellement. On affiche les acomptes mensuels.
  for (const { year, month } of iterateMonths(from, to)) {
    const due = utcDate(year, month, 15);
    if (due < from || due > to) continue;
    out.push({
      id: `ca-t2-acompte-${year}-${String(month).padStart(2, "0")}`,
      dueDate: ymd(due),
      kind: "is_acompte",
      title: `Acompte impôt société — ${fr(month)} ${year}`,
      description: `Acompte mensuel T2 (le 15). SPCC admissible peut opter pour le trimestriel. Au QC, acompte CO-17 au même rythme via Revenu Québec.`,
      officialUrl: "https://www.canada.ca/fr/agence-revenu/services/impot/entreprises/sujets/societes/acomptes-provisionnels-societes.html",
      severity: "normal",
    });
  }

  return out;
}

// ───────────────────────── RRQ / RPC + RQAP ─────────────────────────

function cotisationsSocialesCA(profile: FiscalProfileCA, from: Date, to: Date): FiscalDeadline[] {
  // Les cotisations RRQ/RPC + RQAP des travailleurs autonomes sont
  // payées via la déclaration T1 (et TP-1 au QC) annuellement, donc
  // pas d'échéance distincte à déclarer ici en MVP. On affiche juste
  // un rappel annuel pour les sociétés avec employés (DAS = retenues
  // à la source).
  if (
    profile.accounting_status !== "inc_provincial_ca" &&
    profile.accounting_status !== "inc_federal_ca"
  ) return [];

  const out: FiscalDeadline[] = [];
  // DAS mensuelles : le 15 du mois suivant la paie (régime régulier
  // pour < 25k$/mois de retenues moyennes). Affichage mensuel.
  for (const { year, month } of iterateMonths(from, to)) {
    const dueMonth = month === 12 ? 1 : month + 1;
    const dueYear = month === 12 ? year + 1 : year;
    const due = utcDate(dueYear, dueMonth, 15);
    if (due < from || due > to) continue;
    out.push({
      id: `ca-das-${year}-${String(month).padStart(2, "0")}`,
      dueDate: ymd(due),
      kind: "dsn",
      title: `Retenues à la source (DAS) — ${fr(month)} ${year}`,
      description: isQC(profile.ca_province)
        ? `DAS fédérales (RPC/AE/impôt) à l'ARC + DAS provinciales (RRQ/RQAP/FSS/impôt) à Revenu Québec. Dues le 15 du mois suivant pour les remettants réguliers.`
        : `DAS fédérales (RPC/AE/impôt) à verser à l'ARC le 15 du mois suivant la paie pour les remettants réguliers.`,
      officialUrl: isQC(profile.ca_province)
        ? "https://www.revenuquebec.ca/fr/entreprises/retenues-et-cotisations/"
        : "https://www.canada.ca/fr/agence-revenu/services/impot/entreprises/sujets/retenues-paie.html",
      severity: "normal",
    });
  }
  return out;
}

// ───────────────────────── Comptes annuels (sociétés QC : REQ) ─────────────────────────

function declarationREQ(profile: FiscalProfileCA, from: Date, to: Date): FiscalDeadline[] {
  // QC seulement : déclaration de mise à jour annuelle au Registraire
  // des entreprises (REQ), produite avec la déclaration de revenus
  // (CO-17) via Revenu Québec. Les sociétés fédérales avec siège au
  // QC doivent aussi être inscrites au REQ.
  if (!isQC(profile.ca_province)) return [];
  if (
    profile.accounting_status !== "inc_provincial_ca" &&
    profile.accounting_status !== "inc_federal_ca" &&
    profile.accounting_status !== "entreprise_individuelle_ca"
  ) return [];

  const out: FiscalDeadline[] = [];
  // Pour les sociétés : rattachée au CO-17 (6 mois après fin exercice).
  // Pour les entreprises individuelles immatriculées : annuelle, à la
  // date anniversaire d'immatriculation. On approxime au 1er juin
  // (période courante de production des déclarations annuelles REQ).
  if (
    profile.accounting_status === "entreprise_individuelle_ca"
  ) {
    for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear() + 1; year++) {
      const due = utcDate(year, 6, 1);
      if (due < from || due > to) continue;
      out.push({
        id: `ca-req-${year}`,
        dueDate: ymd(due),
        kind: "bilan",
        title: `Déclaration de mise à jour annuelle REQ ${year}`,
        description: `Mise à jour annuelle au Registraire des entreprises du Québec. Pour les entreprises individuelles immatriculées : à la date anniversaire d'immatriculation (rappel approximatif au 1er juin).`,
        officialUrl: "https://www.registreentreprises.gouv.qc.ca/",
        severity: "normal",
      });
    }
  }
  // Pour les sociétés : la mise à jour REQ est produite avec le CO-17,
  // donc déjà couverte par l'échéance CO-17. Pas de doublon ici.
  return out;
}

// ───────────────────────── Entrée principale ─────────────────────────

export function computeFiscalDeadlinesCA(
  profile: FiscalProfileCA,
  from: Date,
  to: Date,
): FiscalDeadline[] {
  if (!profile.accounting_status) return [];
  const out: FiscalDeadline[] = [];

  if (
    profile.accounting_status === "particulier" ||
    profile.accounting_status === "travailleur_autonome_ca" ||
    profile.accounting_status === "entreprise_individuelle_ca"
  ) {
    out.push(...gstHstQstCA(profile, from, to));
    out.push(...impotParticulierCA(profile, from, to));
    out.push(...declarationREQ(profile, from, to));
  } else if (
    profile.accounting_status === "inc_provincial_ca" ||
    profile.accounting_status === "inc_federal_ca"
  ) {
    out.push(...gstHstQstCA(profile, from, to));
    out.push(...impotSocieteCA(profile, from, to));
    out.push(...cotisationsSocialesCA(profile, from, to));
    out.push(...declarationREQ(profile, from, to));
  }

  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
