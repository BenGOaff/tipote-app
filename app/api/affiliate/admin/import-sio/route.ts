// app/api/affiliate/admin/import-sio/route.ts
//
// IMPORTER SES AFFILIÉS SYSTEME.IO DANS NOTRE REGISTRE (29 août 2026).
//
// Béné : "les affiliés Systeme.io se voient AUSSI attribuer notre
// tracking `ref=`, pour que s'ils envoient du monde par un lien `?ref=`
// et pas `?sa=`, la commission leur soit bien attribuée sur notre
// système."
//
// Une ligne par affilié, avec son identifiant Systeme.io comme CLÉ.
// C'est ce qui réunit les deux portes d'entrée sur une seule personne :
// `?sa=` (ancienne page) et `?ref=` (nos liens) tombent alors sur le
// même compte, et une vente sur notre bon de commande le paie.
//
// -- CE QU'ON N'ÉCRASE JAMAIS -----------------------------------------
//
// Un affilié DÉJÀ présent garde son email, son nom, son statut et son
// code public. L'import sert à faire EXISTER ceux qui manquent, pas à
// réécrire ceux qui travaillent : un code public change l'adresse de
// tous les liens qu'il a déjà publiés, et un statut réécrit annulerait
// une exclusion décidée à la main.

import { NextRequest, NextResponse } from "next/server";

import { getAffiliateAdmin } from "@/lib/affiliate/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { lireImportSio } from "@/lib/affiliate/importSio";
import { assurerRefAffiliee } from "@/lib/affiliate/refServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await getAffiliateAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, reason: "not_admin" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { liste?: unknown; appliquer?: unknown };
  const { affilies, refusees } = lireImportSio(String(body.liste ?? ""));

  // APERÇU PAR DÉFAUT. On montre ce qui sera écrit avant de l'écrire :
  // chaque ligne crée quelqu'un qui pourra être payé, et une liste
  // collée de travers ne doit pas se découvrir après coup.
  if (body.appliquer !== true) {
    return NextResponse.json({ ok: true, apercu: true, affilies, refusees });
  }

  const crees: string[] = [];
  const existants: string[] = [];
  const erreurs: { sa: string; message: string }[] = [];

  for (const a of affilies) {
    const { data: deja } = await supabaseAdmin
      .from("affiliates")
      .select("sa")
      .eq("sa", a.sa)
      .maybeSingle();

    if (deja) {
      // Il existe : on ne touche à rien, on lui assure seulement un code
      // public s'il n'en a pas encore. C'est tout l'objet de l'import.
      existants.push(a.sa);
    } else {
      const { error } = await supabaseAdmin.from("affiliates").insert({
        sa: a.sa,
        email: a.email,
        display_name: a.nom,
        // Sa provenance, pour qu'on sache d'où vient cette ligne le jour
        // où quelqu'un se demande pourquoi elle est là.
        origin: "systeme_io",
      });
      if (error) {
        erreurs.push({ sa: a.sa, message: error.message });
        continue;
      }
      crees.push(a.sa);
    }

    // LE CODE PUBLIC, dans les deux cas. C'est LUI qui permet à cet
    // affilié d'utiliser nos liens : sans code, `?ref=` ne peut désigner
    // personne, et il reste enfermé dans l'ancien système.
    const ref = await assurerRefAffiliee({ sa: a.sa, email: a.email, displayName: a.nom });
    if (!ref) {
      erreurs.push({ sa: a.sa, message: "code public non attribué" });
    }
  }

  return NextResponse.json({
    ok: true,
    apercu: false,
    crees: crees.length,
    existants: existants.length,
    refusees,
    erreurs,
  });
}
