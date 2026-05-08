// Pull de l'historique des ventes Systeme.io et agrégation dans
// `offer_metrics` pour alimenter le dashboard analytics.
//
// Pipeline :
//   1. listUserSales — appelle GET /api/sales sur la clé SIO de l'user,
//      récupère les ventes depuis une date donnée (défaut : début du
//      mois courant)
//   2. matchSaleToOffer — pour chaque vente, trouve l'offre Tipote
//      correspondante (cascade : sio_product_id explicite > nom exact >
//      fuzzy nom > heuristique prix unique > unmatched)
//   3. aggregateByOfferMonth — somme par (offer_name, month) →
//      sales_count + revenue
//   4. upsertOfferMetrics — UPSERT dans `offer_metrics` (UNIQUE on
//      user_id + offer_name + month)
//
// Idempotent : ré-exécuter la sync ne double-compte pas. On reset
// d'abord les compteurs SIO du user pour la fenêtre, puis on insère
// les nouveaux totaux. Les saisies manuelles (`visitors`, `signups`)
// sont préservées — on ne touche qu'à `sales_count` + `revenue`.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sioUserRequest } from "./userApiClient";

export interface SioSale {
  id: string | number;
  amount: number;
  currency?: string;
  productName?: string;
  productId?: string | number;
  contactEmail?: string;
  createdAt: string; // ISO
  status?: string; // "paid" | "refunded" | …
}

export interface OfferDescriptor {
  /** Position in business_profiles.offers — used as a stable key. */
  index: number;
  name: string;
  /** Optional explicit binding chosen by the user in Settings. */
  sio_product_id?: string | null;
  /** Plain numeric price if the user provided one — used by the
   *  unique-price heuristic. */
  priceNumeric?: number | null;
}

interface MatchResult {
  /** Resolved offer name as stored in offer_metrics (case-preserved). */
  offerName: string;
  /** "explicit" / "name" / "fuzzy" / "price" — surfaced for debug. */
  via: "explicit" | "name" | "fuzzy" | "price" | "unmatched";
}

/** Read /api/sales from Systeme.io for the user's API key. Pages
 *  through the result if SIO returns a Hydra collection. */
export async function listUserSales(
  apiKey: string,
  sinceISO: string,
): Promise<SioSale[]> {
  const sales: SioSale[] = [];
  // SIO uses Hydra-style pagination ; we cap at 5 pages to stay
  // bounded even if the user has thousands of sales. Daily cron
  // catches the rest on the next run.
  let nextPath: string | null = `/sales?createdAt[after]=${encodeURIComponent(sinceISO)}&itemsPerPage=100`;
  let safety = 5;
  while (nextPath && safety-- > 0) {
    const path: string = nextPath;
    const res = await sioUserRequest<Record<string, unknown>>(apiKey, path);
    if (!res.ok || !res.data) break;
    const data = res.data as any;
    const items: any[] = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];
    for (const item of items) {
      const amount =
        typeof item?.amount === "number"
          ? item.amount
          : typeof item?.totalAmount === "number"
            ? item.totalAmount
            : typeof item?.total === "number"
              ? item.total
              : 0;
      if (!amount || !item?.id) continue;
      sales.push({
        id: item.id,
        amount: Number(amount),
        currency:
          typeof item?.currency === "string" ? item.currency : undefined,
        productName:
          typeof item?.productName === "string"
            ? item.productName
            : typeof item?.product?.name === "string"
              ? item.product.name
              : undefined,
        productId:
          item?.productId ?? item?.product?.id ?? item?.product_id ?? undefined,
        contactEmail:
          typeof item?.contact?.email === "string"
            ? item.contact.email
            : typeof item?.email === "string"
              ? item.email
              : undefined,
        createdAt:
          typeof item?.createdAt === "string"
            ? item.createdAt
            : typeof item?.created_at === "string"
              ? item.created_at
              : new Date().toISOString(),
        status:
          typeof item?.status === "string" ? item.status : undefined,
      });
    }
    const view = (data?.["hydra:view"] ?? null) as
      | { "hydra:next"?: string }
      | null;
    nextPath =
      typeof view?.["hydra:next"] === "string"
        ? view["hydra:next"].replace(/^\/api/, "")
        : null;
  }
  return sales;
}

function normalizeName(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Match a SIO sale to one of the user's Tipote offers. Cascade :
 *    1. sio_product_id explicite (binding manuel le plus fiable)
 *    2. nom exact (insensible à la casse)
 *    3. nom fuzzy (substring) — réservé aux offres non-ambiguës
 *    4. prix unique (une seule offre a ce prix)
 *  Si aucune piste, "unmatched" — la vente est ignorée pour l'agrégation
 *  par offre mais reste comptée dans le revenu total via le webhook
 *  feed de `sio_sales`. */
export function matchSaleToOffer(
  sale: SioSale,
  offers: OfferDescriptor[],
): MatchResult {
  // 1. explicit binding
  if (sale.productId !== undefined && sale.productId !== null) {
    const explicit = offers.find(
      (o) =>
        o.sio_product_id !== null &&
        o.sio_product_id !== undefined &&
        String(o.sio_product_id) === String(sale.productId),
    );
    if (explicit) return { offerName: explicit.name, via: "explicit" };
  }

  // 2. exact name
  const saleNameNorm = normalizeName(sale.productName);
  if (saleNameNorm) {
    const exact = offers.find((o) => normalizeName(o.name) === saleNameNorm);
    if (exact) return { offerName: exact.name, via: "name" };
  }

  // 3. fuzzy name (substring) — only when 1 offer matches, to avoid
  //    "Pack 3 mois" matching both "Pack 3 mois Bronze" and "Pack 3
  //    mois Argent".
  if (saleNameNorm) {
    const fuzzy = offers.filter((o) => {
      const n = normalizeName(o.name);
      if (!n) return false;
      return n.includes(saleNameNorm) || saleNameNorm.includes(n);
    });
    if (fuzzy.length === 1) {
      return { offerName: fuzzy[0]!.name, via: "fuzzy" };
    }
  }

  // 4. unique price heuristic — only when exactly one offer has this
  //    exact numeric price. Within ±0.01€ for floats.
  const matchingPrice = offers.filter(
    (o) =>
      typeof o.priceNumeric === "number" &&
      Math.abs(o.priceNumeric - sale.amount) <= 0.01,
  );
  if (matchingPrice.length === 1) {
    return { offerName: matchingPrice[0]!.name, via: "price" };
  }

  return { offerName: "", via: "unmatched" };
}

interface AggregatedRow {
  offerName: string;
  month: string; // YYYY-MM-01
  salesCount: number;
  revenue: number;
}

export function aggregateByOfferMonth(
  sales: SioSale[],
  offers: OfferDescriptor[],
): { aggregated: AggregatedRow[]; unmatchedCount: number; unmatchedRevenue: number } {
  const buckets = new Map<string, AggregatedRow>();
  let unmatchedCount = 0;
  let unmatchedRevenue = 0;

  for (const sale of sales) {
    if (sale.status === "refunded" || sale.status === "canceled") continue;
    const match = matchSaleToOffer(sale, offers);
    if (match.via === "unmatched") {
      unmatchedCount += 1;
      unmatchedRevenue += sale.amount;
      continue;
    }
    const monthDate = new Date(sale.createdAt);
    const monthKey =
      String(monthDate.getUTCFullYear()) +
      "-" +
      String(monthDate.getUTCMonth() + 1).padStart(2, "0") +
      "-01";
    const bucketKey = `${match.offerName.toLowerCase()}|${monthKey}`;
    const existing = buckets.get(bucketKey);
    if (existing) {
      existing.salesCount += 1;
      existing.revenue += sale.amount;
    } else {
      buckets.set(bucketKey, {
        offerName: match.offerName,
        month: monthKey,
        salesCount: 1,
        revenue: sale.amount,
      });
    }
  }

  return {
    aggregated: Array.from(buckets.values()),
    unmatchedCount,
    unmatchedRevenue,
  };
}

/** Upsert aggregated rows into offer_metrics. Reset the SIO-sourced
 *  counters first for the affected (offer, month) pairs so a re-sync
 *  doesn't double-count. We never touch visitors / signups columns —
 *  those are user-entered or fed by other pipelines. */
export async function upsertOfferMetrics(
  admin: SupabaseClient,
  userId: string,
  projectId: string | null,
  rows: AggregatedRow[],
): Promise<{ touched: number; error?: string }> {
  if (rows.length === 0) return { touched: 0 };

  // Step 1 : zero out the SIO counters for the touched (offer, month)
  // pairs. Done as a single UPDATE per touched month for simplicity.
  const months = Array.from(new Set(rows.map((r) => r.month)));
  for (const month of months) {
    const offerNames = rows
      .filter((r) => r.month === month)
      .map((r) => r.offerName);
    if (offerNames.length === 0) continue;
    await admin
      .from("offer_metrics")
      .update({ sales_count: 0, revenue: 0 })
      .eq("user_id", userId)
      .eq("month", month)
      .in("offer_name", offerNames);
  }

  // Step 2 : upsert the fresh totals.
  const upsertRows = rows.map((r) => ({
    user_id: userId,
    project_id: projectId,
    offer_name: r.offerName,
    offer_level: "user_offer" as const,
    is_paid: true,
    month: r.month,
    sales_count: r.salesCount,
    revenue: r.revenue,
  }));

  const { error } = await admin.from("offer_metrics").upsert(upsertRows, {
    onConflict: "user_id,offer_name,month",
    ignoreDuplicates: false,
  });

  return { touched: rows.length, error: error?.message };
}
