// app/affiliate/go/[ref]/[[...rest]]/route.ts
//
// LE LIEN AFFILIÉ LISIBLE.
//
//   affiliate.tipote.com/go/jocelyne                  -> destination par défaut
//   affiliate.tipote.com/go/jocelyne/atelier          -> une destination
//   affiliate.tipote.com/go/jocelyne/atelier/youtube  -> et un canal
//
// Rappel de routage (piège documenté depuis le drame Gwenn du 8 juin) :
// `affiliate.tipote.com/<path>` est réécrit vers `/affiliate/<path>`, donc
// ce fichier sert bien `/go/...` vu du visiteur. En développement, la même
// route est servie en direct sous `/affiliate/go/...`.
//
// LE VISITEUR PASSE TOUJOURS. Code inconnu, affilié banni, base
// injoignable : on redirige quand même vers la page de vente. Il n'a rien
// fait de mal, il ne doit pas payer un problème qui ne le concerne pas.
// Ce qui varie, c'est l'attribution, pas l'accès.

import { NextRequest, NextResponse } from "next/server";
import {
  clientIpFrom,
  destinationUrl,
  ensureLink,
  recordClick,
  resolveAffiliateByRef,
  sanitizeChannel,
  sanitizeDestination,
  visitCookieHeader,
} from "@/lib/affiliate/goRedirect";
import { canalDeLUrl } from "@/lib/quiz/affiliateRelay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ ref: string; rest?: string[] }> },
): Promise<NextResponse> {
  const { ref: refBrut, rest } = await ctx.params;

  const destination = sanitizeDestination(rest?.[0]);
  // Le canal peut aussi arriver en query (`?sc=youtube`) : c'est la
  // forme qu'on colle dans un outil qui n'accepte pas les chemins
  // profonds.
  //
  // LE CANAL SE LIT SOUS SES DEUX NOMS. Le paramètre s'appelle `sc`
  // depuis le 29 août (`CANAL_PARAM`), il s'appelait `c` avant, et des
  // liens portent déjà l'un ou l'autre. La page Promouvoir enseigne
  // `&sc=` : ne lire que `c` ici perdait le canal de tous ceux qui ont
  // suivi la consigne, en silence. Un canal perdu ne se retrouve pas,
  // le clic est passé.
  const canal = sanitizeChannel(
    rest?.[1] ?? canalDeLUrl(req.nextUrl.searchParams),
  );

  const affilie = await resolveAffiliateByRef(refBrut).catch(() => null);
  const cible = await destinationUrl(destination, affilie);

  // Code inconnu : on laisse passer sans rien enregistrer ni poser.
  if (!affilie) {
    return NextResponse.redirect(cible, { status: 302 });
  }

  // Affilié en pause ou banni : le lien redirige, la vente n'est plus
  // attribuée. On ne pose pas de cookie et on n'enregistre pas de clic,
  // sinon ses statistiques continueraient de grossir pendant sa
  // suspension et donneraient un chiffre trompeur des deux côtés.
  if (!affilie.attributable) {
    const { affiliateOrigin } = await import("@/lib/affiliate/links");
    const { getLinkPath } = await import("@/lib/affiliate/linkDestinations");
    const path = await getLinkPath(destination as never);
    const nu = `${affiliateOrigin(affilie.locale)}${path.startsWith("/") ? "" : "/"}${path}`;
    return NextResponse.redirect(nu, { status: 302 });
  }

  const lien = await ensureLink(affilie.sa, destination, canal).catch(() => null);

  await recordClick({
    sa: affilie.sa,
    ref: affilie.ref,
    destination,
    channel: canal,
    linkId: lien?.id ?? null,
    pageUrl: cible,
    referrer: req.headers.get("referer"),
    userAgent: req.headers.get("user-agent"),
    ip: clientIpFrom(req.headers),
  });

  const reponse = NextResponse.redirect(cible, { status: 302 });
  reponse.headers.append(
    "Set-Cookie",
    visitCookieHeader({ ref: affilie.ref, channel: canal, linkId: lien?.id ?? null }),
  );
  // Une redirection d'affiliation ne se met jamais en cache : le clic
  // suivant doit repasser par ici pour être compté.
  reponse.headers.set("Cache-Control", "no-store, max-age=0");
  return reponse;
}
