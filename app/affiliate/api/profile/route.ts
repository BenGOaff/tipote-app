// app/affiliate/api/profile/route.ts
//
// PATCH /affiliate/api/profile — update du profil affilié connecté.
// Pour l'instant : locale uniquement.
//
// Drame Bene 8 juin 2026 : avant ce fix, cet endpoint acceptait aussi
// paypal_email / iban_holder / iban_number, suggerant a tort que le
// paiement etait gere cote Tipote. NON : le paiement est ENTIEREMENT
// gere par Systeme.io (cf. /affiliate/paiement). Les colonnes DB
// existent toujours (pas de migration) mais ne sont plus exposees ni
// modifiees ici, donc impossible d'induire un user en erreur.
//
// Auth via getAffiliateSession() qui combine session Supabase + check
// affiliates table.

import { NextRequest, NextResponse } from "next/server";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAffiliateLocale } from "../../i18n/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await getAffiliateSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  let body: { locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

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
