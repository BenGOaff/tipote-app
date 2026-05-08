// lib/compta/clientRevenue.ts
//
// Calcule les stats compta par client à partir des transactions PSP
// (Stripe / PayPal / Mollie). On matche client → transaction via
// `customer_email` (le seul champ stable côté PSP). Si l'user a saisi
// le client sans email dans /clients, on ne peut pas relier — c'est
// documenté dans la UI.
//
// Pour chaque client on remonte :
//   • total_eur_cents : somme nette (amount - refunded)
//   • last_paid_at : date du dernier encaissement (ISO)
//   • is_subscriber : a payé un abonnement dans les 30 derniers jours
//   • is_churned : avait un abonnement avant mais pas dans les 30
//                  derniers jours

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getEurForexRates,
  convertToEurCents,
} from "@/lib/compta/forex";

export interface ClientRevenueStats {
  total_eur_cents: number;
  last_paid_at: string | null;
  is_subscriber: boolean;
  is_churned: boolean;
  /** Nombre total de transactions (sales + refunds compris). */
  transactions_count: number;
}

const INCLUDED_STATUSES = ["paid", "partial_refund", "refunded"];
const SUBSCRIPTION_HEURISTIC = /(subscription|abonnement|récurrent|recurring|\/mois|\/month)/i;

export async function getClientRevenueStatsByEmail(
  admin: SupabaseClient,
  userId: string,
  emails: string[],
  projectId: string | null,
): Promise<Map<string, ClientRevenueStats>> {
  const out = new Map<string, ClientRevenueStats>();
  const normalizedEmails = emails
    .map((e) => (e || "").toLowerCase().trim())
    .filter(Boolean);
  if (normalizedEmails.length === 0) return out;

  // 1. Pull les transactions liées à ces emails — sur 24 mois pour
  // distinguer "abonné actif" de "client one-shot historique"
  const since = new Date();
  since.setMonth(since.getMonth() - 24);

  let txQ = admin
    .from("transactions")
    .select(
      "customer_email, paid_at, amount_cents, refunded_cents, currency, description",
    )
    .eq("user_id", userId)
    .in("status", INCLUDED_STATUSES)
    .in("customer_email", normalizedEmails)
    .gte("paid_at", since.toISOString());
  if (projectId) txQ = txQ.eq("project_id", projectId);
  const { data: rows, error } = await txQ;
  if (error || !rows) return out;

  // 2. Conversion EUR
  const currencies = rows.map((r) => (r.currency || "EUR").toUpperCase());
  const { rates } = await getEurForexRates(currencies);

  // 3. Bucketing par email
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  for (const r of rows) {
    const email = (r.customer_email || "").toLowerCase().trim();
    if (!email) continue;
    const currency = (r.currency || "EUR").toUpperCase();
    const netCents = (r.amount_cents ?? 0) - (r.refunded_cents ?? 0);
    const eurCents = convertToEurCents(netCents, currency, rates);
    const paidAt = new Date(r.paid_at);
    const isSubPayment = SUBSCRIPTION_HEURISTIC.test(r.description ?? "");

    const stats = out.get(email) ?? {
      total_eur_cents: 0,
      last_paid_at: null,
      is_subscriber: false,
      is_churned: false,
      transactions_count: 0,
    };

    stats.total_eur_cents += eurCents;
    stats.transactions_count += 1;
    if (!stats.last_paid_at || new Date(stats.last_paid_at) < paidAt) {
      stats.last_paid_at = r.paid_at;
    }

    // Abonné = paiement récurrent dans les 30 derniers jours
    if (isSubPayment && paidAt >= thirtyDaysAgo) {
      stats.is_subscriber = true;
    }
    // Churned candidate = a fait des paiements récurrents avant 30j
    // mais pas dedans → on flag, on confirmera après en lisant le total
    if (isSubPayment && paidAt < thirtyDaysAgo) {
      // marker qu'on lèvera SI is_subscriber n'est jamais devenu true
      // après avoir parcouru toutes les rows — on stocke dans un champ
      // temporaire qu'on nettoiera ci-dessous.
      (stats as ClientRevenueStats & { _had_old_sub?: boolean })._had_old_sub = true;
    }

    out.set(email, stats);
  }

  // Pass de finalisation : si un client avait un abonnement avant mais
  // plus dans les 30 derniers jours → churned.
  for (const stats of out.values()) {
    const tagged = stats as ClientRevenueStats & { _had_old_sub?: boolean };
    if (tagged._had_old_sub && !tagged.is_subscriber) {
      tagged.is_churned = true;
    }
    delete tagged._had_old_sub;
  }

  return out;
}
