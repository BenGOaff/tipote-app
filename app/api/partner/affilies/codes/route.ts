// app/api/partner/affilies/codes/route.ts
//
// ATTRIBUER LES CODES PUBLICS QUI MANQUENT (Béné, 29 août 2026).
//
//   POST  header x-partner-secret  ->  { ok, attribues, dejaLa, echecs }
//
// "Pourquoi certains n'ont pas automatiquement un code ref ?"
//
// -- LA VRAIE RÉPONSE, ET C'EST UN TROU --------------------------------
//
// Un code n'était PAS créé à l'inscription : il l'était au premier écran
// qui en avait besoin (son espace affilié, ou l'import Systeme.io).
// Quelqu'un qui n'a jamais ouvert son espace et qui n'était pas dans un
// import n'a donc aucun code, donc AUCUN LIEN utilisable, et rien ne le
// signalait. Il pouvait rester des mois dans le registre sans pouvoir
// travailler.
//
// -- POURQUOI UNE ACTION EXPLICITE, ET PAS UNE ÉCRITURE À LA LECTURE ---
//
// Attribuer pendant l'affichage de la liste ferait écrire une page qui
// dit seulement regarder. Un rafraîchissement deviendrait une écriture,
// et le jour où ça se passe mal, personne ne saurait d'où ça vient. Un
// bouton, un clic, un compte rendu.
//
// Le code fabriqué est DÉTERMINISTE et ne change plus jamais : ses liens
// vivent dans des vidéos déjà publiées.

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { safeEqual } from "@/lib/partner/tokens";
import { assurerRefAffiliee } from "@/lib/affiliate/refServer";
import { REF_MIN_LENGTH, sanitizeRef } from "@/lib/affiliate/ref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHARED = process.env.PARTNER_SHARED_SECRET;

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!SHARED) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }
  if (!safeEqual(req.headers.get("x-partner-secret") ?? "", SHARED)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("affiliates")
    .select("sa, email, display_name, ref")
    .limit(2000);
  if (error) {
    console.error(`[partner/affilies/codes] lecture impossible : ${error.message}`);
    return NextResponse.json({ ok: false, reason: "read_failed" }, { status: 500 });
  }

  const lignes = (data as { sa: string; email: string; display_name: string | null; ref: string | null }[] | null) ?? [];

  let attribues = 0;
  let dejaLa = 0;
  const echecs: string[] = [];

  for (const a of lignes) {
    if (sanitizeRef(a.ref).length >= REF_MIN_LENGTH) {
      dejaLa += 1;
      continue;
    }
    const ref = await assurerRefAffiliee({
      sa: a.sa,
      email: a.email,
      displayName: a.display_name,
    });
    if (ref) attribues += 1;
    // UN ÉCHEC SE DIT. Sans code, la personne reste sans lien
    // utilisable, et un compte rendu qui annonce "0 attribué" sans
    // préciser pourquoi enverrait chercher au mauvais endroit.
    else echecs.push(a.email);
  }

  return NextResponse.json({ ok: true, attribues, dejaLa, echecs });
}
