// app/api/affiliate/identite/route.ts
//
// SON SIREN OU SON NUMÉRO DE TVA REMPLIT SA FICHE (Béné, 27 août 2026).
//
// "On utilise tout ce qu'on peut pour limiter les risques d'erreur et
// les actions à faire."
//
// Ce n'est pas un confort de saisie. Un profil fiscal incomplet ÉCARTE
// l'affilié du lot de versement (raison `profil-fiscal`) : il a gagné
// son argent, il ne le reçoit pas, et il faut lui écrire. Chaque champ
// rempli à sa place est une occasion de moins de rester bloqué, et une
// faute de frappe de moins sur une pièce comptable.
//
// Deux annuaires, parce qu'un seul ne couvre pas ses affiliés :
//
//   - SIRENE (l'annuaire des entreprises de l'État) pour les FRANÇAIS,
//     et c'est l'immense majorité. Un auto-entrepreneur en franchise en
//     base n'a souvent AUCUN numéro de TVA : VIES ne peut rien pour lui,
//     son SIREN existe toujours.
//   - VIES pour les autres pays de l'Union, qui n'ont pas de SIREN.
//
// -- ON RENSEIGNE, ON NE DÉCIDE RIEN -----------------------------------
//
// Le régime de TVA se décide au moment de figer le lot, avec un verdict
// demandé à ce moment là. Un verdict enregistré aujourd'hui et relu dans
// six mois désignerait une entreprise qui a peut-être fermé depuis.
//
// La session est exigée : ces deux services sont publics et gratuits,
// et le meilleur moyen de se faire couper l'accès est de les laisser
// interroger en masse depuis chez nous.

import { NextRequest, NextResponse } from "next/server";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { chercherSirene, sirenDepuisTvaFr } from "@/lib/affiliate/sirene";
import { interrogerVies } from "@/lib/facture/vies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getAffiliateSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: "not_signed_in" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { siren?: unknown; numeroTva?: unknown };
  const siren = String(body.siren ?? "").trim();
  const numeroTva = String(body.numeroTva ?? "").trim();

  if (siren) {
    const identite = await chercherSirene(siren);
    return NextResponse.json({
      ok: true,
      source: "sirene",
      // `trouve: false` n'est PAS une erreur : un SIREN tout neuf met
      // quelques jours à apparaître dans l'annuaire, et une entreprise
      // peut demander à ne pas y figurer. L'écran le dit au lieu de
      // laisser croire à une saisie fausse.
      trouve: !!identite.denomination,
      identite,
    });
  }

  if (numeroTva) {
    // UN NUMÉRO FRANÇAIS CONTIENT SON SIREN, donc on ne demande rien à
    // VIES : il est bridé en nombre d'appels (il a répondu
    // `MS_MAX_CONCURRENT_REQ` le 27 août, d'où le "l'annuaire ne répond
    // pas" que Béné a vu), là où SIRENE répond tout de suite et rend
    // l'adresse déjà découpée. La clé de contrôle se recalcule sans
    // réseau : un numéro mal tapé ne part nulle part.
    const sirenFr = sirenDepuisTvaFr(numeroTva);
    if (sirenFr) {
      const identite = await chercherSirene(sirenFr);
      return NextResponse.json({
        ok: true,
        source: "sirene",
        trouve: !!identite.denomination,
        identite,
        // Le pays se déduit du préfixe, et l'écran s'en sert pour
        // remplir la case restée vide : sans elle, le champ SIREN ne
        // s'affiche même pas.
        pays: "FR",
      });
    }
    const { verdict, identite } = await interrogerVies(numeroTva);
    return NextResponse.json({ ok: true, source: "vies", verdict, identite });
  }

  return NextResponse.json({ ok: false, reason: "rien_a_chercher" }, { status: 400 });
}
