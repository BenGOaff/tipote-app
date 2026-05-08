// GET /api/compta/dashboard
//
// Réponse agrégée pour le tableau de bord compta. On charge en une
// seule passe :
//   • les transactions PSP des 24 derniers mois (depuis la table
//     `transactions`)
//   • les saisies manuelles des 24 derniers mois (`manual_transactions`)
// On convertit toutes les devises en EUR via les taux du jour
// frankfurter.app, puis on calcule :
//   • CA depuis le 1er janvier
//   • CA sur 12 mois glissants
//   • Découpage par mois (24 derniers)
//   • Jauge franchise TVA si l'user est auto-entrepreneur
// Le détail des transactions est aussi renvoyé (max 200 lignes
// récentes) pour le tableau "Mes encaissements".

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import {
  getEurForexRates,
  convertToEurCents,
} from "@/lib/compta/forex";
import {
  getVatThresholds,
  pickThresholdForActivity,
  getVatThresholdLabel,
  ROLLING_WINDOW_MONTHS,
} from "@/lib/compta/fiscal-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Statuts qu'on inclut dans le calcul du CA. On exclut explicitement
// 'failed' et 'pending' pour ne pas gonfler le chiffre avec des
// paiements qui ne sont pas encore arrivés ou qui ont été refusés.
const INCLUDED_STATUSES = ["paid", "partial_refund", "refunded"];

interface UnifiedRow {
  id: string;
  paid_at: string;
  amount_cents: number;
  refunded_cents: number;
  currency: string;
  status: string;
  source: string; // 'stripe' | 'paypal' | 'mollie' | 'manual'
  customer_email: string | null;
  customer_name: string | null;
  description: string | null;
}

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  // Fenêtre 24 mois : couvre 12 mois glissants + N-1 pour comparaison
  const now = new Date();
  const since = new Date(now);
  since.setMonth(since.getMonth() - 24);
  const sinceISO = since.toISOString();

  // 1. Transactions PSP
  let txQ = supabaseAdmin
    .from("transactions")
    .select(
      "id, paid_at, amount_cents, refunded_cents, currency, status, provider, customer_email, customer_name, description",
    )
    .eq("user_id", user.id)
    .gte("paid_at", sinceISO)
    .in("status", INCLUDED_STATUSES);
  if (projectId) txQ = txQ.eq("project_id", projectId);
  const { data: txRows, error: txErr } = await txQ;
  if (txErr) {
    return NextResponse.json({ ok: false, error: txErr.message }, { status: 400 });
  }

  // 2. Saisies manuelles (sur la même fenêtre)
  const sinceDate = sinceISO.slice(0, 10); // YYYY-MM-DD
  let manQ = supabaseAdmin
    .from("manual_transactions")
    .select("id, amount_cents, currency, source_label, paid_at, customer_name, description")
    .eq("user_id", user.id)
    .gte("paid_at", sinceDate);
  if (projectId) manQ = manQ.eq("project_id", projectId);
  const { data: manRows, error: manErr } = await manQ;
  if (manErr) {
    return NextResponse.json({ ok: false, error: manErr.message }, { status: 400 });
  }

  // 3. Unifie les 2 sources dans un seul array
  const unified: UnifiedRow[] = [];
  for (const r of txRows ?? []) {
    unified.push({
      id: r.id,
      paid_at: r.paid_at,
      amount_cents: r.amount_cents,
      refunded_cents: r.refunded_cents ?? 0,
      currency: (r.currency || "EUR").toUpperCase(),
      status: r.status,
      source: r.provider,
      customer_email: r.customer_email,
      customer_name: r.customer_name,
      description: r.description,
    });
  }
  for (const r of manRows ?? []) {
    // manual_transactions.paid_at est une date (YYYY-MM-DD), on la
    // hisse à un timestamptz à 12h pour rester cohérent avec les
    // tris et les bornes mensuelles.
    const paidAt = new Date(`${r.paid_at}T12:00:00Z`).toISOString();
    unified.push({
      id: r.id,
      paid_at: paidAt,
      amount_cents: r.amount_cents,
      refunded_cents: 0,
      currency: (r.currency || "EUR").toUpperCase(),
      status: "paid",
      source: "manual",
      customer_email: null,
      customer_name: r.customer_name,
      description: r.description ?? `Saisie manuelle (${r.source_label})`,
    });
  }

  // 4. Currency rates pour la conversion en EUR
  const distinctCurrencies = unified.map((r) => r.currency);
  const { rates, fetchedAt } = await getEurForexRates(distinctCurrencies);

  // 5. Charge le statut compta de l'user (besoin pour la jauge TVA)
  let bpQ = supabaseAdmin
    .from("business_profiles")
    .select("accounting_status, ae_activity_type")
    .eq("user_id", user.id);
  if (projectId) bpQ = bpQ.eq("project_id", projectId);
  const { data: bp } = await bpQ.maybeSingle();
  const status = (bp as { accounting_status?: string | null } | null)?.accounting_status ?? null;
  const aeActivity = (bp as { ae_activity_type?: string | null } | null)?.ae_activity_type ?? null;

  // 6. Agrégations en EUR
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const startOfRolling = new Date(now);
  startOfRolling.setMonth(startOfRolling.getMonth() - ROLLING_WINDOW_MONTHS);

  let ytdEurCents = 0;
  let rollingEurCents = 0;
  let ytdCount = 0;
  let rollingCount = 0;

  // Découpage par mois pour le graph (24 derniers)
  const byMonth = new Map<string, { eurCents: number; count: number }>();

  for (const r of unified) {
    // Net contribution en cents (devise d'origine) : amount - refunded
    const netCents = r.amount_cents - (r.refunded_cents ?? 0);
    const netEur = convertToEurCents(netCents, r.currency, rates);
    const paidDate = new Date(r.paid_at);

    if (paidDate >= startOfYear) {
      ytdEurCents += netEur;
      ytdCount += 1;
    }
    if (paidDate >= startOfRolling) {
      rollingEurCents += netEur;
      rollingCount += 1;
    }

    const monthKey = `${paidDate.getUTCFullYear()}-${String(paidDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = byMonth.get(monthKey) ?? { eurCents: 0, count: 0 };
    bucket.eurCents += netEur;
    bucket.count += 1;
    byMonth.set(monthKey, bucket);
  }

  const months: Array<{ month: string; amount_eur_cents: number; count: number }> = [];
  // Génère 24 buckets vides ordonnés old→new pour avoir un graph
  // continu même quand des mois n'ont aucune vente
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const b = byMonth.get(k);
    months.push({ month: k, amount_eur_cents: b?.eurCents ?? 0, count: b?.count ?? 0 });
  }

  // 7. Jauge franchise TVA — uniquement pour AE. Lecture des seuils
  // depuis fiscal_thresholds (table source de vérité, alimentée par
  // l'admin + cron de check). Fallback hardcodé si la table est vide.
  let vatThreshold: {
    activity_label: string;
    base_eur: number;
    major_eur: number;
    current_eur: number;
    percent_base: number;
    percent_major: number;
    over_base: boolean;
    over_major: boolean;
    source: "db" | "fallback";
  } | null = null;
  if (status === "auto_entrepreneur") {
    const { thresholds, source } = await getVatThresholds("FR");
    const t = pickThresholdForActivity(thresholds, aeActivity);
    if (t) {
      const currentEur = rollingEurCents / 100; // conversion cents→€
      vatThreshold = {
        activity_label: getVatThresholdLabel(aeActivity),
        base_eur: t.base,
        major_eur: t.major,
        current_eur: Math.round(currentEur * 100) / 100,
        percent_base: t.base > 0 ? Math.round((currentEur / t.base) * 1000) / 10 : 0,
        percent_major: t.major > 0 ? Math.round((currentEur / t.major) * 1000) / 10 : 0,
        over_base: currentEur > t.base,
        over_major: currentEur > t.major,
        source,
      };
    }
  }

  // 8. Détail des transactions (max 200 plus récentes)
  unified.sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1));
  const recent = unified.slice(0, 200).map((r) => ({
    id: r.id,
    paid_at: r.paid_at,
    amount_cents: r.amount_cents,
    refunded_cents: r.refunded_cents,
    currency: r.currency,
    amount_eur_cents: convertToEurCents(
      r.amount_cents - r.refunded_cents,
      r.currency,
      rates,
    ),
    status: r.status,
    source: r.source,
    customer_name: r.customer_name,
    description: r.description,
  }));

  return NextResponse.json({
    ok: true,
    stats: {
      ytd: { amount_eur_cents: ytdEurCents, count: ytdCount },
      rolling: { amount_eur_cents: rollingEurCents, count: rollingCount },
      currencies: [...new Set(distinctCurrencies)],
      rates,
      rates_fetched_at: fetchedAt,
    },
    accounting_status: status,
    ae_activity_type: aeActivity,
    vat_threshold: vatThreshold,
    months,
    recent_transactions: recent,
    total_count: unified.length,
  });
}
