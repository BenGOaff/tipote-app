// app/api/billing/sync/route.ts
// A5 — Sync abonnement (self)
// Permet à l’utilisateur connecté de re-vérifier son abonnement Systeme.io
// et de backfill profiles.plan / product_id / sio_contact_id (best-effort).

import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listSubscriptionsForContact } from "@/lib/systemeIoClient";

// ✅ Roadmap: aligner sur free/basic/pro/elite
// 🔁 Compat: "essential" est un alias legacy de "pro"
type StoredPlan = "free" | "basic" | "pro" | "elite" | "beta";
type IncomingPlan = "basic" | "pro" | "elite" | "essential";

function normalizePlan(plan: IncomingPlan | string | null | undefined): StoredPlan {
  const s = String(plan ?? "").trim().toLowerCase();
  if (!s) return "free";
  if (s.includes("elite")) return "elite";
  if (s.includes("beta")) return "beta";
  if (s.includes("pro")) return "pro";
  if (s.includes("essential")) return "pro";
  if (s.includes("basic")) return "basic";
  if (s.includes("free") || s.includes("gratuit")) return "free";
  return "free";
}

function parseContactId(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

// Same ID mapping as the Systeme.io webhook — keep in sync
const OFFER_PRICE_ID_TO_PLAN: Record<string, StoredPlan> = {
  "offerprice-efbd353f": "beta",
  "offerprice-3066719": "beta",
  "offer-price-3066719": "beta",
  "offer-price-3064431": "beta",
  "3066719": "beta",
  "3064431": "beta",
  "offer-price-2963851": "basic",
  "offer-price-3103584": "basic",
  "2963851": "basic",
  "3103584": "basic",
  "offer-price-3103586": "pro",
  "offer-price-3103591": "pro",
  "3103586": "pro",
  "3103591": "pro",
  "offer-price-3103592": "elite",
  "offer-price-3103593": "elite",
  "3103592": "elite",
  "3103593": "elite",
};

function inferPlanFromSubscription(sub: any): IncomingPlan | StoredPlan | null {
  // ✅ Systeme.io API uses "pricePlan" (or legacy "offer_price_plan" / "offerPricePlan")
  const offer = sub?.pricePlan ?? sub?.offer_price_plan ?? sub?.offerPricePlan ?? null;

  // First try: match offer-price ID against known mapping (with normalization)
  const offerId = String(offer?.id ?? sub?.offer_price?.id ?? "").trim();
  if (offerId) {
    // Try raw ID first, then normalized variants (strip prefixes, extract numeric part)
    if (offerId in OFFER_PRICE_ID_TO_PLAN) return OFFER_PRICE_ID_TO_PLAN[offerId];
    const numMatch = offerId.match(/(\d{5,})/);
    if (numMatch && numMatch[1] in OFFER_PRICE_ID_TO_PLAN) return OFFER_PRICE_ID_TO_PLAN[numMatch[1]];
    const withPrefix = numMatch ? `offer-price-${numMatch[1]}` : null;
    if (withPrefix && withPrefix in OFFER_PRICE_ID_TO_PLAN) return OFFER_PRICE_ID_TO_PLAN[withPrefix];
  }

  // Fallback: infer from name strings (handle both camelCase and snake_case)
  const name =
    `${offer?.innerName ?? ""} ${offer?.inner_name ?? ""} ${offer?.name ?? ""} ${sub?.product_name ?? ""} ${sub?.product?.name ?? ""} ${sub?.name ?? ""}`
      .toLowerCase()
      .trim();

  if (!name) return null;
  if (name.includes("beta")) return "beta";
  if (name.includes("elite")) return "elite";
  // ✅ compat legacy
  if (name.includes("essential")) return "essential";
  if (name.includes("pro")) return "pro";
  if (name.includes("basic")) return "basic";
  return null;
}

function inferProductId(sub: any): string | null {
  const raw =
    sub?.product_id ??
    sub?.productId ??
    sub?.product?.id ??
    sub?.product?.product_id ??
    sub?.offer_price_plan?.product_id ??
    sub?.offerPricePlan?.product_id ??
    null;

  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s ? s : null;
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, plan, sio_contact_id, product_id")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json({ ok: false, error: profileErr.message }, { status: 500 });
    }

    const contactId = parseContactId((profile as any)?.sio_contact_id);

    if (!contactId) {
      return NextResponse.json(
        { ok: false, error: "sio_contact_id manquant sur le profil (impossible de sync l’abonnement)." },
        { status: 400 }
      );
    }

    const collection = await listSubscriptionsForContact(contactId, { limit: 50, order: "desc" });
    const subs = (collection.subscriptions ?? []) as any[];

    const active =
      subs.find((s) => {
        const st = String(s?.status ?? "").toLowerCase();
        return st === "active" || st === "trialing";
      }) ?? null;

    const inferredIncomingPlan = active ? inferPlanFromSubscription(active) : null;
    const inferredPlan: StoredPlan | null = inferredIncomingPlan ? normalizePlan(inferredIncomingPlan) : null;

    const inferredProductId = active ? inferProductId(active) : null;

    const currentPlanRaw = String((profile as any)?.plan ?? "").trim();
    const currentPlan = normalizePlan(currentPlanRaw);
    const currentProduct = String((profile as any)?.product_id ?? "").trim();
    const currentContact = String((profile as any)?.sio_contact_id ?? "").trim();

    // Never overwrite beta plan (lifetime access) via billing sync
    const shouldUpdatePlan = inferredPlan && currentPlan !== "beta" ? currentPlan !== inferredPlan : false;
    const shouldUpdateProduct = inferredProductId ? !currentProduct || currentProduct !== inferredProductId : false;
    const shouldUpdateContact = !currentContact || parseContactId(currentContact) !== contactId;

    if (shouldUpdatePlan || shouldUpdateProduct || shouldUpdateContact) {
      const patch: Record<string, any> = {};
      if (shouldUpdatePlan && inferredPlan) patch.plan = inferredPlan;
      if (shouldUpdateProduct && inferredProductId) patch.product_id = inferredProductId;
      if (shouldUpdateContact) patch.sio_contact_id = String(contactId);

      await supabaseAdmin.from("profiles").update(patch).eq("id", session.user.id);
    }

    return NextResponse.json(
      {
        ok: true,
        contactId,
        active: Boolean(active),
        plan: inferredPlan ?? normalizePlan((profile as any)?.plan) ?? "free",
        product_id: inferredProductId ?? (profile as any)?.product_id ?? null,
      },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
