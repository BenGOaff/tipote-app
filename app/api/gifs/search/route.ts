// Proxy de recherche GIF (Tenor). On NE met JAMAIS la clé côté client :
//   - clé lue uniquement ici (server) via process.env.TENOR_API_KEY ;
//   - auth requise pour éviter qu'un anonyme crame le quota ;
//   - si la clé n'est pas configurée → 503 { ok:false, reason:"not_configured" }
//     pour que l'UI affiche un message propre au lieu de planter.
//
// Tenor API v2 : https://developers.google.com/tenor/guides/quickstart
// On demande des formats légers (gif + tinygif) et on renvoie une liste plate
// { id, url, preview, width, height, description } directement consommable.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type TenorMedia = { url?: string; dims?: [number, number] };
type TenorResult = {
  id?: string;
  content_description?: string;
  media_formats?: Record<string, TenorMedia>;
};

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const key = process.env.TENOR_API_KEY;
    if (!key) {
      // Soft fail explicite : l'UI propose alors l'upload/IA en attendant la clé.
      return NextResponse.json(
        { ok: false, reason: "not_configured" },
        { status: 503 },
      );
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().slice(0, 100);
    const pos = (searchParams.get("pos") || "").trim().slice(0, 64);
    const limit = Math.min(40, Math.max(1, Number(searchParams.get("limit")) || 24));
    const locale = (searchParams.get("locale") || "fr_FR").slice(0, 8);

    const endpoint = q
      ? "https://tenor.googleapis.com/v2/search"
      : "https://tenor.googleapis.com/v2/featured";
    const url = new URL(endpoint);
    url.searchParams.set("key", key);
    url.searchParams.set("client_key", "tipote_quiz");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("media_filter", "gif,tinygif");
    url.searchParams.set("contentfilter", "high"); // safe-for-work
    url.searchParams.set("locale", locale);
    if (q) url.searchParams.set("q", q);
    if (pos) url.searchParams.set("pos", pos);

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, reason: "upstream", status: res.status },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { results?: TenorResult[]; next?: string };

    const gifs = (data.results ?? []).flatMap((r) => {
      const full = r.media_formats?.gif;
      const tiny = r.media_formats?.tinygif ?? full;
      if (!full?.url) return [];
      return [{
        id: r.id ?? full.url,
        url: full.url,
        preview: tiny?.url ?? full.url,
        width: full.dims?.[0] ?? null,
        height: full.dims?.[1] ?? null,
        description: r.content_description ?? "",
      }];
    });

    return NextResponse.json({ ok: true, gifs, next: data.next ?? null });
  } catch {
    return NextResponse.json({ ok: false, reason: "error" }, { status: 500 });
  }
}
