// lib/compta/businessSummary.ts
//
// Source de vérité unifiée pour "où en est l'user en ce moment, côté
// business / compta". Utilisé partout où on veut connecter le CA réel :
//   • Page Aujourd'hui — jauge progression vers l'objectif mensuel
//   • Page Stratégie — currentMonthRevenue (remplace la lecture
//     offer_metrics historique)
//   • Onglet Compta — jauge objectif en complément des indicateurs
//   • Coach IA — contexte injecté dans les prompts pour des conseils
//     basés sur les vrais chiffres
//
// Stratégie de calcul :
//   Source primaire = `transactions` (PSP : Stripe / PayPal / Mollie)
//                   + `manual_transactions` (saisies hors PSP)
//   Source de fallback = `offer_metrics` (alimenté par le sync SIO)
//                        si l'user n'a aucune connexion PSP.
//
// Pour les users qui ont SIO ET un PSP direct connecté en parallèle,
// on accepte un risque de double-comptage marginal — c'est une
// configuration rare et on documentera comment dédoubler quand le
// besoin remontera.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getEurForexRates,
  convertToEurCents,
} from "@/lib/compta/forex";

const INCLUDED_STATUSES = ["paid", "partial_refund", "refunded"];

export interface MonthlyRevenueSummary {
  /** Année fiscale en cours. */
  fiscal_year: number;
  /** CA du mois calendaire en cours, en euros (déjà converti). */
  current_month_eur: number;
  /** CA depuis le 1er janvier de l'année en cours, en euros. */
  ytd_eur: number;
  /** CA du même mois N-1, pour comparer. */
  last_year_same_month_eur: number;
  /** Évolution du mois en cours vs N-1, en %. null si pas de référence. */
  delta_month_vs_last_year_pct: number | null;
  /** Nombre de jours qu'il reste dans le mois (jour J inclus). */
  days_remaining_in_month: number;
  /** Objectif mensuel en euros, lu depuis business_profiles.revenue_goal_monthly.
   *  null si pas saisi (l'onboarding stocke parfois une plage texte
   *  type "5k-10k" — on tente de parser, sinon null). */
  objective_eur: number | null;
  /** Pourcentage de progression vers l'objectif (0-100+, null si pas
   *  d'objectif fixé). */
  progress_pct: number | null;
  /** Combien il manque pour atteindre l'objectif (null si pas d'obj). */
  remaining_eur: number | null;
  /** Source des chiffres pour transparence côté UI. */
  source: "transactions" | "offer_metrics" | "empty";
  /** Si l'user a coché "j'utilise Tipote depuis moins d'un an" implicitement
   *  (= pas de données N-1), pour adapter les messages de l'UI. */
  has_last_year_data: boolean;
}

/** Parse un revenue_goal_monthly stocké en texte vers un montant en euros.
 *  L'onboarding Tipote stocke parfois des formats variés (texte libre,
 *  plages, clés i18n). On tente plusieurs patterns courants. */
function parseRevenueGoal(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (!s) return null;

  // Cas direct : "5000", "10000", "12 500"
  const cleaned = s.replace(/[^\d.,k]/gi, "");
  if (/^\d[\d ]*$/.test(s)) {
    const n = parseInt(s.replace(/\s/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // Cas "5k", "10k"
  const kMatch = cleaned.match(/^(\d+(?:[.,]\d+)?)k$/i);
  if (kMatch) {
    const n = parseFloat(kMatch[1]!.replace(",", ".")) * 1000;
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  // Cas plage "5k-10k" ou "5000-10000" → on prend la borne supérieure
  // (= ambition réaliste de l'user, pas son minimum)
  const rangeMatch = cleaned.match(/^(\d+(?:[.,]\d+)?k?)-(\d+(?:[.,]\d+)?k?)$/i);
  if (rangeMatch) {
    const upper = rangeMatch[2]!;
    return parseRevenueGoal(upper);
  }

  // Cas "gt10k" / "lt5k" (clés i18n historiques) — on extrait le nombre
  const gtMatch = cleaned.match(/^(?:gt|lt|gte|lte)?(\d+(?:[.,]\d+)?k?)$/i);
  if (gtMatch) {
    return parseRevenueGoal(gtMatch[1]!);
  }

  return null;
}

/** Renvoie le nombre de jours restants dans le mois courant (jour J
 *  inclus = "il te reste 5 jours pour boucler ton objectif"). */
function daysRemainingInMonth(now: Date): number {
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const diffMs = last.getTime() - now.getTime();
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/** Helper principal : charge tout ce qu'il faut en 1 query par source
 *  et renvoie le résumé prêt à afficher. Throw jamais — fail-open
 *  vers un summary "vide" si quelque chose plante. */
export async function getMonthlyRevenueSummary(
  userId: string,
  projectId: string | null,
  admin: SupabaseClient = supabaseAdmin,
): Promise<MonthlyRevenueSummary> {
  const now = new Date();
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfLastYearSameMonth = new Date(
    Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1),
  );
  const endOfLastYearSameMonth = new Date(
    Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() + 1, 0, 23, 59, 59),
  );

  // 1. Lecture du profil pour récupérer l'objectif
  let bpQ = admin
    .from("business_profiles")
    .select("revenue_goal_monthly")
    .eq("user_id", userId);
  if (projectId) bpQ = bpQ.eq("project_id", projectId);
  const { data: bp } = await bpQ.maybeSingle();
  const objectiveEur = parseRevenueGoal(
    (bp as { revenue_goal_monthly?: unknown } | null)?.revenue_goal_monthly,
  );

  // 2. Tente de calculer depuis les transactions (PSP + saisies manuelles)
  const sinceISO = startOfLastYearSameMonth.toISOString();

  let txQ = admin
    .from("transactions")
    .select("paid_at, amount_cents, refunded_cents, currency")
    .eq("user_id", userId)
    .gte("paid_at", sinceISO)
    .in("status", INCLUDED_STATUSES);
  if (projectId) txQ = txQ.eq("project_id", projectId);
  const { data: txRows } = await txQ;

  let manQ = admin
    .from("manual_transactions")
    .select("paid_at, amount_cents, currency")
    .eq("user_id", userId)
    .gte("paid_at", sinceISO.slice(0, 10));
  if (projectId) manQ = manQ.eq("project_id", projectId);
  const { data: manRows } = await manQ;

  const hasTransactions = (txRows?.length ?? 0) + (manRows?.length ?? 0) > 0;

  let monthEurCents = 0;
  let ytdEurCents = 0;
  let lastYearSameMonthEurCents = 0;
  let source: MonthlyRevenueSummary["source"] = "empty";
  let hasLastYearData = false;

  if (hasTransactions) {
    source = "transactions";

    const allCurrencies = [
      ...(txRows ?? []).map((r) => (r.currency || "EUR").toUpperCase()),
      ...(manRows ?? []).map((r) => (r.currency || "EUR").toUpperCase()),
    ];
    const { rates } = await getEurForexRates(allCurrencies);

    for (const r of txRows ?? []) {
      const currency = (r.currency || "EUR").toUpperCase();
      const netCents = (r.amount_cents ?? 0) - (r.refunded_cents ?? 0);
      const eurCents = convertToEurCents(netCents, currency, rates);
      const paid = new Date(r.paid_at);
      if (paid >= startOfMonth) monthEurCents += eurCents;
      if (paid >= startOfYear) ytdEurCents += eurCents;
      if (paid >= startOfLastYearSameMonth && paid <= endOfLastYearSameMonth) {
        lastYearSameMonthEurCents += eurCents;
        hasLastYearData = true;
      }
    }
    for (const r of manRows ?? []) {
      const currency = (r.currency || "EUR").toUpperCase();
      const eurCents = convertToEurCents(r.amount_cents ?? 0, currency, rates);
      const paid = new Date(`${r.paid_at}T12:00:00Z`);
      if (paid >= startOfMonth) monthEurCents += eurCents;
      if (paid >= startOfYear) ytdEurCents += eurCents;
      if (paid >= startOfLastYearSameMonth && paid <= endOfLastYearSameMonth) {
        lastYearSameMonthEurCents += eurCents;
        hasLastYearData = true;
      }
    }
  } else {
    // 3. Fallback : offer_metrics (alimenté par sio-sync)
    let omQ = admin
      .from("offer_metrics")
      .select("month, revenue")
      .eq("user_id", userId)
      .eq("is_paid", true)
      .gte("month", startOfLastYearSameMonth.toISOString().slice(0, 10))
      .neq("offer_name", "__email_stats__");
    if (projectId) omQ = omQ.eq("project_id", projectId);
    const { data: omRows } = await omQ;

    if ((omRows?.length ?? 0) > 0) {
      source = "offer_metrics";
      for (const r of omRows ?? []) {
        const eurCents = Math.round((Number(r.revenue) || 0) * 100);
        const monthDate = new Date(`${r.month}T12:00:00Z`);
        if (monthDate >= startOfMonth) monthEurCents += eurCents;
        if (monthDate >= startOfYear) ytdEurCents += eurCents;
        if (
          monthDate >= startOfLastYearSameMonth &&
          monthDate <= endOfLastYearSameMonth
        ) {
          lastYearSameMonthEurCents += eurCents;
          hasLastYearData = true;
        }
      }
    }
  }

  const currentMonthEur = monthEurCents / 100;
  const ytdEur = ytdEurCents / 100;
  const lastYearSameMonthEur = lastYearSameMonthEurCents / 100;

  // Delta mois vs N-1
  let deltaPct: number | null = null;
  if (lastYearSameMonthEur > 0) {
    deltaPct = Math.round(
      ((currentMonthEur - lastYearSameMonthEur) / lastYearSameMonthEur) * 1000,
    ) / 10;
  }

  // Progression vers l'objectif
  let progressPct: number | null = null;
  let remainingEur: number | null = null;
  if (objectiveEur && objectiveEur > 0) {
    progressPct = Math.round((currentMonthEur / objectiveEur) * 1000) / 10;
    remainingEur = Math.max(0, objectiveEur - currentMonthEur);
  }

  return {
    fiscal_year: now.getUTCFullYear(),
    current_month_eur: Math.round(currentMonthEur * 100) / 100,
    ytd_eur: Math.round(ytdEur * 100) / 100,
    last_year_same_month_eur: Math.round(lastYearSameMonthEur * 100) / 100,
    delta_month_vs_last_year_pct: deltaPct,
    days_remaining_in_month: daysRemainingInMonth(now),
    objective_eur: objectiveEur,
    progress_pct: progressPct,
    remaining_eur: remainingEur,
    source,
    has_last_year_data: hasLastYearData,
  };
}
