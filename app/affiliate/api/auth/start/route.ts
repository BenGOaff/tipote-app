// app/affiliate/api/auth/start/route.ts
//
// Envoie un magic link à l'email saisi via Supabase Auth (signInWithOtp).
// On limite l'envoi aux emails présents dans la table `affiliates` avec
// status='active'. Pour les autres, on retourne not_affiliate.
//
// Le magic link contient un token Supabase qui, une fois cliqué,
// redirige vers /affiliate/auth/callback. Notre callback valide la
// session Supabase + check l'affiliate row + autorise l'accès au
// dashboard.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendAffiliateMagicLink } from "@/lib/affiliate/sendMagicLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isEmail(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (v.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }
  if (!isEmail(body.email)) {
    return NextResponse.json({ ok: false, reason: "invalid_email" }, { status: 400 });
  }
  const email = body.email.toLowerCase();

  // 1. Vérifie que l'affilié existe + est actif. On ne révèle PAS au
  //    client si l'email existe : on retourne not_affiliate dans tous
  //    les cas (404 / banned / not_affiliate). Évite l'énumération.
  const { data } = await supabaseAdmin
    .from("affiliates")
    .select("sa, status, locale, display_name")
    .ilike("email", email)
    .maybeSingle();
  const row = data as { sa: string; status: string; locale: string | null; display_name: string | null } | null;
  if (!row || row.status !== "active") {
    // Délai artificiel pour pas leak via timing l'existence de l'email.
    await new Promise((r) => setTimeout(r, 250));
    return NextResponse.json({ ok: false, reason: "not_affiliate" }, { status: 200 });
  }

  // 2. Envoi du magic link via notre helper custom (Resend + template
  //    bi-marque Tipote × Tiquiz, multilang). Utilise la locale stockée
  //    de l'affilié.
  const result = await sendAffiliateMagicLink({
    email,
    intent: "login",
    locale: row.locale ?? "fr",
    firstName: row.display_name,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
