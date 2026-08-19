// app/apercu/vente/[slug]/route.ts
//
// L'APERÇU DES PAGES DE VENTE, FERMÉ PAR DÉFAUT.
//
// Béné, 19 août : "je te propose de me designer les pages de ventes et
// de m'envoyer un lien ici pour que je valide le pixel perfect avant
// d'envoyer quoi que ce soit en ligne."
//
// Une page de vente n'a pas de session : le visiteur est anonyme. La
// porte ne peut donc pas être la liste d'emails du reste du chantier,
// c'est une CLÉ dans l'URL (`?k=...`), comparée à `SALES_PREVIEW_TOKEN`.
//
// Même règle que partout ailleurs : **l'absence de configuration FERME.**
// Pas de variable, variable vide, clé absente ou fausse -> 404. Un `.env`
// oublié ne peut pas publier une page en chantier.
//
// Et 404, jamais 403 : un refus explicite annoncerait qu'il y a quelque
// chose derrière.

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { renderSalesPage, type SalesPageMeta } from "@/lib/sales/servePage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le référencement de chaque page, écrit par nous.
 *
 * Il vit ICI et pas dans le HTML capturé : le HTML sera remplacé à
 * chaque nouvelle capture, alors que ces textes sont des décisions.
 */
const PAGES: Record<string, Omit<SalesPageMeta, "slug">> = {
  "atelier-du-quiz": {
    canonical: "https://www.tipote.fr/atelier-du-quiz",
    title: "L'Atelier du Quiz : lance ton quiz marketing en 7 jours",
    description:
      "La méthode complète pour créer un quiz qui capture des leads qualifiés et les transforme en clients, en 7 jours, sans compétence technique.",
    locale: "fr_FR",
  },
};

/** Comparaison à durée constante : une clé ne se devine pas à la montre. */
function memeCle(recue: string, attendue: string): boolean {
  const a = Buffer.from(recue);
  const b = Buffer.from(attendue);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function porteOuverte(req: NextRequest): boolean {
  const attendue = (process.env.SALES_PREVIEW_TOKEN ?? "").trim();
  // Absence de configuration = fermé. Jamais l'inverse.
  if (attendue.length < 16) return false;
  const recue = (req.nextUrl.searchParams.get("k") ?? "").trim();
  if (!recue) return false;
  return memeCle(recue, attendue);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await ctx.params;

  if (!porteOuverte(req)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const meta = PAGES[slug];
  if (!meta || !/^[a-z0-9-]+$/.test(slug)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const fichier = path.join(process.cwd(), "content", "sales", `${slug}.html`);
  if (!fs.existsSync(fichier)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const html = renderSalesPage(fs.readFileSync(fichier, "utf8"), { slug, ...meta }, {
    // En aperçu, JAMAIS indexable : une page de test qui remonte dans
    // Google ferait doublon avec l'originale et abîmerait les deux.
    indexable: false,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
