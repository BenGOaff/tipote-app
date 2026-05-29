// Proxy de recherche GIF — KLIPY (https://docs.klipy.com/gifs-api).
// Tenor ferme son API (plus de nouveaux clients depuis janv. 2026) et Giphy est
// passé payant : KLIPY est l'alternative gratuite à vie retenue.
//
// On NE met JAMAIS la clé côté client :
//   - clé lue uniquement ici (server) via process.env.KLIPY_API_KEY ;
//   - auth requise pour éviter qu'un anonyme crame le quota (clé test = 100 req/h) ;
//   - si la clé n'est pas configurée → 503 { ok:false, reason:"not_configured" }
//     pour que l'UI affiche un message propre au lieu de planter.
//
// Endpoints (clé dans le PATH) :
//   GET https://api.klipy.com/api/v1/{KEY}/gifs/search?q=&page=&per_page=&locale=&content_filter=&format_filter=
//   GET https://api.klipy.com/api/v1/{KEY}/gifs/trending?page=&per_page=&locale=&...
// Wrapper réponse : { result:true, data:{ data:[ item… ], current_page, per_page, has_next } }
//
// La structure exacte d'un item n'est pas figée par la doc publique (objet `file`
// avec variantes hd/md/sm/xs × formats gif/webp/mp4…). On parse donc en
// PROFONDEUR : on scanne l'item pour la 1re URL `.gif`, en s'aidant des noms de
// clés ancêtres (hd/md/sm/xs) pour distinguer image finale vs vignette. Robuste
// quelle que soit la forme réelle (file/files, leaf objet {url} ou string, item plat).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const SIZE_RANK: Record<string, number> = { hd: 4, md: 3, sm: 2, xs: 1 };

type GifHit = { url: string; sizeRank: number };

// Une URL est un GIF si elle pointe un .gif (avec query éventuelle) — on évite
// ainsi de capter par erreur un .mp4/.webp/.jpg du même item.
function isGifUrl(s: string): boolean {
  return /^https?:\/\/\S+\.gif(\?|#|$)/i.test(s);
}

/** Scan récursif : collecte toutes les URLs .gif de l'item avec un indice de
 *  taille (déduit du nom de clé ancêtre le plus proche : hd/md/sm/xs). */
function collectGifs(node: unknown, inheritedRank: number, out: GifHit[]): void {
  if (!node) return;
  if (typeof node === "string") {
    if (isGifUrl(node)) out.push({ url: node, sizeRank: inheritedRank });
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) collectGifs(v, inheritedRank, out);
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const rank = SIZE_RANK[k.toLowerCase()] ?? inheritedRank;
      collectGifs(v, rank, out);
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const key = process.env.KLIPY_API_KEY;
    if (!key) {
      // Soft fail explicite : l'UI propose alors l'upload/IA en attendant la clé.
      return NextResponse.json(
        { ok: false, reason: "not_configured" },
        { status: 503 },
      );
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().slice(0, 100);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const perPage = Math.min(50, Math.max(8, Number(searchParams.get("limit")) || 24));
    const locale = (searchParams.get("locale") || "fr_FR").slice(0, 8);

    const base = `https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs`;
    const url = new URL(q ? `${base}/search` : `${base}/trending`);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("locale", locale);
    if (q) url.searchParams.set("q", q);
    // Filtre de contenu optionnel : valeurs non documentées publiquement, donc
    // surchargeable via env (ex. "high"/"medium"). Absent → défaut KLIPY.
    if (process.env.KLIPY_CONTENT_FILTER) {
      url.searchParams.set("content_filter", process.env.KLIPY_CONTENT_FILTER);
    }

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, reason: "upstream", status: res.status },
        { status: 502 },
      );
    }
    const body = (await res.json()) as {
      data?: { data?: unknown[]; has_next?: boolean } | unknown[];
    };
    // Tolère data.data[] (forme officielle) ou data[] direct.
    const inner = body?.data;
    const items: unknown[] = Array.isArray(inner)
      ? inner
      : Array.isArray(inner?.data)
        ? (inner!.data as unknown[])
        : [];

    const gifs = items.flatMap((it, i) => {
      const hits: GifHit[] = [];
      collectGifs(it, 0, hits);
      if (hits.length === 0) return []; // item sans gif (ex. encart pub) → ignoré
      // Image finale = plus grande taille ; vignette = plus petite.
      const full = hits.reduce((a, b) => (b.sizeRank > a.sizeRank ? b : a));
      const preview = hits.reduce((a, b) => (b.sizeRank < a.sizeRank ? b : a));
      const obj = (it && typeof it === "object" ? (it as Record<string, unknown>) : {});
      const id = obj.id ?? obj.slug ?? `${page}-${i}`;
      const description = typeof obj.title === "string" ? obj.title : "";
      return [{ id: String(id), url: full.url, preview: preview.url, description }];
    });

    const hasNext = Array.isArray(inner) ? gifs.length >= perPage : Boolean(inner?.has_next);
    return NextResponse.json({
      ok: true,
      gifs,
      hasNext,
      nextPage: hasNext ? page + 1 : null,
    });
  } catch {
    return NextResponse.json({ ok: false, reason: "error" }, { status: 500 });
  }
}
