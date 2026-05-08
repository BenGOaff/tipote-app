// GET /api/analytics/compta-totals
//
// Renvoie le nombre de ventes + CA agrégés depuis `transactions` (PSP)
// + `manual_transactions`. Endpoint léger utilisé par useOfferMetrics
// pour enrichir les "Résultats totaux" de la page Analytics avec les
// vrais chiffres synchronisés (au lieu de reposer uniquement sur
// offer_metrics qui ne couvre que les données saisies manuellement
// ou syncées via SIO).
//
// Stratégie de comptage :
//   • sales_count = nombre de transactions PSP avec status valide
//                   + nombre de saisies manuelles (catégorie 'sale'
//                   uniquement — les commissions affilié comptent
//                   dans revenue mais pas comme "ventes")
//   • revenue_eur = somme nette (amount - refunded), conversion EUR
//   • month_count = nombre de mois distincts contenant au moins
//                   une transaction (utile pour le titre "Résultats
//                   totaux (X mois de données)")

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import {
  getEurForexRates,
  convertToEurCents,
} from "@/lib/compta/forex";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INCLUDED_STATUSES = ["paid", "partial_refund", "refunded"];

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  // Fenêtre 24 mois pour aligner avec la fenêtre de sync initial des
  // PSPs — au-delà, on aurait des trous.
  const since = new Date();
  since.setMonth(since.getMonth() - 24);
  const sinceISO = since.toISOString();

  // 1. Transactions PSP
  let txQ = supabaseAdmin
    .from("transactions")
    .select("paid_at, amount_cents, refunded_cents, currency, category")
    .eq("user_id", user.id)
    .gte("paid_at", sinceISO)
    .in("status", INCLUDED_STATUSES);
  if (projectId) txQ = txQ.eq("project_id", projectId);
  const { data: txRows } = await txQ;

  // 2. Saisies manuelles
  let manQ = supabaseAdmin
    .from("manual_transactions")
    .select("paid_at, amount_cents, currency, category")
    .eq("user_id", user.id)
    .gte("paid_at", sinceISO.slice(0, 10));
  if (projectId) manQ = manQ.eq("project_id", projectId);
  const { data: manRows } = await manQ;

  if ((txRows?.length ?? 0) + (manRows?.length ?? 0) === 0) {
    return NextResponse.json({
      ok: true,
      has_data: false,
      sales_count: 0,
      revenue_eur: 0,
      affiliate_revenue_eur: 0,
      month_count: 0,
    });
  }

  // 3. Conversion EUR
  const currencies = [
    ...(txRows ?? []).map((r) => (r.currency || "EUR").toUpperCase()),
    ...(manRows ?? []).map((r) => (r.currency || "EUR").toUpperCase()),
  ];
  const { rates } = await getEurForexRates(currencies);

  // 4. Agrégations
  let salesCount = 0;
  let revenueEurCents = 0;
  let affiliateRevenueEurCents = 0;
  const monthsSet = new Set<string>();

  for (const r of txRows ?? []) {
    const currency = (r.currency || "EUR").toUpperCase();
    const netCents = (r.amount_cents ?? 0) - (r.refunded_cents ?? 0);
    const eurCents = convertToEurCents(netCents, currency, rates);
    const category = (r as { category?: string }).category || "sale";
    if (category === "affiliate") {
      affiliateRevenueEurCents += eurCents;
    } else {
      salesCount += 1; // commissions ne comptent pas comme "ventes"
    }
    revenueEurCents += eurCents;
    const monthKey = String(r.paid_at).slice(0, 7); // YYYY-MM
    monthsSet.add(monthKey);
  }

  for (const r of manRows ?? []) {
    const currency = (r.currency || "EUR").toUpperCase();
    const eurCents = convertToEurCents(r.amount_cents ?? 0, currency, rates);
    const category = (r as { category?: string }).category || "sale";
    if (category === "affiliate") {
      affiliateRevenueEurCents += eurCents;
    } else {
      salesCount += 1;
    }
    revenueEurCents += eurCents;
    monthsSet.add(String(r.paid_at).slice(0, 7));
  }

  return NextResponse.json({
    ok: true,
    has_data: true,
    sales_count: salesCount,
    revenue_eur: Math.round(revenueEurCents) / 100,
    affiliate_revenue_eur: Math.round(affiliateRevenueEurCents) / 100,
    month_count: monthsSet.size,
  });
}
