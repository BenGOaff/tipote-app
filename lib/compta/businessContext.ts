// lib/compta/businessContext.ts
//
// Génère un bloc de texte ("system context") injectable dans les prompts
// IA Tipote — coach, stratégie, encouragement, suggestions automatiques.
//
// Le but : que l'IA voit toujours les CHIFFRES RÉELS de l'user au lieu
// de raisonner dans le vide. Quand le coach donne un conseil, il sait
// que l'user a fait 5 226 € sur les 10 000 € visés ce mois-ci, qu'il
// a perdu 2 abonnés, et que son CA YTD est en baisse vs N-1.
//
// On formate volontairement en TEXTE dense plutôt qu'en JSON — les
// modèles "lisent" mieux un récit naturel pour ce genre de contexte
// business.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMonthlyRevenueSummary } from "@/lib/compta/businessSummary";

const INCLUDED_STATUSES = ["paid", "partial_refund", "refunded"];

export interface BusinessContext {
  /** Bloc de texte prêt à injecter dans un prompt. Vide si pas de
   *  données. */
  text: string;
  /** Données brutes pour décisions programmatiques (filtres,
   *  branchements de prompts conditionnels, etc.). */
  data: {
    has_revenue_data: boolean;
    current_month_eur: number;
    objective_eur: number | null;
    progress_pct: number | null;
    days_remaining_in_month: number;
    delta_month_vs_last_year_pct: number | null;
    is_on_track: boolean;
    is_behind: boolean;
    has_subscriptions: boolean;
    new_customers_count: number;
    churned_customers_count: number;
  };
}

/** Construit le bloc business context complet. Toutes les requêtes
 *  sont parallèles pour minimiser la latence — on fait au plus +200ms
 *  sur un prompt qui en prend déjà plusieurs secondes côté LLM. */
export async function buildBusinessContext(
  userId: string,
  projectId: string | null,
  admin: SupabaseClient = supabaseAdmin,
): Promise<BusinessContext> {
  // 1. Résumé mensuel (CA, objectif, progression, comparaison N-1)
  const summary = await getMonthlyRevenueSummary(userId, projectId, admin);

  // 2. Indicateurs récurrents simples : nb d'abonnés actifs ce mois,
  // remboursements ce mois, nouveaux clients. Calculs rapides en SQL.
  // Pas autant que le dashboard compta complet — on cherche un sous-
  // ensemble pertinent pour un prompt.
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  let txQ = admin
    .from("transactions")
    .select("paid_at, amount_cents, refunded_cents, customer_email, customer_name, description")
    .eq("user_id", userId)
    .gte("paid_at", startOfLastMonth.toISOString())
    .in("status", INCLUDED_STATUSES);
  if (projectId) txQ = txQ.eq("project_id", projectId);
  const { data: txRows } = await txQ;

  const recurringEmailsCurrentMonth = new Set<string>();
  const recurringEmailsLastMonth = new Set<string>();
  const customersCurrentMonth = new Set<string>();
  const allTimeCustomersBeforeMonth = new Set<string>();

  for (const r of txRows ?? []) {
    const desc = (r.description || "").toLowerCase();
    const recurring =
      desc.includes("subscription") ||
      desc.includes("abonnement") ||
      desc.includes("récurrent") ||
      desc.includes("/mois");
    const customer = (r.customer_email || r.customer_name || "").toLowerCase().trim();
    const paid = new Date(r.paid_at);

    if (paid >= startOfMonth) {
      if (customer) customersCurrentMonth.add(customer);
      if (recurring && customer) recurringEmailsCurrentMonth.add(customer);
    } else if (paid >= startOfLastMonth) {
      if (recurring && customer) recurringEmailsLastMonth.add(customer);
      if (customer) allTimeCustomersBeforeMonth.add(customer);
    }
  }

  // Customers présents AVANT ce mois (toutes périodes confondues) —
  // sert à compter les vrais "nouveaux" du mois en cours
  let txAllQ = admin
    .from("transactions")
    .select("customer_email, customer_name")
    .eq("user_id", userId)
    .lt("paid_at", startOfMonth.toISOString())
    .in("status", INCLUDED_STATUSES);
  if (projectId) txAllQ = txAllQ.eq("project_id", projectId);
  const { data: priorRows } = await txAllQ;
  for (const r of priorRows ?? []) {
    const c = (r.customer_email || r.customer_name || "").toLowerCase().trim();
    if (c) allTimeCustomersBeforeMonth.add(c);
  }

  let newCustomersCount = 0;
  for (const c of customersCurrentMonth) {
    if (!allTimeCustomersBeforeMonth.has(c)) newCustomersCount += 1;
  }
  let churnedCustomersCount = 0;
  for (const c of recurringEmailsLastMonth) {
    if (!recurringEmailsCurrentMonth.has(c)) churnedCustomersCount += 1;
  }

  // 3. Calcul des indicateurs déduits (booléens pour le prompt)
  const isOnTrack =
    summary.objective_eur !== null &&
    summary.progress_pct !== null &&
    summary.progress_pct >= 50;
  const isBehind =
    summary.objective_eur !== null &&
    summary.progress_pct !== null &&
    summary.progress_pct < 50 &&
    summary.days_remaining_in_month <= 10;

  // 4. Formatage en texte dense — on évite le markdown lourd, on
  // privilégie un ton "récit" que les LLMs lisent naturellement.
  const lines: string[] = [];
  lines.push("BUSINESS CONTEXT (chiffres réels — utilise-les pour personnaliser tes conseils)");

  if (summary.source === "empty") {
    lines.push(
      "- L'user n'a pas encore d'encaissement enregistré. Pas de données de revenus à analyser.",
    );
    if (summary.objective_eur) {
      lines.push(`- Son objectif mensuel est ${summary.objective_eur} €.`);
    }
  } else {
    const monthLabel = new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(now);
    lines.push(`- CA ${monthLabel} : ${formatEur(summary.current_month_eur)}`);
    lines.push(`- CA depuis le 1er janvier : ${formatEur(summary.ytd_eur)}`);

    if (summary.objective_eur) {
      lines.push(
        `- Objectif mensuel : ${formatEur(summary.objective_eur)} → ${
          summary.progress_pct !== null ? `${Math.round(summary.progress_pct)} %` : "—"
        } atteint, il reste ${formatEur(summary.remaining_eur ?? 0)} en ${summary.days_remaining_in_month} jour${summary.days_remaining_in_month > 1 ? "s" : ""}`,
      );
      if (isBehind) {
        lines.push(
          "  ⚠️ User en retard sur son objectif (<50% à 10 jours de la fin) — privilégie des conseils ACTIONNABLES IMMÉDIATEMENT pour booster les ventes",
        );
      } else if (
        summary.progress_pct !== null &&
        summary.progress_pct >= 100
      ) {
        lines.push("  🎯 Objectif déjà atteint — conseille d'aller plus loin (offre premium, nouveau segment…)");
      }
    } else {
      lines.push(
        "- Pas d'objectif mensuel défini. Si pertinent, suggère d'en fixer un dans ses paramètres.",
      );
    }

    if (
      summary.has_last_year_data &&
      summary.delta_month_vs_last_year_pct !== null
    ) {
      const sign = summary.delta_month_vs_last_year_pct > 0 ? "+" : "";
      lines.push(
        `- Évolution vs même mois ${summary.fiscal_year - 1} : ${sign}${summary.delta_month_vs_last_year_pct.toFixed(1)} %`,
      );
    }

    if (recurringEmailsCurrentMonth.size > 0) {
      lines.push(
        `- Abonnés actifs ce mois : ${recurringEmailsCurrentMonth.size}`,
      );
    }
    if (newCustomersCount > 0) {
      lines.push(`- Nouveaux clients ce mois : ${newCustomersCount}`);
    }
    if (churnedCustomersCount > 0) {
      lines.push(
        `- ⚠️ ${churnedCustomersCount} abonné${churnedCustomersCount > 1 ? "s" : ""} ${churnedCustomersCount > 1 ? "ont" : "a"} arrêté ce mois (par rapport au mois dernier) — invite l'user à comprendre pourquoi (relance, NPS, sondage)`,
      );
    }
  }

  return {
    text: lines.join("\n"),
    data: {
      has_revenue_data: summary.source !== "empty",
      current_month_eur: summary.current_month_eur,
      objective_eur: summary.objective_eur,
      progress_pct: summary.progress_pct,
      days_remaining_in_month: summary.days_remaining_in_month,
      delta_month_vs_last_year_pct: summary.delta_month_vs_last_year_pct,
      is_on_track: isOnTrack,
      is_behind: isBehind,
      has_subscriptions: recurringEmailsCurrentMonth.size > 0,
      new_customers_count: newCustomersCount,
      churned_customers_count: churnedCustomersCount,
    },
  };
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}
