// lib/compta/types.ts
//
// Types partagés entre l'API (zod), le store local de l'onglet
// Compta et le composant ComptaConfigForm. Centraliser ici évite
// les divergences de chaînes magiques entre back et front.

export type AccountingStatus =
  // FR
  | "particulier"
  | "auto_entrepreneur"
  | "sasu"
  | "sas"
  | "sarl"
  | "eurl"
  // CH (phase 1n)
  | "independant_ch"
  | "sarl_ch"
  | "sa_ch"
  // PT (phase 1o)
  | "trabalhador_independente_pt"
  | "eni_pt"
  | "lda_unipessoal_pt"
  | "lda_pt"
  | "sa_pt";

export const ACCOUNTING_STATUSES: ReadonlyArray<AccountingStatus> = [
  "particulier",
  "auto_entrepreneur",
  "sasu",
  "sas",
  "sarl",
  "eurl",
  "independant_ch",
  "sarl_ch",
  "sa_ch",
  "trabalhador_independente_pt",
  "eni_pt",
  "lda_unipessoal_pt",
  "lda_pt",
  "sa_pt",
];

/** Helpers Portugal : 5 statuts. */
export function isPortugueseStatus(status: AccountingStatus | null): boolean {
  return (
    status === "trabalhador_independente_pt" ||
    status === "eni_pt" ||
    status === "lda_unipessoal_pt" ||
    status === "lda_pt" ||
    status === "sa_pt"
  );
}

/** Société portugaise à l'IRC (≈ IS local). LDA, LDA Unipessoal,
 *  SA. L'ENI et le trabalhador independente sont à l'IRS personnel. */
export function isPortugueseCorporate(status: AccountingStatus | null): boolean {
  return (
    status === "lda_unipessoal_pt" ||
    status === "lda_pt" ||
    status === "sa_pt"
  );
}

export type PtRegion = "continente" | "madeira" | "acores";

export const PT_REGIONS: ReadonlyArray<{ code: PtRegion; label: string }> = [
  { code: "continente", label: "Portugal continental" },
  { code: "madeira", label: "Madeira" },
  { code: "acores", label: "Açores" },
];

export type PtIvaPeriodicity = "mensal" | "trimestral";

export type PtTaxRegime = "simplificado" | "organizada";

/** Taux IVA normal selon la région portugaise (continent / Madère
 *  / Açores). Utilisé par le dashboard pour estimer la TVA collectée. */
export function ptVatRateNormal(region: PtRegion | null): number {
  if (region === "madeira") return 22;
  if (region === "acores") return 16;
  return 23; // continente par défaut
}

/** Helpers Suisse : 3 statuts, traités en bloc. */
export function isSwissStatus(status: AccountingStatus | null): boolean {
  return (
    status === "independant_ch" ||
    status === "sarl_ch" ||
    status === "sa_ch"
  );
}

/** Société suisse à l'IBO (= IS local) : Sàrl ou SA. L'indépendant
 *  CH est imposé sur son revenu personnel. */
export function isSwissCorporate(status: AccountingStatus | null): boolean {
  return status === "sarl_ch" || status === "sa_ch";
}

/** Périodicité de décompte TVA suisse. */
export type ChVatPeriodicity =
  | "mensuelle"
  | "trimestrielle"
  | "semestrielle"
  | "annuelle";

export const CH_VAT_PERIODICITIES: ReadonlyArray<ChVatPeriodicity> = [
  "mensuelle",
  "trimestrielle",
  "semestrielle",
  "annuelle",
];

export type ChVatMethod = "effective" | "tdfn";

export const CH_VAT_METHODS: ReadonlyArray<ChVatMethod> = ["effective", "tdfn"];

/** Liste des cantons suisses (codes ISO 3166-2 CH-XX). Utilisée
 *  par le sélecteur dans ComptaConfigForm. */
export const CH_CANTONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "GE", label: "Genève" },
  { code: "VD", label: "Vaud" },
  { code: "VS", label: "Valais" },
  { code: "FR", label: "Fribourg" },
  { code: "NE", label: "Neuchâtel" },
  { code: "JU", label: "Jura" },
  { code: "BE", label: "Berne" },
  { code: "ZH", label: "Zurich" },
  { code: "BS", label: "Bâle-Ville" },
  { code: "BL", label: "Bâle-Campagne" },
  { code: "SO", label: "Soleure" },
  { code: "AG", label: "Argovie" },
  { code: "LU", label: "Lucerne" },
  { code: "ZG", label: "Zoug" },
  { code: "SZ", label: "Schwytz" },
  { code: "UR", label: "Uri" },
  { code: "OW", label: "Obwald" },
  { code: "NW", label: "Nidwald" },
  { code: "GL", label: "Glaris" },
  { code: "SH", label: "Schaffhouse" },
  { code: "AR", label: "Appenzell Rh.-Ext." },
  { code: "AI", label: "Appenzell Rh.-Int." },
  { code: "SG", label: "Saint-Gall" },
  { code: "GR", label: "Grisons" },
  { code: "TG", label: "Thurgovie" },
  { code: "TI", label: "Tessin" },
];

/** Sociétés à l'IS — partagent la même grille fiscale (TVA, IS,
 *  bilan, CFE, DSN si dirigeant assimilé salarié). EURL est dans
 *  cette catégorie UNIQUEMENT si elle a opté pour l'IS (cf.
 *  `eurl_is_election`). Helper utilisé par fiscalCalendar.ts +
 *  FecExportCard pour ne pas répéter la condition. */
export function isCorporateAtIS(
  status: AccountingStatus | null,
  eurlIsElection: boolean,
): boolean {
  if (!status) return false;
  if (status === "sasu" || status === "sas" || status === "sarl") return true;
  if (status === "eurl" && eurlIsElection) return true;
  return false;
}

/** Détermine si un dirigeant doit déclarer en DSN (assimilé salarié).
 *  Cas où il NE faut PAS de DSN :
 *    - SARL avec gérant majoritaire (TNS, URSSAF séparée)
 *    - EURL à l'IR (gérant TNS)
 *    - AE / particulier / dirigeant non rémunéré
 */
export function dirigeantAssimileSalarie(
  status: AccountingStatus | null,
  flags: {
    sasuDirigeantRemunere: boolean;
    sarlGerantMajoritaire: boolean;
    eurlIsElection: boolean;
  },
): boolean {
  if (!status) return false;
  if (!flags.sasuDirigeantRemunere) return false;
  if (status === "sasu" || status === "sas") return true;
  if (status === "sarl") return !flags.sarlGerantMajoritaire;
  if (status === "eurl") return flags.eurlIsElection && !flags.sarlGerantMajoritaire;
  return false;
}

export type ParticulierRevenueType = "bnc_accessoire" | "bic_accessoire" | "autre";

export const PARTICULIER_REVENUE_TYPES: ReadonlyArray<ParticulierRevenueType> = [
  "bnc_accessoire",
  "bic_accessoire",
  "autre",
];

export type AeActivityType = "vente" | "services_bic" | "services_bnc" | "mixte";

export const AE_ACTIVITY_TYPES: ReadonlyArray<AeActivityType> = [
  "vente",
  "services_bic",
  "services_bnc",
  "mixte",
];

export type SasuVatRegime = "reel_mensuel" | "reel_trimestriel" | "simplifie";

export const SASU_VAT_REGIMES: ReadonlyArray<SasuVatRegime> = [
  "reel_mensuel",
  "reel_trimestriel",
  "simplifie",
];

export type AeUrssafPeriodicity = "mensuelle" | "trimestrielle";

export const AE_URSSAF_PERIODICITIES: ReadonlyArray<AeUrssafPeriodicity> = [
  "mensuelle",
  "trimestrielle",
];

/** Catégories de charges (achats/services/etc.) — sert au mapping
 *  vers le bon compte 6XX dans le FEC + à filtrer côté UI. */
export type ExpenseCategory =
  | "achats"
  | "services"
  | "fournitures"
  | "deplacements"
  | "logiciels"
  | "loyer"
  | "communication"
  | "marketing"
  | "formation"
  | "autre";

export const EXPENSE_CATEGORIES: ReadonlyArray<ExpenseCategory> = [
  "achats",
  "services",
  "fournitures",
  "deplacements",
  "logiciels",
  "loyer",
  "communication",
  "marketing",
  "formation",
  "autre",
];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  achats: "Achats / marchandises",
  services: "Sous-traitance / honoraires",
  fournitures: "Fournitures bureau",
  deplacements: "Déplacements / repas pro",
  logiciels: "Logiciels / abonnements SaaS",
  loyer: "Loyer / charges locatives",
  communication: "Internet / téléphone",
  marketing: "Publicité / marketing",
  formation: "Formation pro",
  autre: "Autre",
};

/** Taux de TVA français acceptés pour la saisie d'achat. 0 = exonéré
 *  ou hors champ ; 2.1 = presse / médicaments remboursés ; 5.5 =
 *  produits alimentaires, livres, transport ; 10 = restauration,
 *  travaux ; 20 = taux normal. */
export const VAT_RATES: ReadonlyArray<number> = [0, 2.1, 5.5, 10, 20];

/** SIREN = 9 chiffres. Validation purement format ; le contrôle Luhn
 *  serait plus robuste mais ferait planter une saisie partielle pendant
 *  que l'user tape — on garde simple et on laisse le zod côté API
 *  rejeter à l'enregistrement final si le format est cassé. */
export const SIREN_REGEX = /^\d{9}$/;

/** Slice du business_profiles utilisé par l'onglet Compta. Tout est
 *  optionnel — le profil peut exister sans aucun champ compta tant
 *  que l'user n'a pas configuré son statut. */
export interface ComptaProfileSlice {
  country: string | null;

  accounting_status: AccountingStatus | null;
  accounting_status_configured_at: string | null;

  particulier_revenue_type: ParticulierRevenueType | null;

  ae_activity_type: AeActivityType | null;
  ae_started_at: string | null; // ISO date YYYY-MM-DD
  ae_acre: boolean;
  ae_versement_liberatoire: boolean;
  ae_vat_franchise: boolean;
  ae_urssaf_periodicity: AeUrssafPeriodicity | null;
  /** Régime TVA pour AE qui a dépassé la franchise (sinon NULL). */
  ae_vat_regime: SasuVatRegime | null;

  // Champs sasu_* sont utilisés pour TOUTES les sociétés à l'IS
  // (sasu, sas, sarl, eurl si eurl_is_election=true). Garder les
  // noms historiques pour ne pas casser le schéma.
  sasu_siren: string | null;
  sasu_fiscal_year_calendar: boolean;
  sasu_fiscal_year_start_month: number | null; // 1-12
  sasu_vat_regime: SasuVatRegime | null;
  sasu_vat_intra_enabled: boolean;
  sasu_dirigeant_remunere: boolean;
  // Spécificités EURL et SARL ajoutées en phase 1m
  /** EURL : true si l'EURL a opté pour l'IS (sinon IR par défaut). */
  eurl_is_election: boolean;
  /** SARL : true si gérant majoritaire (TNS) — affecte la DSN. */
  sarl_gerant_majoritaire: boolean;
  // Suisse (phase 1n)
  ch_canton: string | null;
  ch_vat_assujetti: boolean;
  ch_vat_periodicity: ChVatPeriodicity | null;
  ch_vat_method: ChVatMethod | null;
  ch_started_at: string | null; // ISO date YYYY-MM-DD
  // Portugal (phase 1o)
  pt_nif: string | null;
  pt_region: PtRegion | null;
  pt_iva_isento: boolean;
  pt_iva_periodicity: PtIvaPeriodicity | null;
  pt_tax_regime: PtTaxRegime | null;
  pt_started_at: string | null;
}

/** Valeurs par défaut quand on construit une slice à partir d'un row
 *  potentiellement incomplet. */
export function emptyComptaSlice(): ComptaProfileSlice {
  return {
    country: null,
    accounting_status: null,
    accounting_status_configured_at: null,
    particulier_revenue_type: null,
    ae_activity_type: null,
    ae_started_at: null,
    ae_acre: false,
    ae_versement_liberatoire: false,
    ae_vat_franchise: true,
    ae_urssaf_periodicity: null,
    ae_vat_regime: null,
    sasu_siren: null,
    sasu_fiscal_year_calendar: true,
    sasu_fiscal_year_start_month: null,
    sasu_vat_regime: null,
    sasu_vat_intra_enabled: false,
    sasu_dirigeant_remunere: false,
    eurl_is_election: false,
    sarl_gerant_majoritaire: false,
    ch_canton: null,
    ch_vat_assujetti: false,
    ch_vat_periodicity: null,
    ch_vat_method: null,
    ch_started_at: null,
    pt_nif: null,
    pt_region: null,
    pt_iva_isento: false,
    pt_iva_periodicity: null,
    pt_tax_regime: null,
    pt_started_at: null,
  };
}
