// app/api/affiliate/ref/route.ts
//
// L'AFFILIÉE CHOISIT SON CODE.
//
//   GET  /api/affiliate/ref?ref=jocelyne  -> disponible ou non, et pourquoi
//   POST /api/affiliate/ref  { ref }      -> le réserve
//
// Derrière la porte du chantier (`canSeeAffiliatePreview`) : tant que la
// page de vente et le paiement ne sont pas chez nous, personne d'autre
// que Béné ne doit pouvoir toucher à ça.
//
// -- CE QUE FAIT LE CHANGEMENT DE CODE ---------------------------------
//
// L'ancien code est déposé dans `affiliate_ref_aliases` AVANT que le
// nouveau soit écrit. Il continue donc de rediriger et d'attribuer les
// ventes pour toujours : une affiliée a des liens dans des vidéos déjà
// publiées, et un code libéré puis réattribué volerait son trafic.
//
// -- ON RENVOIE UNE RAISON, JAMAIS UNE PHRASE --------------------------
//
// L'espace affilié existe en six langues : le serveur dit ce qui s'est
// passé, l'interface sait comment le dire. Même règle que la suppression
// d'un quiz (3 août) et que l'import PDF (7 août).

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { canSeeAffiliatePreview } from "@/lib/affiliate/preview";
import { refError, sanitizeRef } from "@/lib/affiliate/ref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Le code est-il déjà pris, par quelqu'un d'autre que `sa` ? */
async function estPris(ref: string, sa: string): Promise<boolean> {
  const { data: actuel } = await supabaseAdmin
    .from("affiliates")
    .select("sa")
    .ilike("ref", ref)
    .maybeSingle();
  if (actuel && (actuel as { sa: string }).sa !== sa) return true;

  // Un ancien code reste réservé à son propriétaire d'origine, pour
  // toujours : c'est le coeur de la garantie faite aux affiliées.
  const { data: alias } = await supabaseAdmin
    .from("affiliate_ref_aliases")
    .select("sa")
    .eq("ref", ref)
    .maybeSingle();
  if (alias && (alias as { sa: string }).sa !== sa) return true;

  return false;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getAffiliateSession();
  if (!session || !canSeeAffiliatePreview(session.email)) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const demande = req.nextUrl.searchParams.get("ref");
  const raison = refError(demande);
  if (raison) {
    return NextResponse.json({ ok: false, available: false, reason: raison });
  }

  const ref = sanitizeRef(demande);
  const pris = await estPris(ref, session.sa);
  return NextResponse.json({
    ok: true,
    ref,
    available: !pris,
    reason: pris ? "taken" : null,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getAffiliateSession();
  if (!session || !canSeeAffiliatePreview(session.email)) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  let body: { ref?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const raison = refError(body.ref);
  if (raison) {
    return NextResponse.json({ ok: false, reason: raison }, { status: 422 });
  }
  const ref = sanitizeRef(body.ref);

  if (await estPris(ref, session.sa)) {
    // 409 : l'état des données s'y oppose, ce n'est pas une requête
    // malformée. Un 400 laisserait croire à un bug côté écran.
    return NextResponse.json({ ok: false, reason: "taken" }, { status: 409 });
  }

  // L'ancien code d'abord, le nouveau ensuite. Dans cet ordre : si
  // l'écriture du nouveau échoue, on a au pire un alias en trop, ce qui
  // ne casse rien. Dans l'autre sens, on perdrait un ancien lien.
  const { data: avant } = await supabaseAdmin
    .from("affiliates")
    .select("ref")
    .eq("sa", session.sa)
    .maybeSingle();
  const ancien = (avant as { ref: string | null } | null)?.ref ?? null;

  if (ancien && ancien.toLowerCase() !== ref) {
    await supabaseAdmin
      .from("affiliate_ref_aliases")
      .upsert({ ref: ancien.toLowerCase(), sa: session.sa }, { onConflict: "ref" });
  }

  const { error } = await supabaseAdmin
    .from("affiliates")
    .update({ ref, updated_at: new Date().toISOString() })
    .eq("sa", session.sa);

  if (error) {
    // 23505 = quelqu'un a réservé le même code entre notre contrôle et
    // notre écriture. La base tranche, pas nous.
    const reason = error.code === "23505" ? "taken" : "write_failed";
    return NextResponse.json({ ok: false, reason }, { status: reason === "taken" ? 409 : 500 });
  }

  return NextResponse.json({ ok: true, ref, previousRef: ancien });
}
