// Proxy de recherche GIF — KLIPY (https://klipy.com/developers).
// Tenor ferme son API (plus de nouveaux clients depuis janv. 2026) et Giphy est
// passé payant : KLIPY est l'alternative gratuite à vie retenue.
//
// On NE met JAMAIS la clé côté client :
//   - clé lue uniquement ici (server) via process.env.KLIPY_API_KEY ;
//   - auth requise pour éviter qu'un anonyme crame le quota ;
//   - si la clé n'est pas configurée → 503 { ok:false, reason:"not_configured" }
//     pour que l'UI affiche un message propre au lieu de planter.
//
// KLIPY : GET https://api.klipy.com/api/v1/{API_KEY}/gifs/search?q=&per_page=&page=
//         GET https://api.klipy.com/api/v1/{API_KEY}/gifs/trending
// Réponse : { result:true, data:{ data:[ item… ], has_next, current_page } }
// Chaque item expose un objet `file` avec des variantes de taille (hd/md/sm/xs),
// chacune contenant des formats (gif/webp/mp4) → { url, width, height }. La doc
// publique ne fige pas les clés, donc on parse DÉFENSIVEMENT.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type SizeVariant = Record<string, { url?: string; width?: number; height?: number } | undefined>;
type KlipyItem = {
  id?: string | number;
  slug?: string;
  title?: string;
  file?: Record<string, SizeVariant | undefined>;
};

// Ordre de préférence des tailles : grande pour l'usage final, petite pour la
// vignette. On retombe sur n'importe quelle taille présente.
const FULL_ORDER = ["hd", "md", "sm", "xs"];
const PREVIEW_ORDER = ["sm", "xs", "md", "hd"];

/** Renvoie la 1re { url,width,height } de format gif trouvée selon l'ordre donné. */
function pickGif(file: KlipyItem["file"], order: string[]) {
  if (!file) return null;
  const sizes = [...order, ...Object.keys(file)]; // ordre voulu puis le reste
  for (const size of sizes) {
    const variant = file[size];
    const gif = variant?.gif;
    if (gif?.url) return { url: gif.url, width: gif.width ?? null, height: gif.height ?? null };
  }
  return null;
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
    url.searchParams.set("rating", "g"); // safe-for-work
    if (q) url.searchParams.set("q", q);

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, reason: "upstream", status: res.status },
        { status: 502 },
      );
    }
    const body = (await res.json()) as { data?: { data?: KlipyItem[]; has_next?: boolean } };
    const items = body?.data?.data ?? [];

    const gifs = items.flatMap((it) => {
      const full = pickGif(it.file, FULL_ORDER);
      if (!full) return [];
      const preview = pickGif(it.file, PREVIEW_ORDER) ?? full;
      return [{
        id: String(it.id ?? it.slug ?? full.url),
        url: full.url,
        preview: preview.url,
        width: full.width,
        height: full.height,
        description: it.title ?? "",
      }];
    });

    return NextResponse.json({
      ok: true,
      gifs,
      hasNext: Boolean(body?.data?.has_next),
      nextPage: body?.data?.has_next ? page + 1 : null,
    });
  } catch {
    return NextResponse.json({ ok: false, reason: "error" }, { status: 500 });
  }
}
