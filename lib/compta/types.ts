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
  | "sa_pt"
  // BE (phase 1p)
  | "independant_principal_be"
  | "independant_complementaire_be"
  | "srl_be"
  | "sa_be"
  // ES (phase 1q)
  | "autonomo_es"
  | "slu_es"
  | "sl_es"
  | "sa_es"
  // CA (phase 1r)
  | "travailleur_autonome_ca"
  | "entreprise_individuelle_ca"
  | "inc_provincial_ca"
  | "inc_federal_ca";

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
  "independant_principal_be",
  "independant_complementaire_be",
  "srl_be",
  "sa_be",
  "autonomo_es",
  "slu_es",
  "sl_es",
  "sa_es",
  "travailleur_autonome_ca",
  "entreprise_individuelle_ca",
  "inc_provincial_ca",
  "inc_federal_ca",
];

export function isSpanishStatus(status: AccountingStatus | null): boolean {
  return (
    status === "autonomo_es" ||
    status === "slu_es" ||
    status === "sl_es" ||
    status === "sa_es"
  );
}

export function isSpanishCorporate(status: AccountingStatus | null): boolean {
  return status === "slu_es" || status === "sl_es" || status === "sa_es";
}

export type EsCommunity =
  | "AN" | "AR" | "AS" | "IB" | "CN" | "CB" | "CL" | "CM" | "CT" | "VC"
  | "EX" | "GA" | "MD" | "MC" | "NC" | "PV" | "RI" | "CE" | "ML";

export const ES_COMMUNITIES: ReadonlyArray<{ code: EsCommunity; label: string }> = [
  { code: "AN", label: "Andalucía" },
  { code: "AR", label: "Aragón" },
  { code: "AS", label: "Asturias" },
  { code: "IB", label: "Illes Balears" },
  { code: "CN", label: "Canarias (IGIC)" },
  { code: "CB", label: "Cantabria" },
  { code: "CL", label: "Castilla y León" },
  { code: "CM", label: "Castilla-La Mancha" },
  { code: "CT", label: "Cataluña" },
  { code: "VC", label: "Comunidad Valenciana" },
  { code: "EX", label: "Extremadura" },
  { code: "GA", label: "Galicia" },
  { code: "MD", label: "Madrid" },
  { code: "MC", label: "Murcia" },
  { code: "NC", label: "Navarra (Régimen Foral)" },
  { code: "PV", label: "País Vasco (Régimen Foral)" },
  { code: "RI", label: "La Rioja" },
  { code: "CE", label: "Ceuta (IPSI)" },
  { code: "ML", label: "Melilla (IPSI)" },
];

export function isForalCommunity(code: EsCommunity | null): boolean {
  return code === "PV" || code === "NC";
}

export function isCanariasCommunity(code: EsCommunity | null): boolean {
  return code === "CN";
}

export function isIPSICommunity(code: EsCommunity | null): boolean {
  return code === "CE" || code === "ML";
}

export type EsIvaRegime = "general" | "simplificado" | "recargo_equivalencia" | "exencion";
export type EsIvaPeriodicity = "mensual" | "trimestral";
export type EsIrpfMethod = "directa" | "objetiva";

/** Helpers Canada : 4 statuts (génériques, la province discrimine via
 *  ca_province). On ne crée pas un statut par province pour rester
 *  alignés sur les autres pays — ce qui change vraiment d'une province
 *  à l'autre c'est le régime de taxes (TVQ/TVH/PST/RST), pas la forme
 *  juridique. */
export function isCanadianStatus(status: AccountingStatus | null): boolean {
  return (
    status === "travailleur_autonome_ca" ||
    status === "entreprise_individuelle_ca" ||
    status === "inc_provincial_ca" ||
    status === "inc_federal_ca"
  );
}

/** Société canadienne (T2 fédéral + déclaration provinciale).
 *  Les travailleurs autonomes et entreprises individuelles déclarent
 *  via le T1 personnel (annexe T2125 pour le revenu d'entreprise). */
export function isCanadianCorporate(status: AccountingStatus | null): boolean {
  return status === "inc_provincial_ca" || status === "inc_federal_ca";
}

/** 13 provinces et territoires canadiens (codes ISO 3166-2 CA-XX). */
export type CaProvince =
  | "QC" | "ON" | "BC" | "AB" | "MB" | "SK"
  | "NS" | "NB" | "NL" | "PE"
  | "YT" | "NT" | "NU";

export const CA_PROVINCES: ReadonlyArray<{ code: CaProvince; label: string }> = [
  { code: "QC", label: "Québec" },
  { code: "ON", label: "Ontario" },
  { code: "BC", label: "Colombie-Britannique" },
  { code: "AB", label: "Alberta" },
  { code: "MB", label: "Manitoba" },
  { code: "SK", label: "Saskatchewan" },
  { code: "NS", label: "Nouvelle-Écosse" },
  { code: "NB", label: "Nouveau-Brunswick" },
  { code: "NL", label: "Terre-Neuve-et-Labrador" },
  { code: "PE", label: "Île-du-Prince-Édouard" },
  { code: "YT", label: "Yukon" },
  { code: "NT", label: "Territoires du Nord-Ouest" },
  { code: "NU", label: "Nunavut" },
];

/** Régime de taxes applicable selon la province :
 *   - tps_tvq : QC (TPS 5% + TVQ 9.975%, gérés ensemble par RQ)
 *   - tvh     : ON (13%), NB+NL+NS+PE (15%) — taxe harmonisée
 *   - tps_pst : BC (PST 7%), SK (PST 6%), MB (RST 7%) — séparées
 *   - tps     : AB, YT, NT, NU — TPS seule, pas de taxe provinciale
 */
export type CaTaxRegime = "tps_tvq" | "tvh" | "tps_pst" | "tps";

export function caTaxRegime(province: CaProvince | null): CaTaxRegime | null {
  if (!province) return null;
  if (province === "QC") return "tps_tvq";
  if (province === "ON" || province === "NB" || province === "NL" ||
      province === "NS" || province === "PE") return "tvh";
  if (province === "BC" || province === "SK" || province === "MB") return "tps_pst";
  return "tps"; // AB, YT, NT, NU
}

/** Taux de la composante provinciale (en %). 0 si pas de taxe
 *  provinciale (AB + territoires) ou si TPS seule. La TPS fédérale
 *  (5%) est constante et ajoutée par-dessus, sauf en TVH où le taux
 *  affiché inclut déjà la part fédérale. */
export function caProvincialTaxRate(province: CaProvince | null): number {
  if (!province) return 0;
  switch (province) {
    case "QC": return 9.975;
    case "ON": return 8;            // 8 % provincial dans la TVH 13 %
    case "NB":
    case "NL":
    case "NS":
    case "PE": return 10;           // 10 % provincial dans la TVH 15 %
    case "BC": return 7;            // PST
    case "SK": return 6;            // PST
    case "MB": return 7;            // RST
    default: return 0;              // AB, YT, NT, NU
  }
}

/** Taux total de taxes à percevoir sur une facture (somme TPS +
 *  composante provinciale). Sert au dashboard pour estimer la taxe
 *  collectée à reverser. TPS fédérale = 5 %. */
export function caTotalTaxRate(province: CaProvince | null): number {
  return 5 + caProvincialTaxRate(province);
}

export type CaGstPeriodicity = "mensuelle" | "trimestrielle" | "annuelle";

export const CA_GST_PERIODICITIES: ReadonlyArray<CaGstPeriodicity> = [
  "mensuelle",
  "trimestrielle",
  "annuelle",
];

/** Helpers Belgique : 4 statuts. */
export function isBelgianStatus(status: AccountingStatus | null): boolean {
  return (
    status === "independant_principal_be" ||
    status === "independant_complementaire_be" ||
    status === "srl_be" ||
    status === "sa_be"
  );
}

/** Société belge à l'ISoc (= IS local). SRL ou SA. Les indépendants
 *  sont à l'IPP (impôt personnel). */
export function isBelgianCorporate(status: AccountingStatus | null): boolean {
  return status === "srl_be" || status === "sa_be";
}

export type BeRegion = "wallonie" | "flandre" | "bruxelles";

export const BE_REGIONS: ReadonlyArray<{ code: BeRegion; label: string }> = [
  { code: "wallonie", label: "Wallonie" },
  { code: "flandre", label: "Flandre" },
  { code: "bruxelles", label: "Bruxelles-Capitale" },
];

export type BeVatPeriodicity = "mensuelle" | "trimestrielle";

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
  // Belgique (phase 1p)
  be_region: BeRegion | null;
  be_company_number: string | null; // BCE 10 chiffres
  be_vat_franchise: boolean;
  be_vat_periodicity: BeVatPeriodicity | null;
  be_intra_eu_listing: boolean;
  be_started_at: string | null;
  // Espagne (phase 1q)
  es_community: EsCommunity | null;
  es_company_number: string | null; // NIF/CIF
  es_iva_regime: EsIvaRegime | null;
  es_iva_periodicity: EsIvaPeriodicity | null;
  es_redeme: boolean;
  es_irpf_method: EsIrpfMethod | null;
  es_started_at: string | null;
  // Canada (phase 1r)
  ca_province: CaProvince | null;
  ca_business_number: string | null; // BN ARC (9 ch.) ou NEQ QC (10 ch.)
  ca_gst_registered: boolean;
  ca_gst_periodicity: CaGstPeriodicity | null;
  ca_petit_fournisseur: boolean;
  ca_fiscal_year_calendar: boolean;
  ca_fiscal_year_start_month: number | null; // 1-12, sociétés
  ca_started_at: string | null;
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
    be_region: null,
    be_company_number: null,
    be_vat_franchise: false,
    be_vat_periodicity: null,
    be_intra_eu_listing: false,
    be_started_at: null,
    es_community: null,
    es_company_number: null,
    es_iva_regime: null,
    es_iva_periodicity: null,
    es_redeme: false,
    es_irpf_method: null,
    es_started_at: null,
    ca_province: null,
    ca_business_number: null,
    ca_gst_registered: false,
    ca_gst_periodicity: null,
    ca_petit_fournisseur: true,
    ca_fiscal_year_calendar: true,
    ca_fiscal_year_start_month: null,
    ca_started_at: null,
  };
}
