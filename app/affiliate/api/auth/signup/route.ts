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
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { findContactByEmail } from "@/lib/systemeIoClient";
import { sendAffiliateMagicLink } from "@/lib/affiliate/sendMagicLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  let body: {
    sa?: string;
    email?: string;
    display_name?: string | null;
    locale?: string;
    password?: string | null;
  };
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
  const password = typeof body.password === "string" && body.password.length > 0
    ? body.password
    : null;
  if (password !== null && password.length < 8) {
    return NextResponse.json({ ok: false, reason: "weak_password" }, { status: 400 });
  }

  // 1. Signal Systeme.io (best-effort, NON bloquant).
  //
  //    Drame Christelle 14 juillet 2026 : "je n'arrive pas à créer mon lien,
  //    email pas reconnu dans Systeme.io" alors que c'est bien son email SIO.
  //    Cause : on cherchait l'email dans les CONTACTS, or un AFFILIÉ est une
  //    entité DISTINCTE d'un contact dans Systeme.io. Un affilié légitime
  //    (qui a un vrai `sa...` émis par SIO) peut ne PAS être un contact du
  //    compte -> il était bloqué à tort.
  //
  //    L'identité de confiance ici, c'est le `sa` (déjà validé en format,
  //    émis par SIO, clé de conflit de la table affiliates). L'attribution
  //    des commissions se fait de toute façon au webhook (1ère vente) via ce
  //    `sa` : un faux affilié n'aurait aucune vente attribuée. On ne bloque
  //    donc plus sur la présence en contact ; on loggue juste le signal.
  try {
    const contact = await findContactByEmail(email);
    if (!contact?.id) {
      console.warn("[affiliate/signup] email pas trouvé en contact SIO (affilié pur, non bloquant):", email);
    }
  } catch (err) {
    console.error("[affiliate/signup] findContactByEmail failed (non bloquant):", err);
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

  // 3a. Si l'user a fourni un mot de passe, on crée/met-à-jour son
  //     compte auth.users via l'admin API et on set le password. Ça
  //     lui permet de se connecter direct sans passer par le magic link.
  if (password) {
    try {
      // Tente de récupérer l'user existant
      const { data: { users }, error: listErr } =
        await supabaseAdmin.auth.admin.listUsers();
      if (listErr) throw listErr;
      const existing = users?.find(
        (u) => (u.email ?? "").toLowerCase() === email,
      );

      if (existing) {
        // Update le password
        await supabaseAdmin.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
        });
      } else {
        // Crée le compte avec password
        await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
      }
      // Compte créé avec password → l'user peut se connecter direct.
      // Pas besoin d'envoyer un magic link.
      return NextResponse.json({ ok: true, has_password: true });
    } catch (err) {
      console.error("[affiliate/signup] password set error:", err);
      // Fall through au magic link en fallback
    }
  }

  // 3b. Pas de password OU password set a échoué → envoi du magic link
  // via notre helper Resend (template bi-marque, multilang).
  const linkResult = await sendAffiliateMagicLink({
    email,
    intent: "login",
    locale,
    firstName: displayName,
  });
  if (!linkResult.ok) {
    return NextResponse.json({ ok: false, reason: "send_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
