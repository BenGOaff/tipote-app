// lib/compta/types.ts
//
// Types partagés entre l'API (zod), le store local de l'onglet
// Compta et le composant ComptaConfigForm. Centraliser ici évite
// les divergences de chaînes magiques entre back et front.

export type AccountingStatus = "particulier" | "auto_entrepreneur" | "sasu";

export const ACCOUNTING_STATUSES: ReadonlyArray<AccountingStatus> = [
  "particulier",
  "auto_entrepreneur",
  "sasu",
];

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

  sasu_siren: string | null;
  sasu_fiscal_year_calendar: boolean;
  sasu_fiscal_year_start_month: number | null; // 1-12
  sasu_vat_regime: SasuVatRegime | null;
  sasu_vat_intra_enabled: boolean;
  sasu_dirigeant_remunere: boolean;
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
  };
}
