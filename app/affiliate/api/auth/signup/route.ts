// app/affiliate/api/auth/signup/route.ts
//
// Activation auto d'un affilié venant de Systeme.io. Conçu pour être
// appelé depuis /affiliate/signup après que l'user a confirmé ses infos
// pré-remplies via merge tags Systeme.io.
//
// Sécurité :
//   1. Format sa validé (regex /^sa[a-f0-9]{20,80}$/i)
//   2. Email validé syntaxiquement
//   3. Email DOIT exister comme contact dans Systeme.io (lookup via
//      leur API publique). Si non → reject. Empêche d'enregistrer un
//      randomly forged sa avec un email inventé.
//   4. Upsert dans `affiliates` (status='active'). Idempotent — un
//      affilié peut re-cliquer le bouton Systeme.io, on update juste.
//   5. Envoie un magic link Supabase pour qu'il puisse se connecter.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { findContactByEmail } from "@/lib/systemeIoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DASHBOARD_URL = process.env.AFFILIATE_DASHBOARD_URL ?? "https://affiliate.tipote.com";

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

function isValidSa(sa: unknown): sa is string {
  return typeof sa === "string" && /^sa[a-f0-9]{20,80}$/i.test(sa);
}

function isEmail(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (v.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

const ALLOWED_LOCALES = new Set(["fr", "en", "es", "it", "pt", "ar"]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { sa?: string; email?: string; display_name?: string | null; locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  if (!isValidSa(body.sa)) {
    return NextResponse.json({ ok: false, reason: "invalid_sa" }, { status: 400 });
  }
  if (!isEmail(body.email)) {
    return NextResponse.json({ ok: false, reason: "invalid_email" }, { status: 400 });
  }

  const sa = body.sa;
  const email = body.email.toLowerCase();
  const displayName = typeof body.display_name === "string"
    ? body.display_name.trim().slice(0, 80) || null
    : null;
  const locale = ALLOWED_LOCALES.has(body.locale ?? "") ? (body.locale as string) : "fr";

  // 1. Vérifier que l'email existe dans Systeme.io. Empêche un visiteur
  //    de créer un faux compte avec un sa volé + email inventé.
  let contactExists = false;
  try {
    const contact = await findContactByEmail(email);
    contactExists = Boolean(contact?.id);
  } catch (err) {
    console.error("[affiliate/signup] findContactByEmail failed:", err);
    // Fail open : si l'API Systeme.io est down, on ne bloque pas. Le
    // pire cas c'est un faux affilié, on le détectera plus tard à la
    // 1ère vente (no match dans webhook → pas d'attribution).
    contactExists = true;
  }
  if (!contactExists) {
    return NextResponse.json({ ok: false, reason: "email_not_in_systeme" }, { status: 200 });
  }

  // 2. Upsert dans affiliates. Si l'utilisateur existe déjà (re-clic
  //    sur le bouton activation), on met juste à jour ses infos.
  const { error: upsertErr } = await supabaseAdmin
    .from("affiliates")
    .upsert(
      {
        sa,
        email,
        display_name: displayName,
        locale,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "sa" },
    );

  if (upsertErr) {
    console.error("[affiliate/signup] upsert error:", upsertErr.message);
    return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
  }

  // 3. Envoi du magic link Supabase pour qu'il se connecte.
  const { error: otpErr } = await supabaseAnon.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${DASHBOARD_URL}/auth/callback`,
    },
  });

  if (otpErr) {
    console.error("[affiliate/signup] signInWithOtp error:", otpErr.message);
    // L'affilié est créé en DB, mais l'envoi du lien a échoué. On
    // retourne quand même ok:true pour pas confondre l'user, mais on
    // marque send_failed pour debug si il rapporte.
    return NextResponse.json({ ok: false, reason: "send_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
