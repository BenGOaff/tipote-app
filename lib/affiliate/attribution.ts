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
import { REF_MIN_LENGTH, sanitizeRef } from "@/lib/affiliate/ref";

const ATTRIBUTION_WINDOW_DAYS = 90;

// Taux de commission Tiquiz : 40% FIXE (Béné 17 juil 2026 : pas de palier,
// nulle part). Les anciens paliers 45%/50% avaient été inventés et sont
// supprimés. Override per-affilié possible plus tard via une colonne
// `affiliates.commission_rate` si besoin.
// NB : l'Atelier du Quiz (Quizing, 70%) est attribué côté formaquiz, pas ici.
const TIQUIZ_COMMISSION_RATE = 0.4;

export type AttributeSaleInput = {
  customer_email: string;
  sale_amount_cents: number;
  currency?: string;
  source_app: "tipote" | "tiquiz";
  sio_order_id: string;
  product_name?: string;
  sale_at: Date;
  raw_payload?: unknown;
  /**
   * L'IDENTIFIANT PORTÉ PAR LE LIEN, QUAND IL N'Y A PAS DE CONVERSION.
   *
   * Sur un tunnel Systeme.io, le `?sa=` était capté par leur page et
   * l'optin créait une ligne dans `affiliate_conversions` : l'attribution
   * par email suffisait donc.
   *
   * Depuis que Tiquiz vend sur son propre domaine avec son propre bon de
   * commande, ce chemin n'existe plus : pas de page Systeme.io, donc pas
   * d'optin, donc **aucune conversion à retrouver**. Sans cet indice, une
   * affiliée qui envoie du monde sur tiquiz.fr n'est payée sur rien, et
   * rien ne le signale.
   *
   * Il ne court-circuite AUCUN contrôle : le `sa` doit exister dans
   * `affiliates`, y être `active`, et ne pas être l'acheteur lui même.
   * La conversion par email reste prioritaire quand elle existe, parce
   * qu'elle est la preuve d'un passage réel, pas d'un paramètre d'URL.
   */
  sa_hint?: string | null;
  /**
   * LE CODE PUBLIC PORTÉ PAR LE LIEN (`?ref=jocelyne`).
   *
   * Depuis le 24 août 2026, nos liens ne portent plus le `sa` de
   * Systeme.io (Béné : "je ne veux surtout pas de sa dans les nouveaux
   * liens"). C'est donc ce champ qui arrive sur une vente prise sur
   * notre propre bon de commande.
   *
   * Il se traduit en `sa` ICI, contre la table `affiliates`, avec les
   * MÊMES contrôles ensuite : l'affiliée doit exister, être active, et
   * ne pas être l'acheteur. `ref_hint` et `sa_hint` sont deux entrées
   * d'une même porte, jamais deux portes.
   */
  ref_hint?: string | null;
};

export type AttributeSaleResult =
  | { status: "attributed"; sa: string; commission_cents: number; commission_id: string }
  | { status: "no_affiliate_match" }
  | { status: "duplicate" }
  | { status: "affiliate_not_registered"; sa: string }
  | { status: "error"; error: string };

/**
 * Le `sa` derrière un code public, ou `null`.
 *
 * Regarde le code ACTUEL puis les ANCIENS (`affiliate_ref_aliases`) :
 * une affiliée qui change de code a des liens dans des vidéos déjà
 * publiées, et ces liens doivent continuer de la payer. C'est la même
 * garantie que `resolveAffiliateByRef` côté redirection, et les deux
 * doivent rester d'accord.
 */
async function saDepuisRef(brut: string | null | undefined): Promise<string | null> {
  const ref = sanitizeRef(brut);
  if (ref.length < REF_MIN_LENGTH) return null;

  const { data: direct, error } = await supabaseAdmin
    .from("affiliates")
    .select("sa")
    .ilike("ref", ref)
    .maybeSingle();
  if (error) {
    // On ne se tait pas : c'est de l'argent dû à quelqu'un.
    console.error(`[affiliate/attribution] lecture du code ${ref} impossible : ${error.message}`);
    return null;
  }
  if (direct) return (direct as { sa: string }).sa;

  const { data: alias } = await supabaseAdmin
    .from("affiliate_ref_aliases")
    .select("sa")
    .eq("ref", ref)
    .maybeSingle();
  return alias ? (alias as { sa: string }).sa : null;
}

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

export async function attributeSale(input: AttributeSaleInput): Promise<AttributeSaleResult> {
  try {
    const email = input.customer_email.trim().toLowerCase();
    if (!email) return { status: "no_affiliate_match" };

    // La conversion PASSE EN PREMIER quand elle existe : c'est la trace
    // d'un passage réel, pas un paramètre d'URL. L'indice du lien ne sert
    // que là où il n'y a rien à retrouver (notre propre bon de commande).
    const conversion = await findRecentConversion(email);
    // Le code public d'abord (c'est ce que portent tous nos liens
    // depuis le 24 août), le `sa` ensuite (anciens liens Systeme.io).
    const saDuRef = await saDepuisRef(input.ref_hint);
    const saHint = (input.sa_hint ?? "").trim();
    const sa = conversion?.sa ?? saDuRef ?? (saHint || null);
    if (!sa) return { status: "no_affiliate_match" };

    // Vérifie que l'affilié existe dans notre registre (sinon refuse
    // — un sa valide format mais inconnu = lien forgé ou ex-affilié banni).
    const { data: affRow } = await supabaseAdmin
      .from("affiliates")
      .select("sa, email, status")
      .eq("sa", sa)
      .maybeSingle();
    const aff = affRow as { sa: string; email: string; status: string } | null;
    if (!aff || aff.status !== "active") {
      return { status: "affiliate_not_registered", sa };
    }

    // Anti-auto-affiliation : on refuse si l'affilié est le client lui-même
    // (même email). Évite de toucher des commissions sur ses propres achats.
    if (aff.email.toLowerCase() === email) {
      console.log(
        `[affiliate/attribution] self-attribution refused: sa=${aff.sa} email=${email}`,
      );
      return { status: "no_affiliate_match" };
    }

    // Commission Tiquiz : 40% fixe.
    const rate = TIQUIZ_COMMISSION_RATE;
    const commissionCents = Math.round(input.sale_amount_cents * rate);

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("affiliate_commissions")
      .insert({
        sa,
        sio_order_id: input.sio_order_id,
        source_app: input.source_app,
        customer_email: email,
        // `null` quand l'attribution vient du lien : il n'y a pas de
        // conversion a rattacher, et en inventer une serait pire.
        conversion_id: conversion?.id ?? null,
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
      sa,
      commission_cents: commissionCents,
      commission_id: (inserted as { id: string }).id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[affiliate/attribution] unexpected:", message);
    return { status: "error", error: message };
  }
}
