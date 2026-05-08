// lib/compta/fiscal-config.ts
//
// Seuils fiscaux et taux applicables aux différents statuts compta
// pour les users français.
//
// Lecture : la table `fiscal_thresholds` (alimentée par Béné via
// l'admin + le seed initial) est la source de vérité. Les constantes
// `FALLBACK_*` ci-dessous sont là au cas où la DB serait vide (cold
// start sur un projet pas encore migré) — elles ne doivent JAMAIS
// servir en prod si la migration 20260508_fiscal_thresholds.sql a
// été appliquée.
//
// Sources officielles (à vérifier à chaque mise à jour) :
//   • Franchise TVA  : service-public.fr/professionnels-entreprises/vosdroits/F32353
//   • Plafonds micro : service-public.fr/professionnels-entreprises/vosdroits/F23267
//   • Taux IS         : economie.gouv.fr/entreprises/impot-societes-IS

import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface VatThreshold {
  /** Seuil de base (franchise applicable l'année N) */
  base: number;
  /** Seuil majoré (tolérance — au-delà, sortie immédiate) */
  major: number;
}

export interface VatThresholdsByActivity {
  vente: VatThreshold;
  services_bic: VatThreshold;
  services_bnc: VatThreshold;
}

const FALLBACK_VAT_THRESHOLDS_FR: VatThresholdsByActivity = {
  vente: { base: 85_000, major: 93_500 },
  services_bic: { base: 37_500, major: 41_250 },
  services_bnc: { base: 37_500, major: 41_250 },
};

const CATEGORY_TO_KEY: Record<string, keyof VatThresholdsByActivity> = {
  vat_franchise_vente: "vente",
  vat_franchise_services_bic: "services_bic",
  vat_franchise_services_bnc: "services_bnc",
};

/** Charge les seuils franchise TVA pour (country, year) depuis la
 *  DB. Fallback aux valeurs hardcodées si la DB ne renvoie rien
 *  pour cette combinaison (migration pas encore appliquée, par
 *  exemple). Retourne aussi un flag `source` pour que la UI sache
 *  d'où vient l'info. */
export async function getVatThresholds(
  country: string = "FR",
  year: number = new Date().getUTCFullYear(),
): Promise<{ thresholds: VatThresholdsByActivity; source: "db" | "fallback" }> {
  try {
    const { data } = await supabaseAdmin
      .from("fiscal_thresholds")
      .select("category, base_value, major_value")
      .eq("country", country)
      .eq("fiscal_year", year);

    if (!data || data.length === 0) {
      return { thresholds: FALLBACK_VAT_THRESHOLDS_FR, source: "fallback" };
    }

    const out: Partial<VatThresholdsByActivity> = {};
    for (const row of data as Array<{ category: string; base_value: number; major_value: number | null }>) {
      const key = CATEGORY_TO_KEY[row.category];
      if (!key) continue;
      out[key] = {
        base: Number(row.base_value),
        major: Number(row.major_value ?? row.base_value),
      };
    }

    // Si certaines catégories manquent dans la DB, on complète avec
    // le fallback pour ne pas laisser un attribut undefined.
    return {
      thresholds: { ...FALLBACK_VAT_THRESHOLDS_FR, ...out },
      source: Object.keys(out).length === 3 ? "db" : "fallback",
    };
  } catch (e) {
    console.warn("[fiscal-config] DB read failed, fallback hardcoded:", e);
    return { thresholds: FALLBACK_VAT_THRESHOLDS_FR, source: "fallback" };
  }
}

/** Renvoie le seuil applicable à un type d'activité auto-entrepreneur,
 *  ou null si pas applicable. Pour `mixte`, on prend les seuils
 *  services (les plus restrictifs sur la composante prestations). */
export function pickThresholdForActivity(
  thresholds: VatThresholdsByActivity,
  activityType: string | null | undefined,
): VatThreshold | null {
  switch (activityType) {
    case "vente":
      return thresholds.vente;
    case "services_bic":
      return thresholds.services_bic;
    case "services_bnc":
      return thresholds.services_bnc;
    case "mixte":
      return thresholds.services_bic;
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
 *  on regarde les 12 mois civils précédents. Pour le MVP, on
 *  simplifie à 12 mois glissants côté Tipote ; l'user vérifie en
 *  détail sur son livre des recettes. */
export const ROLLING_WINDOW_MONTHS = 12;
