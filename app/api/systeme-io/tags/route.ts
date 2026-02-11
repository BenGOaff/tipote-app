// app/api/systeme-io/tags/route.ts
// Fetch existing tags from the user's Systeme.io account

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const SIO_BASE = "https://api.systeme.io/api";

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("business_profiles")
      .select("sio_user_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    const apiKey = String(profile?.sio_user_api_key ?? "").trim();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "NO_API_KEY", tags: [] },
        { status: 400 },
      );
    }

    // Fetch all tags (paginate if needed)
    const allTags: { id: number; name: string }[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) {
      const res = await fetch(
        `${SIO_BASE}/tags?limit=100&page=${page}`,
        {
          headers: {
            "X-API-Key": apiKey,
            Accept: "application/json",
          },
        },
      );

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return NextResponse.json(
            { ok: false, error: "INVALID_API_KEY", tags: [] },
            { status: 400 },
          );
        }
        break;
      }

      const json = await res.json();
      const items = Array.isArray(json?.items) ? json.items : [];

      for (const t of items) {
        if (t?.id && t?.name) {
          allTags.push({ id: Number(t.id), name: String(t.name) });
        }
      }

      // Check if there are more pages
      if (items.length < 100) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return NextResponse.json({ ok: true, tags: allTags });
  } catch (e) {
    console.error("[GET /api/systeme-io/tags] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error", tags: [] },
      { status: 500 },
    );
  }
}
