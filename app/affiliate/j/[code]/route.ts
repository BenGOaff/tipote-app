// app/affiliate/j/[code]/route.ts
//
// LE LIEN COURT : `affiliate.tipote.com/j/a7k`
//
// Ce n'est PAS un raccourcisseur posé par dessus le lien long. Les deux
// pointent sur la MÊME ligne de `affiliate_links` : même affilié, même
// destination, même canal, mêmes statistiques. C'est exactement pour ça
// qu'un lien court ne peut pas "casser le cookie", il n'ajoute aucune
// étape.
//
// Et c'est la raison pour laquelle un raccourcisseur EXTERNE (bit.ly et
// consorts) est proscrit : il ajoute un saut qu'on ne maîtrise pas,
// certains suppriment les paramètres d'URL, et le clic peut alors cesser
// d'être compté sans que personne ne le voie.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  clientIpFrom,
  destinationUrl,
  recordClick,
  resolveShortCode,
  visitCookieHeader,
  DEFAULT_DESTINATION,
} from "@/lib/affiliate/goRedirect";
import { affiliateOrigin } from "@/lib/affiliate/links";
import { getLinkPath } from "@/lib/affiliate/linkDestinations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Repli quand le code court ne désigne rien : la page de vente, nue. */
async function pageDeVente(): Promise<string> {
  const path = await getLinkPath(DEFAULT_DESTINATION);
  return `${affiliateOrigin("fr")}${path.startsWith("/") ? "" : "/"}${path}`;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await ctx.params;

  const lien = await resolveShortCode(code).catch(() => null);
  if (!lien) {
    // Code inconnu ou expiré : le visiteur va quand même sur la page de
    // vente. Une 404 punirait quelqu'un qui a simplement cliqué.
    return NextResponse.redirect(await pageDeVente(), { status: 302 });
  }

  const { data } = await supabaseAdmin
    .from("affiliates")
    .select("sa, ref, locale, status")
    .eq("sa", lien.sa)
    .maybeSingle();
  const affilie = data as { sa: string; ref: string | null; locale: string | null; status: string } | null;

  if (!affilie || affilie.status !== "active") {
    const path = await getLinkPath(lien.destination as never);
    const nu = `${affiliateOrigin(affilie?.locale ?? "fr")}${path.startsWith("/") ? "" : "/"}${path}`;
    return NextResponse.redirect(nu, { status: 302 });
  }

  const resolu = {
    sa: affilie.sa,
    ref: affilie.ref ?? "",
    locale: affilie.locale ?? "fr",
    attributable: true,
  };
  const cible = await destinationUrl(lien.destination, resolu);

  await recordClick({
    sa: resolu.sa,
    ref: resolu.ref,
    destination: lien.destination,
    channel: lien.channel,
    linkId: lien.id,
    pageUrl: cible,
    referrer: req.headers.get("referer"),
    userAgent: req.headers.get("user-agent"),
    ip: clientIpFrom(req.headers),
  });

  const reponse = NextResponse.redirect(cible, { status: 302 });
  reponse.headers.append(
    "Set-Cookie",
    visitCookieHeader({ ref: resolu.ref, channel: lien.channel, linkId: lien.id }),
  );
  reponse.headers.set("Cache-Control", "no-store, max-age=0");
  return reponse;
}
