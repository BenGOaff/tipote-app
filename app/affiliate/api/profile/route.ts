// app/affiliate/api/profile/route.ts
//
// PATCH /affiliate/api/profile — update partial du profil affilié
// connecté. Supporte plusieurs champs (paiement OU locale uniquement,
// pour éviter qu'un client envoie tout d'un coup avec des null).
//
// Auth via getAffiliateSession() qui combine session Supabase + check
// affiliates table.

import { NextRequest, NextResponse } from "next/server";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAffiliateLocale } from "../../i18n/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

function clean(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t.slice(0, max);
}

function isEmail(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (v.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await getAffiliateSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  let body: {
    paypal_email?: string | null;
    iban_holder?: string | null;
    iban_number?: string | null;
    locale?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  // ─── Update locale uniquement ───────────────────────────────────
  // Si seul `locale` est envoyé, on update seulement ce champ. Évite
  // de wiper les coordonnées de paiement quand l'user change juste sa
  // langue depuis le LocaleSwitcher.
  const hasLocale = body.locale !== undefined;
  const hasPayment =
    body.paypal_email !== undefined ||
    body.iban_holder !== undefined ||
    body.iban_number !== undefined;

  if (hasLocale && !hasPayment) {
    if (!isAffiliateLocale(body.locale)) {
      return NextResponse.json({ ok: false, reason: "invalid_locale" }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from("affiliates")
      .update({ locale: body.locale, updated_at: new Date().toISOString() })
      .eq("sa", session.sa);
    if (error) {
      console.error("[affiliate/profile] locale update error:", error.message);
      return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, locale: body.locale });
  }

  // ─── Update méthode de paiement ─────────────────────────────────
  const paypalEmail = clean(body.paypal_email);
  const ibanHolder = clean(body.iban_holder, 100);
  const ibanNumberRaw = clean(body.iban_number);
  const ibanNumber = ibanNumberRaw?.replace(/\s/g, "").toUpperCase() ?? null;

  if (paypalEmail !== null && !isEmail(paypalEmail)) {
    return NextResponse.json({ ok: false, reason: "invalid_paypal_email" }, { status: 400 });
  }
  if (ibanNumber !== null && !IBAN_RE.test(ibanNumber)) {
    return NextResponse.json({ ok: false, reason: "invalid_iban" }, { status: 400 });
  }
  if ((ibanNumber && !ibanHolder) || (ibanHolder && !ibanNumber)) {
    return NextResponse.json({ ok: false, reason: "iban_incomplete" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    paypal_email: paypalEmail,
    iban_holder: ibanHolder,
    iban_number: ibanNumber,
    updated_at: new Date().toISOString(),
  };
  // Si locale ET paiement envoyés ensemble (cas du form signup),
  // on update aussi la locale.
  if (hasLocale && isAffiliateLocale(body.locale)) {
    update.locale = body.locale;
  }

  const { error } = await supabaseAdmin
    .from("affiliates")
    .update(update)
    .eq("sa", session.sa);

  if (error) {
    console.error("[affiliate/profile] payment update error:", error.message);
    return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
