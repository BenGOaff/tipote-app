// app/api/affiliate/cancel-sale/route.ts
//
// LA CONTREPARTIE DE `attribute-sale` : la vente est tombée.
//
// Appelée par le webhook de paiement de Tiquiz (Stripe et PayPal) quand
// l'argent repart : remboursement total, ou impayé repris par la banque.
// Même porte, même secret, même forme que l'attribution : deux routes
// qui se répondent doivent se ressembler, sinon on en branche une et
// pas l'autre. C'est très exactement ce qui s'est passé ici : `attribute
// -sale` existait depuis mai, son inverse n'existait pas du tout.
//
// -- ELLE NE FAIT JAMAIS ÉCHOUER LE WEBHOOK QUI L'APPELLE --------------
//
// Elle répond 200 sur tout ce qu'elle comprend, y compris quand il n'y
// avait aucune commission à annuler (le cas le plus fréquent : la vente
// n'avait pas d'affilié). Un remboursement doit fermer l'accès même si
// l'annulation de la commission échoue ; l'inverse ferait rejouer le
// remboursement en boucle.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { annulerCommissionsDeLaVente } from "@/lib/affiliate/annulationStore";
import type { MotifAnnulation } from "@/lib/affiliate/annulation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERNAL_SECRET = process.env.AFFILIATE_INTERNAL_SECRET;

const MOTIFS: readonly MotifAnnulation[] = ["remboursement", "impaye", "fraude"];

function secretOk(received: string | null): boolean {
  if (!received || !INTERNAL_SECRET) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(INTERNAL_SECRET);
  // La longueur d'abord : `timingSafeEqual` LÈVE sur deux tampons de
  // tailles différentes, elle ne rend pas `false`.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!secretOk(req.headers.get("x-affiliate-secret"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  let body: {
    source_app?: string;
    sio_order_id?: string;
    motif?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  // `atelier` depuis le 26 août 2026 : ses commissions vivent ici
  // désormais, donc ses remboursements doivent pouvoir les annuler ici.
  // Sans cette ligne, une vente Atelier remboursée continuerait de mûrir
  // et partirait en virement 30 jours plus tard.
  const sourceApp =
    body.source_app === "tipote" || body.source_app === "tiquiz" || body.source_app === "atelier"
      ? body.source_app
      : null;
  const orderId = String(body.sio_order_id ?? "").trim();
  // LE MOTIF EST OBLIGATOIRE ET VALIDÉ. Il finit dans un journal qu'on
  // relira le jour où il faudra expliquer à un affilié pourquoi sa
  // commission a sauté : "annulée" sans raison ne s'explique pas.
  const motif = MOTIFS.includes(body.motif as MotifAnnulation)
    ? (body.motif as MotifAnnulation)
    : null;

  if (!sourceApp || !orderId || !motif) {
    return NextResponse.json({ ok: false, reason: "invalid_fields" }, { status: 400 });
  }

  const resultat = await annulerCommissionsDeLaVente({ sourceApp, orderId, motif });
  return NextResponse.json({ ok: true, resultat });
}
