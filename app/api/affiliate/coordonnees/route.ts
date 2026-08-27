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

  // -- DEUX BLOCS INDÉPENDANTS, ET C'EST LA CORRECTION (Béné, 27 août) --
  //
  // "Je ne peux pas enregistrer Tes informations pour la facture, donc
  // quand je reviens dessus rien n'a été sauvegardé."
  //
  // Elle avait raison, et la cause était ici : cette route refusait
  // TOUTE la requête tant que les coordonnées de VERSEMENT n'étaient pas
  // valides. Un `return` sur la méthode manquante, un autre sur
  // `manquesVersement`, tous les deux AVANT l'écriture du profil fiscal.
  // Elle remplissait son adresse et son SIREN, cliquait, et le serveur
  // jetait tout parce qu'il n'avait pas encore son IBAN.
  //
  // Le commentaire plus bas disait pourtant l'intention juste : "il est
  // ACCEPTÉ MÊME INCOMPLET... refuser tout parce qu'il manque une ligne
  // lui ferait tout ressaisir, et c'est comme ça qu'on perd la moitié
  // d'un formulaire". L'intention était bonne, deux `return` posés plus
  // haut la rendaient inatteignable.
  //
  // Les deux blocs répondent à deux questions différentes ("où
  // t'envoyer l'argent" et "quoi écrire sur ta facture") et se
  // remplissent à deux moments différents. On enregistre donc CHACUN dès
  // qu'il est valide, et on DIT ce qui n'est pas passé.
  const methode = String(body.methode ?? "").trim().toLowerCase() as MethodeVersement;

  // ── LE PROFIL FISCAL, D'ABORD ──
  //
  // Accepté MÊME INCOMPLET : quelqu'un qui donne son adresse aujourd'hui
  // et cherchera son SIREN demain doit pouvoir enregistrer ce qu'il a.
  // Ce qui manque part dans `manquesFiscaux`, et l'écran le dit. Ce qui
  // n'est PAS négociable, c'est le lien avec l'argent : sans profil
  // complet ET sans mandat, `construireLot` l'écarte en le DISANT
  // (raison `profil-fiscal`, distincte de `coordonnees`). Son argent
  // reste acquis et part au lot suivant.
  //
  // On n'écrit QUE si l'appelant a envoyé un profil : sans ce garde, une
  // requête qui ne porterait que les coordonnées effacerait l'adresse
  // saisie la semaine d'avant.
  if (body.profil !== undefined || body.accepteLeMandat !== undefined) {
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
      return NextResponse.json(
        { ok: false, reason: "profil_non_enregistre" },
        { status: 500 },
      );
    }
  }

  // ── LES COORDONNÉES DE VERSEMENT ──
  //
  // Elles, on ne les écrit QUE complètes et valides : un IBAN à moitié
  // saisi produirait un fichier SEPA rejeté par la banque trois jours
  // plus tard. La validation passe par la MÊME fonction que celle qui
  // décide si le lot peut la payer : deux règles écrites séparément
  // finiraient par ne pas dire la même chose, et c'est l'écran qui
  // mentirait ("enregistré" ici, "coordonnées incomplètes" dans le lot).
  let manques: string[] = [];
  let versementEnregistre = false;
  if (METHODES.includes(methode)) {
    const candidat = lireCoordonnees({
      payout_method: methode,
      paypal_email: body.paypalEmail,
      iban_holder: body.titulaire,
      iban_number: body.iban,
      bic: body.bic,
    });
    manques = manquesVersement(candidat);
    if (manques.length === 0) {
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
      versementEnregistre = true;
    }
  } else {
    // Pas encore de moyen choisi. Ce n'est pas une erreur : c'est
    // l'ordre dans lequel beaucoup de gens remplissent un formulaire.
    manques = ["methode"];
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
    // Ce qui a VRAIMENT été écrit, et ce qui bloque encore. L'écran a
    // besoin des deux : dire "enregistré" sur un formulaire dont la
    // moitié n'est pas passée est exactement le silence qu'on s'interdit.
    versementEnregistre,
    manques,
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
