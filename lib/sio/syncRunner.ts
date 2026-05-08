// Common runner for the SIO sales sync — used by both the manual
// endpoint (/api/analytics/sio-sync) and the daily cron
// (/api/cron/sio-sync-sales).
//
// Returns a structured summary so the caller can log + show user
// feedback ("12 ventes synchronisées, 1 247€ sur 4 offres").

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSioApiKey } from "./resolveApiKey";
import {
  aggregateByOfferMonth,
  listUserSales,
  upsertOfferMetrics,
  type OfferDescriptor,
} from "./salesSync";

export interface SyncResult {
  ok: boolean;
  userId: string;
  projectId: string | null;
  salesPulled: number;
  unmatchedCount: number;
  unmatchedRevenue: number;
  rowsTouched: number;
  totalRevenue: number;
  error?: string;
}

interface BusinessProfileOffer {
  name?: string;
  price?: string | number;
  sio_product_id?: string | null;
}

function parseNumeric(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d.,-]/g, "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Pull SIO sales for ONE user / project pair, since `sinceISO`, and
 *  upsert the aggregated totals into offer_metrics. Idempotent. */
export async function syncSioSalesForUser(
  admin: SupabaseClient,
  userId: string,
  projectId: string | null,
  sinceISO: string,
): Promise<SyncResult> {
  const base: SyncResult = {
    ok: false,
    userId,
    projectId,
    salesPulled: 0,
    unmatchedCount: 0,
    unmatchedRevenue: 0,
    rowsTouched: 0,
    totalRevenue: 0,
  };

  const apiKey = await resolveSioApiKey(admin, userId, projectId);
  if (!apiKey) {
    return { ...base, ok: false, error: "Aucune clé API Systeme.io configurée" };
  }

  // Load the user's offers from the active project's business profile.
  // We need name + price + sio_product_id binding to feed the matcher.
  let profileQuery = admin
    .from("business_profiles")
    .select("offers, project_id")
    .eq("user_id", userId);
  if (projectId) profileQuery = profileQuery.eq("project_id", projectId);
  const { data: profileRows } = await profileQuery
    .order("updated_at", { ascending: false })
    .limit(1);
  const profile = profileRows?.[0] ?? null;
  const offers: OfferDescriptor[] = Array.isArray(profile?.offers)
    ? (profile!.offers as BusinessProfileOffer[]).map((o, index) => ({
        index,
        name: typeof o?.name === "string" ? o.name : "",
        sio_product_id:
          typeof o?.sio_product_id === "string" && o.sio_product_id.trim()
            ? o.sio_product_id.trim()
            : null,
        priceNumeric: parseNumeric(o?.price),
      }))
    : [];

  let sales;
  try {
    sales = await listUserSales(apiKey, sinceISO);
  } catch (e) {
    return {
      ...base,
      ok: false,
      error: e instanceof Error ? e.message : "SIO API call failed",
    };
  }

  const { aggregated, unmatchedCount, unmatchedRevenue } = aggregateByOfferMonth(
    sales,
    offers.filter((o) => o.name.trim().length > 0),
  );

  const upsert = await upsertOfferMetrics(
    admin,
    userId,
    profile?.project_id ?? projectId,
    aggregated,
  );

  const totalRevenue = aggregated.reduce((acc, r) => acc + r.revenue, 0);

  return {
    ok: !upsert.error,
    userId,
    projectId,
    salesPulled: sales.length,
    unmatchedCount,
    unmatchedRevenue,
    rowsTouched: upsert.touched,
    totalRevenue,
    error: upsert.error,
  };
}

/** First day of "N months ago" in ISO format. Used by the cron to set
 *  a sane default sync window. */
export function nMonthsAgoISO(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
