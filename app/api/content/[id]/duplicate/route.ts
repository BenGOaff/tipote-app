// app/api/content/[id]/duplicate/route.ts
// Duplique un content_item (POST)
//
// NOTE DB compat: certaines instances ont encore les colonnes FR (titre/contenu/statut/canal/date_planifiee)
// -> on tente d'abord la "v2" (title/content/status/channel/scheduled_date + prompt), sinon fallback FR.

import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/supabaseServer";

type FetchedItem = {
  id: string;
  type: string | null;
  title: string | null;
  prompt: string | null;
  content: string | null;
  status: string | null;
  channel: string | null;
  tags: unknown;
};

type InsertedRow = { id: string };

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isMissingColumnError(message: string | undefined | null) {
  const m = (message ?? "").toLowerCase();
  return m.includes("does not exist") && m.includes("column");
}

function normalizeTags(tags: unknown): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.filter(Boolean).map(String);
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const supabase = await getSupabaseServerClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const params = await Promise.resolve(ctx.params);
    const id = safeString(params?.id).trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    // 1) fetch v2
    const v2 = await supabase
      .from("content_item")
      .select("id, type, title, prompt, content, status, channel, tags")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    let item: FetchedItem | null = null;
    let fetchErr: PostgrestError | null = v2.error ?? null;

    if (!fetchErr && v2.data) {
      const raw = v2.data as unknown as Record<string, unknown>;
      item = {
        id: String(raw["id"] ?? ""),
        type: (raw["type"] as string | null) ?? null,
        title: (raw["title"] as string | null) ?? null,
        prompt: (raw["prompt"] as string | null) ?? null,
        content: (raw["content"] as string | null) ?? null,
        status: (raw["status"] as string | null) ?? null,
        channel: (raw["channel"] as string | null) ?? null,
        tags: raw["tags"],
      };
    }

    // 2) fallback FR
    if (fetchErr && isMissingColumnError(fetchErr.message)) {
      const fb = await supabase
        .from("content_item")
        .select("id, type, title:titre, content:contenu, status:statut, channel:canal, tags")
        .eq("id", id)
        .eq("user_id", auth.user.id)
        .maybeSingle();

      fetchErr = fb.error ?? null;

      if (!fetchErr && fb.data) {
        const raw = fb.data as unknown as Record<string, unknown>;
        item = {
          id: String(raw["id"] ?? ""),
          type: (raw["type"] as string | null) ?? null,
          title: (raw["title"] as string | null) ?? null,
          prompt: null,
          content: (raw["content"] as string | null) ?? null,
          status: (raw["status"] as string | null) ?? null,
          channel: (raw["channel"] as string | null) ?? null,
          tags: raw["tags"],
        };
      }
    }

    if (fetchErr) {
      return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 400 });
    }
    if (!item) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const baseTitle = safeString(item.title).trim();
    const nextTitle = baseTitle ? `${baseTitle} (copie)` : "Copie";

    const tags = normalizeTags(item.tags);

    // 1) insert v2
    const v2Insert = await supabase
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
        tags,
      })
      .select("id")
      .maybeSingle();

    let inserted: InsertedRow | null = v2Insert.data ?? null;
    let insErr: PostgrestError | null = v2Insert.error ?? null;

    // 2) fallback FR insert
    if (insErr && isMissingColumnError(insErr.message)) {
      const fbInsert = await supabase
        .from("content_item")
        .insert({
          user_id: auth.user.id,
          type: item.type,
          titre: nextTitle,
          contenu: item.content,
          statut: "draft",
          canal: item.channel,
          date_planifiee: null,
          tags: tags.join(","),
        })
        .select("id")
        .maybeSingle();

      inserted = fbInsert.data ?? null;
      insErr = fbInsert.error ?? null;
    }

    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: inserted?.id ?? null }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
