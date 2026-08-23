// app/api/affiliate/attribute-sale/route.ts
//
// Endpoint INTERNE appelé par le webhook Systeme.io côté Tiquiz pour
// remonter une vente Tiquiz dans le système d'attribution centralisé
// hébergé côté Tipote (Supabase Tipote = source de vérité du dashboard
// affiliate.tipote.com).
//
// Auth : header `X-Affiliate-Secret` qui doit matcher
// AFFILIATE_INTERNAL_SECRET en env. Pas d'auth user — c'est un appel
// machine-to-machine entre nos deux apps.
//
// Tipote app appelle aussi attributeSale() directement depuis son
// propre webhook /api/systeme-io/webhook sans passer par cet endpoint
// (gain de RTT).

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { attributeSale } from "@/lib/affiliate/attribution";
import { SA_RE } from "@/lib/affiliate/saFormat";

/** Format Systeme.io : "sa" + 20 a 80 caracteres hexadecimaux. */


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERNAL_SECRET = process.env.AFFILIATE_INTERNAL_SECRET;

function secretOk(received: string | null): boolean {
  if (!received || !INTERNAL_SECRET) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(INTERNAL_SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!secretOk(req.headers.get("x-affiliate-secret"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  let body: {
    customer_email?: string;
    sale_amount_cents?: number;
    currency?: string;
    source_app?: "tipote" | "tiquiz";
    sio_order_id?: string;
    product_name?: string;
    sale_at?: string;
    raw_payload?: unknown;
    /** Le `sa` porte par un ANCIEN lien Systeme.io. */
    affiliate_ref?: string | null;
    /** Le CODE PUBLIC porte par nos liens depuis le 24 aout 2026. */
    affiliate_code?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  // Validation minimale — les champs critiques.
  if (
    typeof body.customer_email !== "string" ||
    typeof body.sale_amount_cents !== "number" ||
    body.sale_amount_cents < 0 ||
    typeof body.sio_order_id !== "string" ||
    (body.source_app !== "tipote" && body.source_app !== "tiquiz")
  ) {
    return NextResponse.json({ ok: false, reason: "invalid_fields" }, { status: 400 });
  }

  const result = await attributeSale({
    customer_email: body.customer_email,
    sale_amount_cents: body.sale_amount_cents,
    currency: body.currency,
    source_app: body.source_app,
    sio_order_id: body.sio_order_id,
    product_name: body.product_name,
    sale_at: body.sale_at ? new Date(body.sale_at) : new Date(),
    raw_payload: body.raw_payload,
    // On ne fait PAS confiance a la forme recue : ces valeurs finissent
    // dans une ligne de commission, donc dans un versement.
    sa_hint: typeof body.affiliate_ref === "string" && SA_RE.test(body.affiliate_ref.trim())
      ? body.affiliate_ref.trim()
      : null,
    // Le code public est nettoye et traduit en `sa` par `attributeSale`,
    // contre la table `affiliates`. Un code invente n'y correspond a
    // personne, donc n'attribue rien.
    ref_hint: typeof body.affiliate_code === "string" ? body.affiliate_code : null,
  });

  return NextResponse.json({ ok: true, result });
}
