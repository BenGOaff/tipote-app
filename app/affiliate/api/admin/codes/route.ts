// app/affiliate/api/admin/codes/route.ts
//
// Les codes de réduction attribués aux affiliés, côté Béné.
//
//   POST   { code, ref|sa|email, percent_off, produits?, expires_at?, note? }
//   PATCH  { code, enabled?, percent_off?, expires_at? }
//
// Réservé à l'admin (`getAffiliateAdmin`), service role, aucune écriture
// publique possible. La vérification côté acheteur vit ailleurs
// (`/api/affiliate/code-reduction`) : ici on ADMINISTRE, là-bas on juge.
//
// -- PAS DE SUPPRESSION, ET C'EST VOULU --------------------------------
//
// Un code éteint garde sa ligne et son histoire : qui l'avait, à combien,
// jusqu'à quand. Le supprimer effacerait la seule trace de ce qui a été
// promis à quelqu'un, et une affiliée qui demande "pourquoi mon code ne
// marche plus" n'aurait plus de réponse. Même règle que les
// destinations de liens, qu'on désactive au lieu de retirer.

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAffiliateAdmin } from "@/lib/affiliate/admin";
import { SA_RE } from "@/lib/affiliate/saFormat";
import { REF_MIN_LENGTH, sanitizeRef } from "@/lib/affiliate/ref";
import { normaliserCode, remiseValide } from "@/lib/affiliate/codeReduction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function forbidden() {
  return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
}

/**
 * L'affiliée désignée, par son code public, son `sa`, ou son adresse.
 *
 * Trois entrées parce que Béné a les trois sous la main selon d'où elle
 * vient (un email de commission, la fiche d'une affiliée, un lien). Elles
 * ne se devinent JAMAIS l'une l'autre : le champ nomme ce qu'il porte.
 */
async function trouverAffiliee(body: Record<string, unknown>): Promise<string | null> {
  const ref = sanitizeRef(body.ref);
  const sa = String(body.sa ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();

  const req = supabaseAdmin.from("affiliates").select("sa");
  let q;
  if (ref.length >= REF_MIN_LENGTH) q = req.ilike("ref", ref);
  else if (SA_RE.test(sa)) q = req.eq("sa", sa);
  else if (email.includes("@")) q = req.ilike("email", email);
  else return null;

  const { data } = await q.maybeSingle();
  return (data as { sa: string } | null)?.sa ?? null;
}

export async function POST(req: NextRequest) {
  const admin = await getAffiliateAdmin();
  if (!admin) return forbidden();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const code = normaliserCode(body.code);
  if (code.length < 3) {
    return NextResponse.json(
      { ok: false, error: "Le code fait au moins 3 caractères (lettres, chiffres, tirets)." },
      { status: 400 },
    );
  }
  const pct = Number(body.percent_off);
  if (!remiseValide(pct)) {
    return NextResponse.json(
      { ok: false, error: "La remise est un entier entre 1 et 90. Un accès offert se pose depuis la fiche client, pas ici." },
      { status: 400 },
    );
  }

  const sa = await trouverAffiliee(body);
  if (!sa) {
    return NextResponse.json(
      { ok: false, error: "Affiliée introuvable. Donne son code public, son identifiant, ou son adresse email." },
      { status: 400 },
    );
  }

  const produits = Array.isArray(body.produits)
    ? (body.produits as unknown[]).map((p) => String(p ?? "").trim()).filter(Boolean)
    : [];
  const expires = String(body.expires_at ?? "").trim();

  const { error } = await supabaseAdmin.from("affiliate_discount_codes").upsert(
    {
      code,
      sa,
      percent_off: pct,
      produits: produits.length > 0 ? produits : null,
      expires_at: expires || null,
      note: String(body.note ?? "").trim().slice(0, 200) || null,
      enabled: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "code" },
  );

  if (error) {
    console.error(`[admin/codes] ecriture impossible : ${error.message}`);
    return NextResponse.json(
      { ok: false, error: "Écriture impossible. La migration 20260825_codes_reduction_affilies est-elle passée ?" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, code });
}

export async function PATCH(req: NextRequest) {
  const admin = await getAffiliateAdmin();
  if (!admin) return forbidden();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const code = normaliserCode(body.code);
  if (!code) return NextResponse.json({ ok: false, error: "Code requis" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (body.percent_off !== undefined) {
    const pct = Number(body.percent_off);
    if (!remiseValide(pct)) {
      return NextResponse.json({ ok: false, error: "La remise est un entier entre 1 et 90." }, { status: 400 });
    }
    patch.percent_off = pct;
  }
  if (body.expires_at !== undefined) {
    const v = String(body.expires_at ?? "").trim();
    patch.expires_at = v || null;
  }

  const { error } = await supabaseAdmin
    .from("affiliate_discount_codes")
    .update(patch)
    .eq("code", code);

  if (error) {
    console.error(`[admin/codes] mise a jour impossible : ${error.message}`);
    return NextResponse.json({ ok: false, error: "Mise à jour impossible." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
