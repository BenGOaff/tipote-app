// app/api/billing/subscription/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listSubscriptionsForContact } from "@/lib/systemeIoClient";

type ProfileRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  locale: string | null;
  plan: string | null;
  sio_contact_id: string | null;
  product_id: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

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

type InternalPlan = "basic" | "essential" | "elite";

function inferPlanFromSubscription(sub: any): InternalPlan | null {
  // On essaie d’être robuste : selon l’API Systeme.io, la structure peut varier.
  // On teste d’abord offer_price_plan (souvent présent), puis product, puis name.
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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      sio_contact_id?: number | string;
      contactId?: number | string;
      contact?: number | string;
      email?: string;
      limit?: number;
    };

    const limit = typeof body.limit === "number" && body.limit > 0 ? Math.min(body.limit, 100) : 50;
    const email = body.email?.trim() || null;

    // 1) Déterminer le sio_contact_id (priorité au body)
    let contactId: number | null =
      parseContactId(body.sio_contact_id) ?? parseContactId(body.contactId) ?? parseContactId(body.contact);

    let profile: ProfileRow | null = null;

    // 2) Si pas de contactId direct, on essaye de le récupérer via Supabase
    if (!contactId && email) {
      const { data, error } = await supabaseAdmin.from("profiles").select("*").eq("email", email).maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      profile = (data as ProfileRow | null) ?? null;

      const fromProfile = parseContactId(profile?.sio_contact_id ?? null);
      if (fromProfile) contactId = fromProfile;
    }

    // 3) Si toujours pas de contactId, erreur
    if (!contactId) {
      return NextResponse.json(
        { error: "contactId manquant : fournis sio_contact_id/contactId/contact ou un email déjà connu." },
        { status: 400 }
      );
    }

    // 4) Récupérer les abonnements Systeme.io pour ce contact
    const collection = await listSubscriptionsForContact(contactId, {
      limit,
      order: "desc",
    });

    const items = (collection.subscriptions ?? []) as any[];

    // On essaye d’identifier un abonnement "actif"
    const activeSubscription =
      items.find(
        (sub) =>
          String(sub.status ?? "").toLowerCase() === "active" || String(sub.status ?? "").toLowerCase() === "trialing"
      ) ?? null;

    const latestSubscription = items[0] ?? null;

    // 5) Backfill minimal profiles.plan (+ product_id) si on a un profil Supabase
    // Objectif A5 : sécuriser profiles.plan pour que le gating/billing soit fiable.
    try {
      if (!profile && email) {
        const { data } = await supabaseAdmin.from("profiles").select("*").eq("email", email).maybeSingle();
        profile = (data as ProfileRow | null) ?? null;
      }

      if (profile) {
        const inferredPlan = activeSubscription ? inferPlanFromSubscription(activeSubscription) : null;
        const inferredProductId = activeSubscription ? inferProductId(activeSubscription) : null;

        // On met à jour si :
        // - plan est null/vidé OU différent du plan inféré
        // - product_id manquant et inférable
        const currentPlan = (profile.plan ?? "").trim().toLowerCase();
        const shouldUpdatePlan = inferredPlan ? !currentPlan || currentPlan !== inferredPlan : false;
        const currentProductId = (profile.product_id ?? "").trim();
        const shouldUpdateProduct = inferredProductId ? !currentProductId || currentProductId !== inferredProductId : false;

        // Toujours backfill sio_contact_id si manquant
        const currentContact = (profile.sio_contact_id ?? "").trim();
        const shouldUpdateContact = !currentContact || parseContactId(currentContact) !== contactId;

        if (shouldUpdatePlan || shouldUpdateProduct || shouldUpdateContact) {
          const patch: Partial<ProfileRow> = {};

          if (shouldUpdatePlan && inferredPlan) patch.plan = inferredPlan;
          if (shouldUpdateProduct && inferredProductId) patch.product_id = inferredProductId;
          if (shouldUpdateContact) patch.sio_contact_id = String(contactId);

          await supabaseAdmin.from("profiles").update(patch).eq("id", profile.id);
        }
      }
    } catch (e) {
      // Ne bloque pas la réponse — backfill best-effort
      console.warn("[Billing/subscription] backfill profiles.plan failed:", e);
    }

    return NextResponse.json(
      {
        contactId,
        profile,
        subscriptions: items,
        activeSubscription,
        latestSubscription,
        raw: collection.raw ?? collection,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[Billing/subscription] Unexpected error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 });
  }
}
