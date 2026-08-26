// app/api/affiliate/attribute-sale/route.ts
//
// Endpoint INTERNE appelé par le webhook Systeme.io côté Tiquiz pour
// remonter une vente Tiquiz dans le système d'attribution centralisé
// hébergé côté Tipote (Supabase Tipote = source de vérité du dashboard
// affiliate.tipote.com).
//
// Auth : header `X-Affiliate-Secret` qui doit matcher
// AFFILIATE_INTERNAL_SECRET en env. Pas d'auth user — c'est un appel
// machine-to-machine entre nos deux apps.
//
// Tipote app appelle aussi attributeSale() directement depuis son
// propre webhook /api/systeme-io/webhook sans passer par cet endpoint
// (gain de RTT).

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { attributeSale } from "@/lib/affiliate/attribution";
import { SA_RE } from "@/lib/affiliate/saFormat";

/** Format Systeme.io : "sa" + 20 a 80 caracteres hexadecimaux. */


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERNAL_SECRET = process.env.AFFILIATE_INTERNAL_SECRET;

function secretOk(received: string | null): boolean {
  if (!received || !INTERNAL_SECRET) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(INTERNAL_SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!secretOk(req.headers.get("x-affiliate-secret"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  let body: {
    customer_email?: string;
    sale_amount_cents?: number;
    /** "ht" ou "ttc" : sur quoi le pourcentage s'applique. Voir plus bas. */
    base?: string;
    /** "nous" ou "systeme_io" : qui verse cette commission. Voir plus bas. */
    regle_par?: string;
    currency?: string;
    source_app?: "tipote" | "tiquiz" | "atelier";
    sio_order_id?: string;
    product_name?: string;
    sale_at?: string;
    raw_payload?: unknown;
    /** Le `sa` porte par un ANCIEN lien Systeme.io. */
    affiliate_ref?: string | null;
    /** Le CODE PUBLIC porte par nos liens depuis le 24 aout 2026. */
    affiliate_code?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  // Validation minimale — les champs critiques.
  if (
    typeof body.customer_email !== "string" ||
    typeof body.sale_amount_cents !== "number" ||
    body.sale_amount_cents < 0 ||
    typeof body.sio_order_id !== "string" ||
    (body.source_app !== "tipote" &&
      body.source_app !== "tiquiz" &&
      // L'Atelier depuis le 26 août 2026. Sans cette ligne, ses ventes
      // sont refusées en 400 et l'affilié n'est payé sur rien.
      body.source_app !== "atelier")
  ) {
    return NextResponse.json({ ok: false, reason: "invalid_fields" }, { status: 400 });
  }

  // LA BASE EST DITE PAR L'APPELANT, JAMAIS DEVINÉE ICI.
  //
  // Les trois appelants n'envoyaient pas la même chose dans
  // `sale_amount_cents` : notre bon de commande et la route SIO de
  // l'Atelier envoient du HT, les webhooks Systeme.io envoient du TTC.
  // Le champ portait donc deux sens, et le webhook Systeme.io de Tiquiz
  // surpayait de ~20 % en silence (audit du 26 août).
  //
  // **Un appelant muet est lu comme TTC, et ça crie.** Le repli n'est
  // pas neutre, il est CONSERVATEUR : lire un HT comme du TTC sous-paie
  // de 17 %, ce qui se rattrape au lot suivant ; lire un TTC comme du HT
  // surpaie de 20 %, et un virement parti ne revient pas. Ce cas ne doit
  // exister que pendant le déploiement, le temps que les deux apps
  // soient à jour.
  const base = body.base === "ht" || body.base === "ttc" ? body.base : null;
  if (!base) {
    console.error(
      `[affiliate/attribute-sale] appelant sans \`base\` sur ${body.source_app}:${body.sio_order_id} : ` +
        `lu comme TTC par prudence. A corriger cote appelant.`,
    );
  }

  // QUI VERSE, DIT PAR L'APPELANT.
  //
  // Une vente passée par un tunnel Systeme.io est versée par EUX : on
  // l'enregistre pour que le tableau de bord de l'affilié soit complet,
  // jamais pour la virer nous mêmes. Une vente prise sur notre bon de
  // commande, c'est l'inverse.
  //
  // **Le repli est `systeme_io`, et il est CONSERVATEUR** : une ligne
  // dont on ignore le payeur ne partira PAS dans un lot. Elle
  // s'affichera comme versée par eux, ce qui se corrige d'un UPDATE ;
  // l'inverse partirait en virement, et un virement ne se reprend pas.
  const reglePar = body.regle_par === "nous" || body.regle_par === "systeme_io" ? body.regle_par : null;
  if (!reglePar) {
    console.error(
      `[affiliate/attribute-sale] appelant sans \`regle_par\` sur ${body.source_app}:${body.sio_order_id} : ` +
        `comptee comme versee par Systeme.io, donc EXCLUE des lots. A corriger cote appelant.`,
    );
  }

  // LE PRODUIT SE DÉDUIT DE L'APP QUI A VENDU, ET DE RIEN D'AUTRE.
  //
  // Ajouter un champ `produit` au corps aurait créé un drapeau de plus à
  // maintenir, donc un drapeau qu'un appelant finit par oublier : et
  // l'oublier ferait payer une vente Atelier à 40% au lieu de 70%, en
  // silence. `source_app` est déjà obligatoire et déjà sans ambiguïté.
  // C'est la leçon du 24 août : quand une décision demande un drapeau,
  // se demander d'abord si la donnée qu'on a déjà ne répond pas seule.
  //
  // `tipote` reste au taux `tiquiz` : c'est ce qu'il a toujours été.
  const produit = body.source_app === "atelier" ? "atelier" : "tiquiz";

  const result = await attributeSale({
    customer_email: body.customer_email,
    produit,
    sale_amount_cents: body.sale_amount_cents,
    base: base ?? "ttc",
    reglePar: reglePar ?? "systeme_io",
    currency: body.currency,
    source_app: body.source_app,
    sio_order_id: body.sio_order_id,
    product_name: body.product_name,
    sale_at: body.sale_at ? new Date(body.sale_at) : new Date(),
    raw_payload: body.raw_payload,
    // On ne fait PAS confiance a la forme recue : ces valeurs finissent
    // dans une ligne de commission, donc dans un versement.
    sa_hint: typeof body.affiliate_ref === "string" && SA_RE.test(body.affiliate_ref.trim())
      ? body.affiliate_ref.trim()
      : null,
    // Le code public est nettoye et traduit en `sa` par `attributeSale`,
    // contre la table `affiliates`. Un code invente n'y correspond a
    // personne, donc n'attribue rien.
    ref_hint: typeof body.affiliate_code === "string" ? body.affiliate_code : null,
  });

  return NextResponse.json({ ok: true, result });
}
