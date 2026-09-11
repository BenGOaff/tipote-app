// app/api/cron/approuver-commissions/route.ts
//
// FAIT MÛRIR LES COMMISSIONS SANS ATTENDRE UN CLIC.
//
// Audit du 11 septembre 2026 : `approuverCommissionsMures` n'était
// appelée que par le bouton « Approuver » de `/admin/versements`. Le
// lot du mois dépendait donc d'un geste humain fait AVANT de le figer,
// et un lot construit sans ce clic partait vide ou incomplet, sans
// qu'aucun écran ne le dise.
//
// La décision ne change pas : J+30 (`commissionApprouvable`, pure). Ce
// qui change, c'est QUI la déclenche. Un remboursement qui arrive après
// l'approbation annule toujours la commission (`decideAnnulation` ne
// refuse que ce qui est `paid` ou déjà dans un lot), donc approuver
// tôt ne fait perdre aucune annulation.
//
// Crontab, sur le serveur de Tipote, une fois par jour :
//
//   cd /home/tipote/tipote-app && ( set -a; . .env; set +a;
//     curl -fsS -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//       https://app.tipote.com/api/cron/approuver-commissions )
//
// Le secret est comparé en temps constant (audit du 24 août).

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { approuverCommissionsMures } from "@/lib/affiliate/versementStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = (process.env.CRON_SECRET ?? "").trim();

function autorise(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const recu = req.headers.get("x-cron-secret")?.trim() || "";
  if (recu.length !== CRON_SECRET.length) return false;
  return timingSafeEqual(Buffer.from(recu), Buffer.from(CRON_SECRET));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!autorise(req)) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  const { approuvees } = await approuverCommissionsMures();
  console.log(`[cron/approuver-commissions] ${approuvees} commission(s) approuvee(s)`);
  return NextResponse.json({ ok: true, approuvees });
}
