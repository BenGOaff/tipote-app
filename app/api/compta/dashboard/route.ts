// GET /api/compta/dashboard
//
// Tableau de bord COMPTA + business analytics. On agrège transactions
// PSP + saisies manuelles sur 24 mois et on calcule les indicateurs
// qui comptent pour un solopreneur : CA mensuel/annuel, MRR (revenus
// récurrents), refund rate, churn, top produits, comparaison N vs N-1.
//
// PAS de tableau exhaustif des transactions ici — l'user va sur
// Stripe / PayPal / Mollie pour ça. Tipote affiche la vue business.

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
} from "@/lib/compta/fiscal-config";
import { detectCountryCode } from "@/lib/compta/countries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INCLUDED_STATUSES = ["paid", "partial_refund", "refunded"];

interface UnifiedRow {
  paid_at: Date;
  amount_cents: number;
  refunded_cents: number;
  amount_eur_cents: number;
  refunded_eur_cents: number;
  currency: string;
  status: string;
  source: string;
  customer_key: string;
  description_normalized: string;
  is_recurring: boolean;
  /** sale (vente directe) | affiliate (commission) | other */
  category: string;
}

/** Heuristique récurrence : détectée via le texte de la description.
 *  Stripe/PayPal/Mollie laissent passer des libellés assez stables
 *  ("Subscription payment", "abonnement", "Recurring"…). Imparfait
 *  mais robuste pour 95% des cas usuels. */
function isRecurring(description: string | null): boolean {
  if (!description) return false;
  const d = description.toLowerCase();
  return (
    d.includes("subscription") ||
    d.includes("abonnement") ||
    d.includes("récurrent") ||
    d.includes("recurring") ||
    d.includes("/mois") ||
    d.includes("/month")
  );
}

/** Normalise la description pour grouper "Paiement pour l'offre #1234 Tipuiz Beta"
 *  et "Paiement pour l'offre #5678 Tipuiz Beta" sous le même produit
 *  "Tipuiz Beta". Stratégie : on enlève les "#NNN" et les "1234"
 *  isolés, on lower-case, on trim. */
function normalizeDescription(d: string | null): string {
  if (!d) return "—";
  return d
    .replace(/#\s*\d+/g, "") // #1234
    .replace(/\b\d{3,}\b/g, "") // 12345 isolés
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function customerKey(email: string | null, name: string | null): string {
  return (email?.toLowerCase().trim() || name?.toLowerCase().trim() || "").slice(0, 200);
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

  const now = new Date();
  const since = new Date(now);
  since.setMonth(since.getMonth() - 24);
  const sinceISO = since.toISOString();

  // 1. Transactions PSP
  let txQ = supabaseAdmin
    .from("transactions")
    .select(
      "id, paid_at, amount_cents, refunded_cents, currency, status, provider, customer_email, customer_name, description, category",
    )
    .eq("user_id", user.id)
    .gte("paid_at", sinceISO)
    .in("status", INCLUDED_STATUSES);
  if (projectId) txQ = txQ.eq("project_id", projectId);
  const { data: txRows, error: txErr } = await txQ;
  if (txErr) {
    return NextResponse.json({ ok: false, error: txErr.message }, { status: 400 });
  }

  // 2. Saisies manuelles
  const sinceDate = sinceISO.slice(0, 10);
  let manQ = supabaseAdmin
    .from("manual_transactions")
    .select("id, amount_cents, currency, source_label, category, paid_at, customer_name, description")
    .eq("user_id", user.id)
    .gte("paid_at", sinceDate);
  if (projectId) manQ = manQ.eq("project_id", projectId);
  const { data: manRows, error: manErr } = await manQ;
  if (manErr) {
    return NextResponse.json({ ok: false, error: manErr.message }, { status: 400 });
  }

  // 3. Currency rates
  const distinctCurrencies = [
    ...(txRows ?? []).map((r) => (r.currency || "EUR").toUpperCase()),
    ...(manRows ?? []).map((r) => (r.currency || "EUR").toUpperCase()),
  ];
  const { rates, fetchedAt } = await getEurForexRates(distinctCurrencies);

  // 4. Unifie les 2 sources avec normalisation EUR
  const unified: UnifiedRow[] = [];
  for (const r of txRows ?? []) {
    const currency = (r.currency || "EUR").toUpperCase();
    unified.push({
      paid_at: new Date(r.paid_at),
      amount_cents: r.amount_cents,
      refunded_cents: r.refunded_cents ?? 0,
      amount_eur_cents: convertToEurCents(r.amount_cents, currency, rates),
      refunded_eur_cents: convertToEurCents(r.refunded_cents ?? 0, currency, rates),
      currency,
      status: r.status,
      source: r.provider,
      customer_key: customerKey(r.customer_email, r.customer_name),
      description_normalized: normalizeDescription(r.description),
      is_recurring: isRecurring(r.description),
      category: (r as { category?: string }).category || "sale",
    });
  }
  for (const r of manRows ?? []) {
    const currency = (r.currency || "EUR").toUpperCase();
    unified.push({
      paid_at: new Date(`${r.paid_at}T12:00:00Z`),
      amount_cents: r.amount_cents,
      refunded_cents: 0,
      amount_eur_cents: convertToEurCents(r.amount_cents, currency, rates),
      refunded_eur_cents: 0,
      currency,
      status: "paid",
      source: "manual",
      customer_key: customerKey(null, r.customer_name),
      description_normalized: normalizeDescription(r.description ?? r.source_label),
      is_recurring: false, // saisie manuelle = ponctuelle par défaut
      category: (r as { category?: string }).category || "sale",
    });
  }

  // 5. Bornes temporelles
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  // Même période N-1 = même mois & jour il y a 1 an (pour un YTD comparable)
  const sameDayLastYear = new Date(Date.UTC(
    now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate(),
    23, 59, 59,
  ));
  const startOfYearMinusOne = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
  const startOfMonthMinusOneYear = new Date(Date.UTC(
    now.getUTCFullYear() - 1, now.getUTCMonth(), 1,
  ));
  const endOfMonthMinusOneYear = new Date(Date.UTC(
    now.getUTCFullYear() - 1, now.getUTCMonth() + 1, 0, 23, 59, 59,
  ));

  // 6. Agrégations
  let monthEur = 0;
  let monthGrossEur = 0;
  let monthRefundedEur = 0;
  let lastMonthEur = 0;
  let lastYearSameMonthEur = 0;
  let ytdEur = 0;
  let ytdGrossEur = 0;
  let ytdRefundedEur = 0;
  let lastYearYtdEur = 0;
  let mrrCurrent = 0;
  let mrrLastMonth = 0;

  // Décomposition ventes directes vs commissions affiliation (pour
  // le mois courant ET YTD). Permet à l'user de voir d'un coup
  // d'œil "j'ai fait 3k de ventes + 2k de commissions" plutôt
  // qu'un seul chiffre agrégé.
  let monthSalesEur = 0;
  let monthAffiliateEur = 0;
  let ytdSalesEur = 0;
  let ytdAffiliateEur = 0;

  const customersCurrentMonth = new Set<string>();
  const customersLastMonth = new Set<string>();
  const customersBeforeCurrentMonth = new Set<string>();
  const recurringCustomersCurrentMonth = new Set<string>();
  const recurringCustomersLastMonth = new Set<string>();

  // Pour le graph N vs N-1 : 12 mois courants + 12 mois N-1 alignés
  // Index 0 = janvier, 11 = décembre. On accumule en EUR cents.
  const currentYearMonths = new Array(12).fill(0);
  const lastYearMonths = new Array(12).fill(0);

  // Pour les top produits ce mois
  const topProductsMonth = new Map<string, { eurCents: number; count: number }>();

  for (const r of unified) {
    const netEur = r.amount_eur_cents - r.refunded_eur_cents;

    // Filtre principal sur statut pertinent
    const inCurrentMonth = r.paid_at >= startOfMonth && r.paid_at <= now;
    const inLastMonth = r.paid_at >= startOfLastMonth && r.paid_at < startOfMonth;
    const inLastYearSameMonth =
      r.paid_at >= startOfMonthMinusOneYear && r.paid_at <= endOfMonthMinusOneYear;
    const inYtd = r.paid_at >= startOfYear && r.paid_at <= now;
    const inLastYearYtd = r.paid_at >= startOfYearMinusOne && r.paid_at <= sameDayLastYear;

    if (inCurrentMonth) {
      monthEur += netEur;
      monthGrossEur += r.amount_eur_cents;
      monthRefundedEur += r.refunded_eur_cents;
      if (r.category === "affiliate") monthAffiliateEur += netEur;
      else monthSalesEur += netEur;
      if (r.customer_key) customersCurrentMonth.add(r.customer_key);
      if (r.is_recurring) {
        mrrCurrent += netEur;
        if (r.customer_key) recurringCustomersCurrentMonth.add(r.customer_key);
      }
      // Top produits
      const key = r.description_normalized || "—";
      const bucket = topProductsMonth.get(key) ?? { eurCents: 0, count: 0 };
      bucket.eurCents += netEur;
      bucket.count += 1;
      topProductsMonth.set(key, bucket);
    }
    if (inLastMonth) {
      lastMonthEur += netEur;
      if (r.customer_key) customersLastMonth.add(r.customer_key);
      if (r.is_recurring) {
        mrrLastMonth += netEur;
        if (r.customer_key) recurringCustomersLastMonth.add(r.customer_key);
      }
    }
    if (r.paid_at < startOfMonth && r.customer_key) {
      customersBeforeCurrentMonth.add(r.customer_key);
    }
    if (inLastYearSameMonth) lastYearSameMonthEur += netEur;
    if (inYtd) {
      ytdEur += netEur;
      ytdGrossEur += r.amount_eur_cents;
      ytdRefundedEur += r.refunded_eur_cents;
      if (r.category === "affiliate") ytdAffiliateEur += netEur;
      else ytdSalesEur += netEur;
    }
    if (inLastYearYtd) lastYearYtdEur += netEur;

    // Graph mensuel par année
    const y = r.paid_at.getUTCFullYear();
    const m = r.paid_at.getUTCMonth();
    if (y === now.getUTCFullYear()) {
      currentYearMonths[m] += netEur;
    } else if (y === now.getUTCFullYear() - 1) {
      lastYearMonths[m] += netEur;
    }
  }

  // Nouveaux clients ce mois = customers du mois jamais vus avant
  let newCustomersCount = 0;
  for (const c of customersCurrentMonth) {
    if (!customersBeforeCurrentMonth.has(c)) newCustomersCount += 1;
  }

  // Churn estimé : clients récurrents du mois précédent qui n'ont
  // PAS payé de récurrent ce mois-ci. Approximation honnête sur la
  // donnée qu'on a — pour un calcul exact il faudrait Stripe Subscriptions.
  let churnedCustomersCount = 0;
  for (const c of recurringCustomersLastMonth) {
    if (!recurringCustomersCurrentMonth.has(c)) churnedCustomersCount += 1;
  }
  const churnRate =
    recurringCustomersLastMonth.size > 0
      ? Math.round((churnedCustomersCount / recurringCustomersLastMonth.size) * 1000) / 10
      : 0;

  // Refund rate YTD = montants remboursés / chiffre d'affaires brut
  const refundRateYtd =
    ytdGrossEur > 0 ? Math.round((ytdRefundedEur / ytdGrossEur) * 1000) / 10 : 0;

  // Deltas N-1 (en %, peuvent être > 100 ou négatifs ou null si pas de
  // référence)
  const deltaMonth = computeDelta(monthEur, lastYearSameMonthEur);
  const deltaYtd = computeDelta(ytdEur, lastYearYtdEur);
  const deltaMonthVsLastMonth = computeDelta(monthEur, lastMonthEur);
  const deltaMrr = computeDelta(mrrCurrent, mrrLastMonth);

  // Top 5 produits du mois
  const topProducts = Array.from(topProductsMonth.entries())
    .map(([name, v]) => ({
      name,
      amount_eur_cents: v.eurCents,
      count: v.count,
    }))
    .sort((a, b) => b.amount_eur_cents - a.amount_eur_cents)
    .slice(0, 5);

  // Graph N vs N-1 — 12 mois en partant du mois courant, on remonte
  // 11 mois en arrière (ex: si on est en mai, on affiche juin N-1
  // → mai N en abscisse, et en parallèle juin N-2 → mai N-1 sur la
  // série de comparaison).
  const monthlyComparison: Array<{
    month_label: string;
    month_index: number; // 1-12
    current_year_eur_cents: number;
    last_year_eur_cents: number;
  }> = [];
  const MONTH_LABELS = [
    "janv.", "févr.", "mars", "avr.", "mai", "juin",
    "juil.", "août", "sept.", "oct.", "nov.", "déc.",
  ];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - i);
    const monthIndex = d.getUTCMonth();
    const year = d.getUTCFullYear();
    monthlyComparison.push({
      month_label: `${MONTH_LABELS[monthIndex]} ${String(year).slice(2)}`,
      month_index: monthIndex + 1,
      current_year_eur_cents:
        year === now.getUTCFullYear() ? currentYearMonths[monthIndex] : lastYearMonths[monthIndex],
      last_year_eur_cents:
        year === now.getUTCFullYear()
          ? lastYearMonths[monthIndex]
          : 0, // rare cas si user n'a pas de N-2 — laissé à 0
    });
  }

  // 7. Statut compta + jauge TVA
  let bpQ = supabaseAdmin
    .from("business_profiles")
    .select("country, accounting_status, ae_activity_type, sasu_vat_regime, ae_vat_franchise, ae_vat_regime, eurl_is_election, ch_vat_assujetti, pt_iva_isento, pt_region, be_vat_franchise, es_iva_regime, es_community, ca_province, ca_gst_registered, ca_petit_fournisseur, us_state, us_sales_tax_states, us_llc_tax_classification")
    .eq("user_id", user.id);
  if (projectId) bpQ = bpQ.eq("project_id", projectId);
  const { data: bp } = await bpQ.maybeSingle();
  const status = (bp as { accounting_status?: string | null } | null)?.accounting_status ?? null;
  const aeActivity = (bp as { ae_activity_type?: string | null } | null)?.ae_activity_type ?? null;
  // Pays détecté pour adapter la TVA (taux + seuil) selon FR / CH.
  const countryCode = detectCountryCode((bp as { country?: string | null } | null)?.country);

  // CA 12 mois glissants = somme des 12 derniers mois
  const rolling12Eur = unified
    .filter((r) => {
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 12);
      return r.paid_at >= cutoff;
    })
    .reduce((s, r) => s + (r.amount_eur_cents - r.refunded_eur_cents), 0);

  // Jauge "seuil TVA" — base_eur / major_eur / current_eur sont des
  // nombres bruts (les noms de champs gardent "_eur" pour compat
  // historique de l'UI ; le champ `currency` indique l'unité réelle).
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
    currency?: "EUR" | "CHF" | "CAD";
  } | null = null;

  if (countryCode === "FR" && status === "auto_entrepreneur") {
    const { thresholds, source } = await getVatThresholds("FR");
    const t = pickThresholdForActivity(thresholds, aeActivity);
    if (t) {
      const currentEur = rolling12Eur / 100;
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
        currency: "EUR",
      };
    }
  } else if (
    countryCode === "CA" &&
    (status === "travailleur_autonome_ca" || status === "entreprise_individuelle_ca")
  ) {
    // Seuil "petit fournisseur" CA = 30 000 $ sur 4 trimestres
    // consécutifs. CA est en EUR dans rolling12Eur, on convertit en
    // CAD pour l'affichage. base = major = 30k (pas de tolérance).
    const { rates } = await getEurForexRates(["CAD"]);
    const eurToCad = rates.CAD ?? 1.48; // fallback ~ taux moyen 2026
    const currentCad = (rolling12Eur / 100) * eurToCad;
    const threshold = 30_000;
    vatThreshold = {
      activity_label: "Seuil petit fournisseur (TPS)",
      base_eur: threshold,
      major_eur: threshold,
      current_eur: Math.round(currentCad * 100) / 100,
      percent_base: threshold > 0 ? Math.round((currentCad / threshold) * 1000) / 10 : 0,
      percent_major: threshold > 0 ? Math.round((currentCad / threshold) * 1000) / 10 : 0,
      over_base: currentCad > threshold,
      over_major: currentCad > threshold,
      source: "fallback",
      currency: "CAD",
    };
  } else if (countryCode === "CH" && status === "independant_ch") {
    // Suisse : seuil unique d'assujettissement TVA = CHF 100'000
    // (CA mondial). On convertit le rolling12 EUR → CHF via forex
    // pour l'afficher dans la bonne devise. base = major = 100k
    // (pas de "tolérance majorée" en CH, l'assujettissement est
    // strict dès le dépassement).
    const { rates } = await getEurForexRates(["CHF"]);
    const eurToChf = rates.CHF ?? 0.95; // fallback ~ taux moyen 2026
    const currentChf = (rolling12Eur / 100) * eurToChf;
    const threshold = 100_000;
    vatThreshold = {
      activity_label: "Seuil d'assujettissement TVA suisse",
      base_eur: threshold,
      major_eur: threshold,
      current_eur: Math.round(currentChf * 100) / 100,
      percent_base: threshold > 0 ? Math.round((currentChf / threshold) * 1000) / 10 : 0,
      percent_major: threshold > 0 ? Math.round((currentChf / threshold) * 1000) / 10 : 0,
      over_base: currentChf > threshold,
      over_major: currentChf > threshold,
      source: "fallback",
      currency: "CHF",
    };
  }

  // TVA collectée estimée — heuristique : si l'user a un régime TVA
  // configuré (SASU avec sasu_vat_regime ou AE hors franchise), on
  // dérive 20% du CA YTD. C'est une approximation (le vrai taux peut
  // varier selon les ventes : 5,5 / 10 / 20%). Suffisant pour la
  // card "TVA à payer" de l'onglet charges. Le FEC, lui, utilise
  // les vrais montants HT/TVA quand on les a au niveau transaction.
  // Estimation TVA collectée — formule : ytdEur × rate / (100 + rate).
  // Le taux dépend du pays (8.1% en CH, 20% en FR) et l'éligibilité
  // dépend du statut + des flags TVA configurés.
  const isVatable = (() => {
    const sasuVatRegime = (bp as { sasu_vat_regime?: string | null } | null)?.sasu_vat_regime;
    // FR — sociétés à l'IS
    if (status === "sasu" || status === "sas" || status === "sarl") {
      return Boolean(sasuVatRegime);
    }
    if (status === "eurl") {
      const eurlIs = (bp as { eurl_is_election?: boolean } | null)?.eurl_is_election;
      return Boolean(eurlIs && sasuVatRegime);
    }
    // FR — auto-entrepreneur hors franchise
    if (status === "auto_entrepreneur") {
      const franchise = (bp as { ae_vat_franchise?: boolean } | null)?.ae_vat_franchise;
      const regime = (bp as { ae_vat_regime?: string | null } | null)?.ae_vat_regime;
      return franchise === false && Boolean(regime);
    }
    // CH — toutes les formes (Indépendant / Sàrl / SA) si l'user
    // a coché le flag d'assujettissement.
    if (status === "independant_ch" || status === "sarl_ch" || status === "sa_ch") {
      return Boolean((bp as { ch_vat_assujetti?: boolean } | null)?.ch_vat_assujetti);
    }
    // PT — toutes les formes pro si pas en regime de isenção.
    if (
      status === "trabalhador_independente_pt" ||
      status === "eni_pt" ||
      status === "lda_unipessoal_pt" ||
      status === "lda_pt" ||
      status === "sa_pt"
    ) {
      const isento = (bp as { pt_iva_isento?: boolean } | null)?.pt_iva_isento;
      return isento === false;
    }
    // BE — toutes les formes pro si pas en franchise.
    if (
      status === "independant_principal_be" ||
      status === "independant_complementaire_be" ||
      status === "srl_be" ||
      status === "sa_be"
    ) {
      const franchise = (bp as { be_vat_franchise?: boolean } | null)?.be_vat_franchise;
      return franchise === false;
    }
    // ES — toutes les formes pro avec régime IVA general/simplificado/recargo.
    // exencion = exonéré, on ne collecte pas d'IVA.
    if (
      status === "autonomo_es" ||
      status === "slu_es" ||
      status === "sl_es" ||
      status === "sa_es"
    ) {
      const regime = (bp as { es_iva_regime?: string | null } | null)?.es_iva_regime;
      const community = (bp as { es_community?: string | null } | null)?.es_community;
      // Ceuta/Melilla = IPSI (hors scope), Canarias = IGIC (taux différent)
      if (community === "CE" || community === "ML") return false;
      return Boolean(regime) && regime !== "exencion";
    }
    // CA — assujetti à TPS (et taxe provinciale combinée) si inscrit
    // au GST. Petit fournisseur (CA < 30k$/4 trim) → non assujetti
    // sauf si inscription volontaire (ca_gst_registered = true).
    if (
      status === "travailleur_autonome_ca" ||
      status === "entreprise_individuelle_ca" ||
      status === "inc_provincial_ca" ||
      status === "inc_federal_ca"
    ) {
      return Boolean((bp as { ca_gst_registered?: boolean } | null)?.ca_gst_registered);
    }
    // US — assujetti à la sales tax dès qu'on est inscrit dans au
    // moins un état. Pas de TVA fédérale aux US, donc le seul moyen
    // d'être "vatable" c'est la sales tax state-level.
    if (
      status === "sole_proprietorship_us" ||
      status === "single_member_llc_us" ||
      status === "multi_member_llc_us" ||
      status === "c_corp_us" ||
      status === "s_corp_us"
    ) {
      const states = (bp as { us_sales_tax_states?: string[] | null } | null)?.us_sales_tax_states;
      return Array.isArray(states) && states.length > 0;
    }
    return false;
  })();

  // Taux TVA normal selon pays (CH 8.1%, FR 20%, PT 23/22/16% selon
  // région, BE 21%). Pour estimer la TVA collectée on assume taux
  // normal sur toutes les ventes — les exceptions sont statistiquement
  // minoritaires sur le CA YTD.
  const vatRateNormal = (() => {
    if (countryCode === "CH") return 8.1;
    if (countryCode === "BE") return 21;
    if (countryCode === "PT") {
      const region = (bp as { pt_region?: string | null } | null)?.pt_region;
      if (region === "madeira") return 22;
      if (region === "acores") return 16;
      return 23; // continente
    }
    if (countryCode === "ES") {
      const community = (bp as { es_community?: string | null } | null)?.es_community;
      if (community === "CN") return 7; // Canarias IGIC tipo general
      return 21; // péninsule + Baléares
    }
    if (countryCode === "CA") {
      // Taux total = TPS 5% + composante provinciale. TVH (ON 13%,
      // NB/NL/NS/PE 15%) inclut déjà la part fédérale.
      const province = (bp as { ca_province?: string | null } | null)?.ca_province;
      switch (province) {
        case "QC": return 14.975;       // 5 + 9.975
        case "ON": return 13;           // TVH harmonisée
        case "NB": case "NL":
        case "NS": case "PE": return 15; // TVH harmonisée
        case "BC": return 12;           // 5 + 7 PST
        case "SK": return 11;           // 5 + 6 PST
        case "MB": return 12;           // 5 + 7 RST
        default: return 5;              // AB, YT, NT, NU + fallback
      }
    }
    if (countryCode === "US") {
      // Pas de TVA fédérale, pas de "taux normal" national. Sales tax
      // state-level + locale (~10 000 juridictions). On utilise un
      // taux moyen pondéré ~7 % (combinaison state moyen 5 % + local
      // moyen 1.5 %) pour donner un ordre de grandeur. L'user sérieux
      // utilisera Stripe Tax / TaxJar pour le calcul exact.
      return 7;
    }
    return 20; // FR
  })();
  const vatCollectedYtdCents = isVatable
    ? Math.round((ytdEur * vatRateNormal) / (100 + vatRateNormal))
    : 0;

  return NextResponse.json({
    ok: true,
    fiscal_year: now.getUTCFullYear(),
    accounting_status: status,
    ae_activity_type: aeActivity,
    vat_collected_ytd_cents: vatCollectedYtdCents,
    metrics: {
      // CA
      month_eur_cents: monthEur,
      ytd_eur_cents: ytdEur,
      rolling_12mo_eur_cents: rolling12Eur,
      last_month_eur_cents: lastMonthEur,
      last_year_same_month_eur_cents: lastYearSameMonthEur,
      last_year_ytd_eur_cents: lastYearYtdEur,
      delta_month_vs_last_year_pct: deltaMonth,
      delta_month_vs_last_month_pct: deltaMonthVsLastMonth,
      delta_ytd_vs_last_year_pct: deltaYtd,

      // MRR
      mrr_eur_cents: mrrCurrent,
      mrr_last_month_eur_cents: mrrLastMonth,
      delta_mrr_pct: deltaMrr,
      recurring_customers_count: recurringCustomersCurrentMonth.size,

      // Refunds
      ytd_refunded_eur_cents: ytdRefundedEur,
      ytd_gross_eur_cents: ytdGrossEur,
      refund_rate_ytd_pct: refundRateYtd,
      month_refunded_eur_cents: monthRefundedEur,
      month_gross_eur_cents: monthGrossEur,

      // Décomposition ventes vs commissions
      month_sales_eur_cents: monthSalesEur,
      month_affiliate_eur_cents: monthAffiliateEur,
      ytd_sales_eur_cents: ytdSalesEur,
      ytd_affiliate_eur_cents: ytdAffiliateEur,

      // Clients
      customers_current_month_count: customersCurrentMonth.size,
      customers_last_month_count: customersLastMonth.size,
      new_customers_count: newCustomersCount,

      // Churn
      churned_customers_count: churnedCustomersCount,
      churn_rate_pct: churnRate,
    },
    monthly_comparison: monthlyComparison,
    top_products_month: topProducts,
    vat_threshold: vatThreshold,
    rates: {
      currencies: [...new Set(distinctCurrencies)],
      rates,
      fetched_at: fetchedAt,
    },
    total_count: unified.length,
  });
}

/** Calcule un delta % entre 2 valeurs (current vs reference). Renvoie
 *  null si la référence est nulle (pas de comparaison possible) */
function computeDelta(current: number, reference: number): number | null {
  if (reference === 0) return null;
  return Math.round(((current - reference) / Math.abs(reference)) * 1000) / 10;
}
