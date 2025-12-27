// app/api/content/[id]/duplicate/route.ts
// Duplique un content_item (POST)
// Compat DB: certaines instances ont encore les colonnes FR (titre/contenu/statut/canal/date_planifiee, tags en text)
// -> on tente d'abord la "v2" (title/content/status/channel/scheduled_date + tags array), sinon fallback FR.

import { NextRequest, NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/supabaseServer";

type ContentRowV2 = {
  id: string;
  user_id: string;
  type: string | null;
  title: string | null;
  prompt: string | null;
  content: string | null;
  status: string | null;
  scheduled_date: string | null;
  channel: string | null;
  tags: string[] | string | null;
};

function isMissingColumnError(message: string | null | undefined) {
  const m = (message ?? "").toLowerCase();
  return m.includes("column") && (m.includes("does not exist") || m.includes("unknown"));
}

function asTagsArray(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.filter((x) => typeof x === "string") as string[];
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return [];
    // tags en text : "a,b,c" ou JSON "[]"
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string") as string[];
    } catch {
      // ignore
    }
    return t
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  return null;
}

function withCopySuffix(title: string | null): string {
  const base = (title ?? "Sans titre").trim() || "Sans titre";
  // éviter 10x "(copie)" spam
  if (/\(copie\)\s*$/i.test(base)) return `${base} 2`;
  return `${base} (copie)`;
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const contentId = (id ?? "").trim();

    if (!contentId) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) {
      return NextResponse.json({ ok: false, error: userErr.message }, { status: 401 });
    }
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // 1) Lire la ligne (V2)
    const v2 = await supabase
      .from("content_item")
      .select("id,user_id,type,title,prompt,content,status,scheduled_date,channel,tags")
      .eq("id", contentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!v2.error) {
      const row = v2.data as ContentRowV2 | null;
      if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

      const insertV2 = await supabase
        .from("content_item")
        .insert({
          user_id: userId,
          type: row.type ?? null,
          title: withCopySuffix(row.title ?? null),
          prompt: row.prompt ?? null,
          content: row.content ?? null,
          status: "draft",
          scheduled_date: null,
          channel: row.channel ?? null,
          tags: asTagsArray(row.tags) ?? [],
        })
        .select("id")
        .single();

      if (insertV2.error) {
        return NextResponse.json({ ok: false, error: insertV2.error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true, id: insertV2.data?.id ?? null }, { status: 200 });
    }

    // erreur autre que colonne manquante
    if (!isMissingColumnError((v2.error as PostgrestError | null)?.message)) {
      return NextResponse.json({ ok: false, error: v2.error.message }, { status: 400 });
    }

    // 2) Fallback FR : lire via alias
    const fr = await supabase
      .from("content_item")
      .select(
        "id,user_id,type,title:titre,prompt,content:contenu,status:statut,scheduled_date:date_planifiee,channel:canal,tags"
      )
      .eq("id", contentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (fr.error) {
      return NextResponse.json({ ok: false, error: fr.error.message }, { status: 400 });
    }

    const row = fr.data as any | null;
    if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    // Insert FR : on écrit dans les vraies colonnes FR
    // (pas d'alias en INSERT)
    const frTags = asTagsArray(row.tags);
    const tagsAsText = Array.isArray(frTags) ? JSON.stringify(frTags) : "";

    const insertFR = await supabase
      .from("content_item")
      .insert({
        user_id: userId,
        type: row.type ?? null,
        titre: withCopySuffix(row.title ?? null),
        prompt: row.prompt ?? null,
        contenu: row.content ?? null,
        statut: "draft",
        date_planifiee: null,
        canal: row.channel ?? null,
        // tags legacy souvent en text
        tags: tagsAsText,
      } as any)
      .select("id")
      .single();

    if (insertFR.error) {
      return NextResponse.json({ ok: false, error: insertFR.error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: insertFR.data?.id ?? null }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// (Optionnel) autres méthodes non supportées sur cette route
export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
export async function PATCH() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
