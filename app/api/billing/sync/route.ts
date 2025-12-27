// app/api/billing/sync/route.ts
// A5 — Sync abonnement (self)
// Objectif: permettre au client (bouton "J’ai déjà payé") de re-vérifier l’abonnement
// et backfill profiles.plan/product_id/sio_contact_id à partir de Systeme.io, via la session.

import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listSubscriptionsForContact } from "@/lib/systemeIoClient";

type InternalPlan = "basic" | "essential" | "elite";

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

function inferPlanFromSubscription(sub: any): InternalPlan | null {
  const offer = sub?.offer_price_plan ?? sub?.offerPricePlan ?? null;

  const name =
    `${offer?.inner_name ?? ""} ${offer?.name ?? ""} ${sub?.product_name ?? ""} ${sub?.product?.name ?? ""} ${sub?.name ?? ""}`
      .toLowerCase()
      .trim();

  if (!name) return null;

  if (name.includes("elite")) return "elite";
  if (name.includes("essential")) return "essential";
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

    // Profil (admin) pour récupérer sio_contact_id (+ plan/product_id existants)
    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, plan, sio_contact_id, product_id")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 });
    }

    const contactId = parseContactId((profile as any)?.sio_contact_id);

    if (!contactId) {
      return NextResponse.json(
        { ok: false, error: "sio_contact_id manquant sur le profil (impossible de sync l’abonnement)." },
        { status: 400 },
      );
    }

    const collection = await listSubscriptionsForContact(contactId, { limit: 50, order: "desc" });
    const subs = (collection.subscriptions ?? []) as any[];

    const active =
      subs.find(
        (sub) =>
          String(sub.status ?? "").toLowerCase() === "active" || String(sub.status ?? "").toLowerCase() === "trialing",
      ) ?? null;

    const inferredPlan = active ? inferPlanFromSubscription(active) : null;
    const inferredProductId = active ? inferProductId(active) : null;

    // Backfill best-effort
    const currentPlan = String((profile as any)?.plan ?? "").trim().toLowerCase();
    const currentProduct = String((profile as any)?.product_id ?? "").trim();
    const currentContact = String((profile as any)?.sio_contact_id ?? "").trim();

    const shouldUpdatePlan = inferredPlan ? !currentPlan || currentPlan !== inferredPlan : false;
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
        plan: inferredPlan ?? (profile as any)?.plan ?? null,
        product_id: inferredProductId ?? (profile as any)?.product_id ?? null,
      },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
