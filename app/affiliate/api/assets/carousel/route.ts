// app/affiliate/api/assets/carousel/route.ts
//
// Télécharge toutes les slides d'un carrousel en un seul .zip. Sans ça,
// l'affilié devrait enregistrer les images une par une (jusqu'à 7 clics
// droits pour un post).
//
// Sécurité : on ne sert QUE les fichiers déclarés dans le kit affilié
// (ATELIER_POSTS_FR), jamais un chemin arbitraire venu de la query.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { zipStore } from "@/lib/affiliate/zipStore";
import { ATELIER_POSTS_FR } from "@/app/affiliate/promouvoir/content/atelier-posts-fr";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getAffiliateSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const id = new URL(req.url).searchParams.get("post") ?? "";
  const post = ATELIER_POSTS_FR.find((p) => p.id === id);
  if (!post || post.visual.kind !== "carousel") {
    return NextResponse.json(
      { ok: false, reason: "unknown_carousel" },
      { status: 404 },
    );
  }

  try {
    const entries = await Promise.all(
      post.visual.slides.map(async (slide, i) => ({
        name: `${post.id}-slide-${String(i + 1).padStart(2, "0")}.png`,
        data: new Uint8Array(
          await readFile(path.join(process.cwd(), "public", slide)),
        ),
      })),
    );
    const zip = zipStore(entries);
    return new NextResponse(zip as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${post.id}-images.zip"`,
        "Content-Length": String(zip.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[affiliate/assets/carousel] lecture impossible", err);
    return NextResponse.json(
      { ok: false, reason: "read_failed" },
      { status: 500 },
    );
  }
}
