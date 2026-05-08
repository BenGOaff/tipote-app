// GET /api/sio/products
//
// List the user's Systeme.io products via their stored API key, so
// the offer settings UI can render a friendly dropdown instead of
// asking them to paste a numeric product ID.
//
// Falls back to an empty list (200 OK) when the user has no API key
// configured — the Settings UI then degrades to a plain text input.
//
// Cached one minute per (user, project) to keep the call cheap when
// the user opens / closes the dropdown several times.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { resolveSioApiKey } from "@/lib/sio/resolveApiKey";
import { sioUserRequest } from "@/lib/sio/userApiClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SioProduct {
  id: string;
  name: string;
  /** Most-recent price (cents → euros). Optional — not always set
   *  on lead-magnet products. */
  price?: number;
  currency?: string;
}

export async function GET(_req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const projectId = await getActiveProjectId(supabase, user.id);
  const apiKey = await resolveSioApiKey(supabaseAdmin, user.id, projectId);
  if (!apiKey) {
    return NextResponse.json({ ok: true, products: [], hasKey: false });
  }

  // Pagination Hydra : cap à 5 pages (500 produits) — largement assez
  // pour le solopreneur typique. Gros catalogues : on filtrera plus
  // tard si besoin avec un search input.
  const products: SioProduct[] = [];
  let nextPath: string | null = "/products?itemsPerPage=100";
  let safety = 5;
  while (nextPath && safety-- > 0) {
    const path: string = nextPath;
    const res = await sioUserRequest<Record<string, unknown>>(apiKey, path);
    if (!res.ok || !res.data) break;
    const data = res.data as any;
    const items: any[] = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];
    for (const item of items) {
      if (!item?.id) continue;
      const priceCents =
        typeof item?.priceInCents === "number"
          ? item.priceInCents
          : typeof item?.price === "number"
            ? item.price * 100
            : null;
      products.push({
        id: String(item.id),
        name: typeof item?.name === "string" ? item.name : `#${item.id}`,
        price:
          priceCents !== null && Number.isFinite(priceCents)
            ? priceCents / 100
            : undefined,
        currency:
          typeof item?.currency === "string" ? item.currency : undefined,
      });
    }
    const view = (data?.["hydra:view"] ?? null) as
      | { "hydra:next"?: string }
      | null;
    nextPath =
      typeof view?.["hydra:next"] === "string"
        ? view["hydra:next"].replace(/^\/api/, "")
        : null;
  }

  // Sort by name for a stable dropdown order.
  products.sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return NextResponse.json(
    { ok: true, products, hasKey: true },
    {
      // Cache one minute per user (Vercel + browser). The Settings UI
      // calls this on dropdown open ; users editing offers in
      // sequence won't re-hit SIO every click.
      headers: { "Cache-Control": "private, max-age=60" },
    },
  );
}
