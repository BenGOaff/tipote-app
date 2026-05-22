// app/favicon.ico/route.ts
//
// Route handler dynamique qui sert le favicon adapté au Host de la requête.
// Indispensable parce que :
//   - Sur un domaine custom, on doit servir le favicon de l'user, pas
//     celui de Tipote par défaut.
//   - L'approche metadata + <link rel="icon"> ne suffit pas : Firefox a
//     un algorithme d'élection différent de Chrome (priorité aux <link>
//     avec attribut `sizes` explicite), et les caches favicons des
//     navigateurs sont agressifs.
//   - En servant directement à l'URL `/favicon.ico` selon le Host, on
//     contourne toute la mécanique d'élection. Quel que soit le `<link>`
//     que Firefox/Chrome choisit, ils finissent toujours par fetch
//     `/favicon.ico` (fallback automatique) → notre handler retourne le
//     bon fichier.
//
// Sécurité : le handler vérifie que le domaine custom est `verified` avant
// de servir son favicon. Un domaine non-vérifié tombe sur le favicon
// Tipote par défaut.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isOwnHost, normaliseHost } from "@/lib/customDomains";

export const runtime = "nodejs";
// `force-dynamic` parce que le résultat dépend du Host de la requête.
export const dynamic = "force-dynamic";

const CACHE_HEADER = "public, max-age=300, s-maxage=300";

async function readDefaultFavicon(): Promise<{ buf: Buffer; contentType: string }> {
  // Tipote a public/favicon.png (pas de .ico). Ça marche : Chrome/Firefox
  // acceptent un PNG renvoyé pour /favicon.ico.
  const buf = await readFile(join(process.cwd(), "public", "favicon.png"));
  return { buf, contentType: "image/png" };
}

export async function GET(): Promise<NextResponse> {
  const h = await headers();
  const host = normaliseHost(h.get("x-forwarded-host") ?? h.get("host"));

  if (!host || isOwnHost(host)) {
    const { buf, contentType } = await readDefaultFavicon();
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": CACHE_HEADER,
      },
    });
  }

  const { data } = await supabaseAdmin
    .from("custom_domains")
    .select("favicon_url")
    .ilike("hostname", host)
    .eq("status", "verified")
    .maybeSingle();

  const faviconUrl = (data as { favicon_url?: string | null } | null)?.favicon_url ?? null;

  if (faviconUrl) {
    try {
      const upstream = await fetch(faviconUrl, { cache: "no-store" });
      if (upstream.ok) {
        const buf = await upstream.arrayBuffer();
        const contentType = upstream.headers.get("Content-Type") ?? "image/png";
        return new NextResponse(buf, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": CACHE_HEADER,
          },
        });
      }
    } catch {
      // Réseau down → fallback favicon Tipote.
    }
  }

  const { buf, contentType } = await readDefaultFavicon();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": CACHE_HEADER,
    },
  });
}
