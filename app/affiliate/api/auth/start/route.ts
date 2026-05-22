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
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DASHBOARD_URL = process.env.AFFILIATE_DASHBOARD_URL ?? "https://affiliate.tipote.com";

// Client anon Supabase pour signInWithOtp (jamais le service role,
// qui ne peut pas envoyer de magic links destinés au public).
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

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
    .select("sa, status")
    .ilike("email", email)
    .maybeSingle();
  const row = data as { sa: string; status: string } | null;
  if (!row || row.status !== "active") {
    // Délai artificiel pour pas leak via timing l'existence de l'email.
    await new Promise((r) => setTimeout(r, 250));
    return NextResponse.json({ ok: false, reason: "not_affiliate" }, { status: 200 });
  }

  // 2. Envoi du magic link Supabase. shouldCreateUser:true autorise
  //    un affilié à se connecter même s'il n'a jamais été user Tipote
  //    (compte auth.users créé à la volée, sans profile Tipote).
  const { error } = await supabaseAnon.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${DASHBOARD_URL}/auth/callback`,
    },
  });

  if (error) {
    console.error("[affiliate/auth/start] signInWithOtp error:", error.message);
    return NextResponse.json({ ok: false, reason: "send_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
