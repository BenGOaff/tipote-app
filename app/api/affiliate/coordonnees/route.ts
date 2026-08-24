// app/api/affiliate/coordonnees/route.ts
//
// L'AFFILIÉE DIT COMMENT ELLE VEUT ÊTRE PAYÉE.
//
//   GET  -> { ok, coordonnees }        (l'IBAN sort MASQUÉ, toujours)
//   PUT  { methode, ... } -> { ok }
//
// Béné, 25 août 2026 : "on doit proposer le choix aux affiliés : Paypal
// ou virement bancaire. Ils doivent pouvoir indiquer leur mail paypal OU
// leur rib pour un virement."
//
// -- L'IBAN NE RESSORT JAMAIS EN CLAIR, PAS MÊME VERS ELLE -------------
//
// Un écran se photographie, se partage, se laisse ouvert sur un bureau.
// Elle a besoin de RECONNAÎTRE le sien (`FR14••••2606`), pas de le
// relire. Pour le changer, elle le ressaisit en entier : c'est deux
// secondes de plus, et ça retire une donnée bancaire de tous les
// journaux, caches et captures d'écran.
//
// -- ON RENVOIE UNE RAISON, JAMAIS UNE PHRASE --------------------------
//
// L'espace affilié existe en six langues : le serveur dit ce qui cloche,
// l'interface sait comment le dire.
//
// -- LA SESSION FAIT FOI, JAMAIS LE CORPS ------------------------------
//
// Le `sa` vient de `getAffiliateSession()`. S'il venait du JSON reçu,
// n'importe qui pourrait rediriger les commissions de n'importe qui vers
// son propre compte : c'est la faille la plus chère qu'un formulaire de
// paiement puisse avoir.

import { NextRequest, NextResponse } from "next/server";

import {
  METHODES,
  lireCoordonnees,
  manquesVersement,
  type MethodeVersement,
} from "@/lib/affiliate/coordonnees";
import { getAffiliateSession } from "@/lib/affiliate/session";
import {
  ecrireCoordonneesAffiliee,
  lireCoordonneesAffiliee,
} from "@/lib/affiliate/versementStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await getAffiliateSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: "not_signed_in" }, { status: 401 });
  }
  const coordonnees = await lireCoordonneesAffiliee(session.sa);
  return NextResponse.json({ ok: true, coordonnees });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const session = await getAffiliateSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: "not_signed_in" }, { status: 401 });
  }

  let body: {
    methode?: string;
    paypalEmail?: string;
    titulaire?: string;
    iban?: string;
    bic?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const methode = String(body.methode ?? "").trim().toLowerCase() as MethodeVersement;
  if (!METHODES.includes(methode)) {
    return NextResponse.json({ ok: false, reason: "methode_inconnue" }, { status: 400 });
  }

  // ON VALIDE AVANT D'ÉCRIRE, avec la MÊME fonction que celle qui décide
  // si le lot peut la payer. Deux règles écrites séparément finiraient
  // par ne pas dire la même chose, et c'est l'écran qui mentirait :
  // "enregistré" ici, "coordonnées incomplètes" dans le lot.
  const candidat = lireCoordonnees({
    payout_method: methode,
    paypal_email: body.paypalEmail,
    iban_holder: body.titulaire,
    iban_number: body.iban,
    bic: body.bic,
  });
  const manques = manquesVersement(candidat);
  if (manques.length > 0) {
    return NextResponse.json({ ok: false, reason: "incomplet", manques }, { status: 400 });
  }

  const ecrit = await ecrireCoordonneesAffiliee({
    sa: session.sa,
    methode,
    paypalEmail: candidat.paypalEmail,
    titulaire: candidat.titulaire,
    iban: candidat.iban,
    bic: candidat.bic,
  });
  if (!ecrit.ok) {
    return NextResponse.json({ ok: false, reason: ecrit.reason ?? "base" }, { status: 500 });
  }

  // On relit : l'écran doit afficher le MASQUE que la base porte
  // désormais, pas la saisie qu'il vient d'envoyer.
  const coordonnees = await lireCoordonneesAffiliee(session.sa);
  return NextResponse.json({ ok: true, coordonnees });
}
