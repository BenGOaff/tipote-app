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
    sasu_siren: null,
    sasu_fiscal_year_calendar: true,
    sasu_fiscal_year_start_month: null,
    sasu_vat_regime: null,
    sasu_vat_intra_enabled: false,
    sasu_dirigeant_remunere: false,
  };
}
