// app/api/affiliate/coordonnees/route.ts
//
// L'AFFILIÉE DIT COMMENT ELLE VEUT ÊTRE PAYÉE.
//
//   GET  -> { ok, coordonnees, profil, factures }  (l'IBAN sort MASQUÉ)
//   PUT  { methode, ..., profil, accepteLeMandat } -> { ok }
//
// Les coordonnées de VERSEMENT et le profil FISCAL se remplissent sur le
// même écran, parce que ce sont les deux moitiés de la même question :
// "où j'envoie l'argent" et "sur quelle pièce". Ils restent DEUX champs
// distincts dans la réponse : l'écran doit pouvoir dire lequel manque.
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
import {
  MANDAT_VERSION,
  lireProfilFiscal,
  manquesFiscaux,
  profilFiscalComplet,
} from "@/lib/affiliate/fiscal";
import { TEXTE_MANDAT } from "@/lib/affiliate/autofacture";
import { getAffiliateSession } from "@/lib/affiliate/session";
import {
  ecrireCoordonneesAffiliee,
  ecrireProfilFiscalAffiliee,
  lireAutofactures,
  lireCoordonneesAffiliee,
  lireProfilFiscalAffiliee,
} from "@/lib/affiliate/versementStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await getAffiliateSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: "not_signed_in" }, { status: 401 });
  }
  const [coordonnees, profil, factures] = await Promise.all([
    lireCoordonneesAffiliee(session.sa),
    lireProfilFiscalAffiliee(session.sa),
    lireAutofactures(session.sa),
  ]);
  return NextResponse.json({
    ok: true,
    coordonnees,
    profil,
    // Ce qui manque est calculé PAR LA MÊME fonction que celle qui
    // décide, au moment du lot, si on peut émettre sa facture. Deux
    // règles écrites séparément finiraient par ne pas dire la même
    // chose, et c'est l'écran qui mentirait.
    manquesFiscaux: manquesFiscaux(profil ?? lireProfilFiscal({})),
    // "Es-tu payable" est répondu par la MÊME fonction que celle
    // qu'appelle `preparerLot`. L'écran ne redérive rien : un aperçu
    // qui recalcule une décision finit toujours par mentir.
    profilComplet: profilFiscalComplet(profil ?? lireProfilFiscal({})),
    mandat: { version: MANDAT_VERSION, texte: TEXTE_MANDAT },
    factures,
  });
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
    profil?: unknown;
    accepteLeMandat?: boolean;
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

  // LE PROFIL FISCAL, ÉCRIT DANS LA MÊME REQUÊTE.
  //
  // Il est ACCEPTÉ MÊME INCOMPLET, et c'est voulu : quelqu'un qui donne
  // son IBAN aujourd'hui et cherchera son SIREN demain doit pouvoir
  // enregistrer ce qu'il a. Ce qui manque part dans `manquesFiscaux`,
  // et l'écran le dit. Refuser tout parce qu'il manque une ligne lui
  // ferait tout ressaisir, et c'est comme ça qu'on perd la moitié d'un
  // formulaire.
  //
  // Ce qui n'est PAS négociable, c'est le lien avec l'argent : sans
  // profil complet ET sans mandat, `construireLot` l'écarte en le
  // DISANT (raison `profil-fiscal`, distincte de `coordonnees`). Son
  // argent reste acquis et part au lot suivant.
  const profilRecu = lireProfilFiscal(
    (body.profil ?? {}) as Parameters<typeof lireProfilFiscal>[0],
  );
  const ecritProfil = await ecrireProfilFiscalAffiliee({
    sa: session.sa,
    profil: profilRecu,
    // LA DATE DE L'ACCEPTATION VIENT DU SERVEUR (voir le store). Le
    // navigateur dit qu'il accepte, il ne dit pas QUAND.
    accepteLeMandat: body.accepteLeMandat === true,
  });
  if (!ecritProfil.ok) {
    // Les coordonnées sont passées, le profil non : le dire, sinon elle
    // repart en croyant les deux enregistrés et se retrouve écartée du
    // lot sans comprendre pourquoi.
    return NextResponse.json(
      { ok: false, reason: "profil_non_enregistre" },
      { status: 500 },
    );
  }

  // On relit : l'écran doit afficher le MASQUE que la base porte
  // désormais, pas la saisie qu'il vient d'envoyer.
  const [coordonnees, profil, factures] = await Promise.all([
    lireCoordonneesAffiliee(session.sa),
    lireProfilFiscalAffiliee(session.sa),
    lireAutofactures(session.sa),
  ]);
  return NextResponse.json({
    ok: true,
    coordonnees,
    profil,
    // Ce qui manque est calculé PAR LA MÊME fonction que celle qui
    // décide, au moment du lot, si on peut émettre sa facture. Deux
    // règles écrites séparément finiraient par ne pas dire la même
    // chose, et c'est l'écran qui mentirait.
    manquesFiscaux: manquesFiscaux(profil ?? lireProfilFiscal({})),
    // "Es-tu payable" est répondu par la MÊME fonction que celle
    // qu'appelle `preparerLot`. L'écran ne redérive rien : un aperçu
    // qui recalcule une décision finit toujours par mentir.
    profilComplet: profilFiscalComplet(profil ?? lireProfilFiscal({})),
    mandat: { version: MANDAT_VERSION, texte: TEXTE_MANDAT },
    factures,
  });
}
