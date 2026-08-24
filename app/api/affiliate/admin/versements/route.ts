// app/api/affiliate/admin/versements/route.ts
//
// LE CYCLE DE VERSEMENT, CÔTÉ BÉNÉ.
//
//   GET                          -> l'aperçu du lot + l'historique
//   POST { action: "approuver" } -> fait mûrir les commissions
//   POST { action: "figer" }     -> crée le lot, marque les commissions
//   POST { action: "marquer", id, statut }
//   GET  ?fichier=sepa|paypal&id=<lot>  -> télécharge le fichier
//   GET  ?pieces=<lot>           -> les autofactures émises pour ce lot
//
// Béné, 24 août : export SEPA et virement à la main. **Aucun argent ne
// part d'ici.** On produit un fichier ; c'est elle qui le dépose dans sa
// banque ou dans PayPal, et c'est sa banque qui exécute. Un bouton qui
// virerait vraiment de l'argent depuis un écran d'admin est exactement
// ce qu'on ne construit pas.
//
// -- L'ORDRE DES ÉTAPES N'EST PAS DÉCORATIF ----------------------------
//
// approuver -> préparer (aperçu) -> figer -> exporter -> payer.
//
// `figer` est le point de non retour : il crée la pièce ET marque les
// commissions `paid`. Tant qu'il n'est pas passé, on peut tout refaire.
// Après, les commissions portent l'identifiant du lot et ne repartiront
// jamais dans un autre : c'est ce qui empêche de payer deux fois.

import { NextRequest, NextResponse } from "next/server";

import { getAffiliateAdmin } from "@/lib/affiliate/admin";
import { construirePaypalTsv, construireSepaXml } from "@/lib/affiliate/sepa";
import { periodeDe, type LigneLot } from "@/lib/affiliate/versement";
import {
  approuverCommissionsMures,
  figerLot,
  lireAutofacturesDuLot,
  lireLot,
  lireLots,
  marquerLot,
  preparerLot,
} from "@/lib/affiliate/versementStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * LE COMPTE À DÉBITER, lu dans l'environnement.
 *
 * Jamais écrit en dur : c'est un IBAN d'entreprise, et il n'a rien à
 * faire dans un dépôt Git. Sans lui, le fichier SEPA n'est pas
 * produit et l'écran le DIT au lieu de rendre un fichier que la banque
 * refusera.
 */
function debiteur() {
  const iban = String(process.env.SEPA_DEBTOR_IBAN ?? "").replace(/[\s-]/g, "").toUpperCase();
  if (!iban) return null;
  return {
    nom: String(process.env.SEPA_DEBTOR_NAME ?? "ETHILIFE"),
    iban,
    bic: String(process.env.SEPA_DEBTOR_BIC ?? "").trim().toUpperCase() || null,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await getAffiliateAdmin();
  if (!admin) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });

  const fichier = req.nextUrl.searchParams.get("fichier");
  const id = req.nextUrl.searchParams.get("id");

  // LES PIÈCES DU LOT. Le lot dit combien on a versé, ces lignes disent
  // sur quelle facture : l'écran compare les deux comptes, parce qu'une
  // pièce non émise ne vit sinon que dans `pm2 logs`.
  const pieces = req.nextUrl.searchParams.get("pieces");
  if (pieces) {
    return NextResponse.json({ ok: true, pieces: await lireAutofacturesDuLot(pieces) });
  }

  if (fichier && id) {
    const lot = (await lireLot(id)) as
      | { id: string; periode: string; lignes: LigneLot[] }
      | null;
    if (!lot) return NextResponse.json({ ok: false, reason: "lot_inconnu" }, { status: 404 });

    if (fichier === "sepa") {
      const compte = debiteur();
      if (!compte) {
        // Une raison, jamais un fichier vide : un fichier vide se dépose
        // à la banque et se fait refuser sans qu'on sache pourquoi.
        return NextResponse.json({ ok: false, reason: "sepa_non_configure" }, { status: 503 });
      }
      const xml = construireSepaXml(lot.lignes, {
        lotId: lot.id.slice(0, 8),
        periode: lot.periode,
        debiteur: compte,
        maintenant: new Date(),
      });
      if (!xml) return NextResponse.json({ ok: false, reason: "aucun_virement" }, { status: 404 });
      await marquerLot(lot.id, "exporte", admin);
      return new NextResponse(xml, {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Content-Disposition": `attachment; filename="virements-${lot.periode}.xml"`,
        },
      });
    }

    if (fichier === "paypal") {
      const tsv = construirePaypalTsv(lot.lignes, lot.periode, lot.id.slice(0, 8));
      if (!tsv) return NextResponse.json({ ok: false, reason: "aucun_paypal" }, { status: 404 });
      await marquerLot(lot.id, "exporte", admin);
      return new NextResponse(tsv, {
        headers: {
          "Content-Type": "text/tab-separated-values; charset=utf-8",
          "Content-Disposition": `attachment; filename="paypal-${lot.periode}.txt"`,
        },
      });
    }
    return NextResponse.json({ ok: false, reason: "fichier_inconnu" }, { status: 400 });
  }

  const [apercu, lots] = await Promise.all([preparerLot(), lireLots()]);
  return NextResponse.json({
    ok: true,
    apercu,
    lots,
    periode: periodeDe(new Date()),
    // L'écran doit pouvoir dire "pose SEPA_DEBTOR_IBAN" plutôt que de
    // rendre un bouton qui échoue.
    sepaConfigure: !!debiteur(),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await getAffiliateAdmin();
  if (!admin) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });

  let body: { action?: string; id?: string; statut?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  if (body.action === "approuver") {
    const { approuvees } = await approuverCommissionsMures();
    return NextResponse.json({ ok: true, approuvees });
  }

  if (body.action === "figer") {
    const lot = await preparerLot();
    if (!lot) return NextResponse.json({ ok: false, reason: "lecture" }, { status: 500 });
    const sortie = await figerLot({
      periode: periodeDe(new Date()),
      lot,
      par: admin,
    });
    if (!sortie.ok) {
      return NextResponse.json({ ok: false, reason: sortie.reason }, { status: 409 });
    }
    return NextResponse.json({ ok: true, id: sortie.id });
  }

  if (body.action === "marquer") {
    const statut = String(body.statut ?? "");
    if (!body.id || !["exporte", "paye", "annule"].includes(statut)) {
      return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
    }
    const ok = await marquerLot(body.id, statut as "exporte" | "paye" | "annule", admin);
    return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
  }

  return NextResponse.json({ ok: false, reason: "action_inconnue" }, { status: 400 });
}
