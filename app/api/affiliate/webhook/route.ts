// app/api/affiliate/webhook/route.ts
//
// Endpoint dédié aux inscriptions au programme d'affiliation depuis
// les formulaires Systeme.io. À attacher à l'automation "Envoyer un
// webhook" du bouton "Je demande mon lien affilié" sur les pages :
//   - tipote.fr/tiquiz/affiliation
//   - tipote.fr/affiliation (Tipote)
//   - Toute autre page d'inscription au programme
//
// Différent de /api/systeme-io/webhook (qui gère les ventes/refunds)
// pour ne pas mélanger les concerns. Cet endpoint a UNE seule mission :
// recevoir un signal "nouvel affilié inscrit côté SIO" et envoyer un
// magic link Supabase pour activer son dashboard côté chez nous.
//
// L'affilié saisit son `sa` lui-même au moment de finaliser sur /signup,
// pour sécurité (empêche un attaquant qui forge l'URL d'inscrire un faux
// affilié avec un sa volé). Pas dans le payload SIO de toute façon.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const DASHBOARD_URL = process.env.AFFILIATE_DASHBOARD_URL ?? "https://affiliate.tipote.com";

function extractEmail(body: any): string | null {
  // SIO envoie l'email dans plusieurs structures possibles selon
  // le type de webhook (form automation, tag event, etc.). On essaie
  // tous les chemins courants.
  const candidates = [
    body?.email,
    body?.contact?.email,
    body?.data?.email,
    body?.data?.contact?.email,
    body?.customer?.email,
    body?.data?.customer?.email,
    body?.fields?.email,
    body?.data?.fields?.email,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.includes("@")) {
      return c.trim().toLowerCase();
    }
  }
  return null;
}

function extractFirstName(body: any): string | null {
  const candidates = [
    body?.first_name,
    body?.firstName,
    body?.contact?.first_name,
    body?.contact?.firstName,
    body?.contact?.fields?.first_name,
    body?.data?.contact?.fields?.first_name,
    body?.data?.first_name,
    body?.customer?.first_name,
    body?.customer?.fields?.first_name,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      return c.trim();
    }
  }
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    // Certaines configs SIO postent en form-urlencoded. Try fallback.
    try {
      const text = await req.text();
      const params = new URLSearchParams(text);
      body = Object.fromEntries(params.entries());
    } catch {
      return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
    }
  }

  const email = extractEmail(body);
  if (!email) {
    console.warn("[affiliate/webhook] no email in payload:", JSON.stringify(body).slice(0, 500));
    return NextResponse.json({ ok: false, reason: "no_email" }, { status: 200 });
  }

  const firstName = extractFirstName(body);

  try {
    // Magic link Supabase. shouldCreateUser:true permet d'accueillir
    // un affilié qui n'a jamais eu de compte Tipote/Supabase. Le
    // redirectTo route vers notre callback qui détecte si la row
    // affiliates existe — si non, on envoie vers /signup pour saisie
    // du sa + activation.
    const { error } = await supabaseAnon.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${DASHBOARD_URL}/auth/callback?next=%2Fsignup`,
      },
    });

    if (error) {
      // Rate limit Supabase est silencieux (pas d'erreur), donc une
      // erreur ici est vraiment un problème (SMTP down, email invalide).
      console.error(`[affiliate/webhook] signInWithOtp failed email=${email}: ${error.message}`);
      return NextResponse.json({ ok: false, error: "send_failed" }, { status: 500 });
    }

    console.log(`[affiliate/webhook] Magic link sent to ${email}${firstName ? ` (${firstName})` : ""}`);
    return NextResponse.json({
      ok: true,
      action: "magic_link_sent",
      email,
    });
  } catch (err) {
    console.error("[affiliate/webhook] unexpected:", err);
    return NextResponse.json({ ok: false, error: "unexpected" }, { status: 500 });
  }
}

// SIO peut faire un OPTIONS preflight selon ses versions. On répond OK
// pour éviter un 405.
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
