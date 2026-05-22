// lib/affiliate/attribution.ts
//
// Coeur du système d'attribution affiliée. À chaque vente reçue (Tipote
// directement, ou Tiquiz via /api/affiliate/attribute-sale), on cherche
// si l'email du client matche une conversion affiliée récente. Si oui,
// on insère une row dans affiliate_commissions.
//
// Last-touch dans 90 jours : on prend la conversion la plus récente
// pour cet email. Si quelqu'un clique sur 2 affiliés et achète,
// l'affilié qui a "fermé" la vente l'emporte. Standard industrie.
//
// Idempotence : unique constraint (source_app, sio_order_id) en DB.
// Si Systeme.io retry le webhook on ignore silencieusement.

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ATTRIBUTION_WINDOW_DAYS = 90;

// Paliers de commission par défaut. Configurable per-affilié plus tard
// si besoin (override via colonne `affiliates.commission_rate`).
const DEFAULT_TIERS = [
  { minSales: 25, rate: 0.5 },
  { minSales: 10, rate: 0.45 },
  { minSales: 0, rate: 0.4 },
];

export type AttributeSaleInput = {
  customer_email: string;
  sale_amount_cents: number;
  currency?: string;
  source_app: "tipote" | "tiquiz";
  sio_order_id: string;
  product_name?: string;
  sale_at: Date;
  raw_payload?: unknown;
};

export type AttributeSaleResult =
  | { status: "attributed"; sa: string; commission_cents: number; commission_id: string }
  | { status: "no_affiliate_match" }
  | { status: "duplicate" }
  | { status: "affiliate_not_registered"; sa: string }
  | { status: "error"; error: string };

async function findRecentConversion(email: string): Promise<{ id: string; sa: string } | null> {
  const since = new Date(Date.now() - ATTRIBUTION_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("affiliate_conversions")
    .select("id, sa")
    .eq("email", email.toLowerCase())
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[affiliate/attribution] findRecentConversion error:", error.message);
    return null;
  }
  return (data as { id: string; sa: string } | null) ?? null;
}

async function getAffiliateSalesCount(sa: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("affiliate_commissions")
    .select("id", { count: "exact", head: true })
    .eq("sa", sa)
    .in("status", ["pending", "approved", "paid"]);
  return count ?? 0;
}

function commissionRateForSales(salesCount: number): number {
  for (const tier of DEFAULT_TIERS) {
    if (salesCount >= tier.minSales) return tier.rate;
  }
  return DEFAULT_TIERS[DEFAULT_TIERS.length - 1].rate;
}

export async function attributeSale(input: AttributeSaleInput): Promise<AttributeSaleResult> {
  try {
    const email = input.customer_email.trim().toLowerCase();
    if (!email) return { status: "no_affiliate_match" };

    const conversion = await findRecentConversion(email);
    if (!conversion) return { status: "no_affiliate_match" };

    // Vérifie que l'affilié existe dans notre registre (sinon refuse
    // — un sa valide format mais inconnu = lien forgé ou ex-affilié banni).
    const { data: affRow } = await supabaseAdmin
      .from("affiliates")
      .select("sa, email, status")
      .eq("sa", conversion.sa)
      .maybeSingle();
    const aff = affRow as { sa: string; email: string; status: string } | null;
    if (!aff || aff.status !== "active") {
      return { status: "affiliate_not_registered", sa: conversion.sa };
    }

    // Anti-auto-affiliation : on refuse si l'affilié est le client lui-même
    // (même email). Évite de toucher des commissions sur ses propres achats.
    if (aff.email.toLowerCase() === email) {
      console.log(
        `[affiliate/attribution] self-attribution refused: sa=${aff.sa} email=${email}`,
      );
      return { status: "no_affiliate_match" };
    }

    // Calcule la commission selon le palier actuel de l'affilié.
    const currentSales = await getAffiliateSalesCount(conversion.sa);
    const rate = commissionRateForSales(currentSales);
    const commissionCents = Math.round(input.sale_amount_cents * rate);

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("affiliate_commissions")
      .insert({
        sa: conversion.sa,
        sio_order_id: input.sio_order_id,
        source_app: input.source_app,
        customer_email: email,
        conversion_id: conversion.id,
        product_name: input.product_name ?? null,
        sale_amount_cents: input.sale_amount_cents,
        commission_rate: rate,
        commission_cents: commissionCents,
        currency: input.currency ?? "EUR",
        status: "pending",
        sale_at: input.sale_at.toISOString(),
        raw_payload: input.raw_payload ?? null,
      })
      .select("id")
      .single();

    if (insertErr) {
      // Unique constraint hit = retry Systeme.io ; on traite comme idempotent.
      if (insertErr.code === "23505") {
        return { status: "duplicate" };
      }
      console.error("[affiliate/attribution] insert error:", insertErr.message);
      return { status: "error", error: insertErr.message };
    }

    return {
      status: "attributed",
      sa: conversion.sa,
      commission_cents: commissionCents,
      commission_id: (inserted as { id: string }).id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[affiliate/attribution] unexpected:", message);
    return { status: "error", error: message };
  }
}
