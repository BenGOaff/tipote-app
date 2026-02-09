// app/api/strategy/pyramid-offer/route.ts
// ✅ Alias de compat (typo historique) : redirige vers offer-pyramid
// ⚠️ Next.js interdit de "re-export" runtime/dynamic/maxDuration depuis un autre module.

import {
  GET as OfferPyramidGET,
  POST as OfferPyramidPOST,
  PATCH as OfferPyramidPATCH,
} from "../offer-pyramid/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  return OfferPyramidGET(req);
}

export async function POST(req: Request) {
  return OfferPyramidPOST(req);
}

export async function PATCH(req: Request) {
  return OfferPyramidPATCH(req);
}
