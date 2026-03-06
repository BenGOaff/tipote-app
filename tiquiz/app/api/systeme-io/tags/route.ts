// app/api/systeme-io/tags/route.ts
// Fetch user's Systeme.io tags

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const SIO_BASE = "https://api.systeme.io/api";

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("sio_user_api_key")
      .eq("id", user.id)
      .maybeSingle();

    const apiKey = String((profile as any)?.sio_user_api_key ?? "").trim();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "NO_API_KEY" }, { status: 400 });
    }

    const res = await fetch(`${SIO_BASE}/tags?limit=100`, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Systeme.io error ${res.status}` }, { status: 400 });
    }

    const data = await res.json();
    const tags = Array.isArray(data?.items) ? data.items.map((t: any) => ({ id: t.id, name: t.name })) : [];

    return NextResponse.json({ ok: true, tags });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
