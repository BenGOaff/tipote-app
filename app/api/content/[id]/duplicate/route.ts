// app/api/content/[id]/duplicate/route.ts
// Duplique un content_item (POST)
// - Copie les champs utiles
// - Force status=draft et scheduled_date=null
// - Titre suffixé "(copie)" si présent

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const params = await Promise.resolve(ctx.params as any);
    const id = safeString(params?.id).trim();

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const { data: item, error: fetchErr } = await supabase
      .from("content_item")
      .select("id, type, title, prompt, content, status, channel, tags")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 400 });
    }
    if (!item) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const baseTitle = safeString(item.title).trim();
    const nextTitle = baseTitle ? `${baseTitle} (copie)` : "Copie";

    const { data: inserted, error: insErr } = await supabase
      .from("content_item")
      .insert({
        user_id: auth.user.id,
        type: item.type,
        title: nextTitle,
        prompt: item.prompt,
        content: item.content,
        status: "draft",
        channel: item.channel,
        scheduled_date: null,
        tags: item.tags ?? [],
      })
      .select("id")
      .maybeSingle();

    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: inserted?.id ?? null }, { status: 200 });
  } catch (e) {
    console.error("[POST /api/content/[id]/duplicate] error", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
