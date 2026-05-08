// lib/compta/fiscal-config.ts
//
// Seuils fiscaux et taux applicables aux différents statuts compta
// pour les users français. Versionnés par année — hardcodé pour 2026
// au lancement, le cron de la phase 1g (à venir) ira chercher les
// valeurs officielles sur service-public.fr / urssaf.fr et alertera
// l'admin Tipote en cas de changement.
//
// Sources officielles (à vérifier à chaque mise à jour) :
//   • Franchise TVA  : service-public.fr/professionnels-entreprises/vosdroits/F32353
//   • Plafonds micro : service-public.fr/professionnels-entreprises/vosdroits/F23267
//   • Taux IS         : economie.gouv.fr/entreprises/impot-societes-IS
//
// Toutes les valeurs sont en euros (entiers). Pas de cents — les
// seuils sont définis "officiellement" en euros pleins.

export interface VatThreshold {
  /** Seuil de base (franchise applicable l'année N) */
  base: number;
  /** Seuil majoré (tolérance — au-delà, sortie immédiate) */
  major: number;
}

export const VAT_THRESHOLDS_2026 = {
  /** Vente de marchandises, vente à consommer sur place, fourniture
   *  de logement (BIC) — seuils élevés. */
  vente: { base: 85_000, major: 93_500 },
  /** Prestations de services artisanales / commerciales (BIC) */
  services_bic: { base: 37_500, major: 41_250 },
  /** Prestations libérales / intellectuelles (BNC) */
  services_bnc: { base: 37_500, major: 41_250 },
} as const;

/** Renvoie le seuil applicable à un type d'activité auto-entrepreneur,
 *  ou null si pas applicable (statut différent, activité inconnue).
 *  Pour `mixte`, on prend les seuils services (les plus restrictifs
 *  sur la composante prestations) — le détail vente vs prestations
 *  doit être tenu par l'user dans son livre des recettes officiel.
 */
export function getVatThresholdFor(
  activityType: string | null | undefined,
): VatThreshold | null {
  switch (activityType) {
    case "vente":
      return VAT_THRESHOLDS_2026.vente;
    case "services_bic":
      return VAT_THRESHOLDS_2026.services_bic;
    case "services_bnc":
      return VAT_THRESHOLDS_2026.services_bnc;
    case "mixte":
      // Côté prudent : on applique les seuils services (plus bas).
      // L'user pourra dépasser ce chiffre s'il fait majoritairement
      // de la vente, mais on préfère alerter trop tôt que trop tard.
      return VAT_THRESHOLDS_2026.services_bic;
    default:
      return null;
  }
}

/** Pour le label affiché dans l'UI à côté de la jauge — explique
 *  d'où vient le seuil pour que l'user comprenne, au lieu d'un chiffre
 *  magique. */
export function getVatThresholdLabel(
  activityType: string | null | undefined,
): string {
  switch (activityType) {
    case "vente":
      return "Vente de marchandises";
    case "services_bic":
      return "Prestations services (BIC)";
    case "services_bnc":
      return "Prestations libérales (BNC)";
    case "mixte":
      return "Activité mixte (seuil services)";
    default:
      return "";
  }
}

/** Fenêtre glissante de 12 mois — convention LF franchise TVA :
 *  on regarde les 12 mois civils précédents, ou plus précisément
 *  le CA accumulé sur "année N en cours" et "année N-1 totale" pour
 *  comparer aux seuils base et major. Pour le MVP, on simplifie à
 *  12 mois glissants côté Tipote ; l'user vérifie en détail sur
 *  son livre des recettes. */
export const ROLLING_WINDOW_MONTHS = 12;
