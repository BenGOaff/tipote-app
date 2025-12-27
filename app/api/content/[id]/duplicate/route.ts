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
  return (
    m.includes("does not exist") ||
    m.includes("could not find the '") ||
    (m.includes("column") && m.includes("exist")) ||
    m.includes("schema cache") ||
    m.includes("pgrst")
  );
}

function asTagsArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((x) => typeof x === "string") as string[];
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return [];
    // JSON "[]"
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string") as string[];
    } catch {
      // ignore
    }
    // CSV
    return t
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  return [];
}

function withCopySuffix(title: string | null): string {
  const base = (title ?? "Sans titre").trim() || "Sans titre";
  if (/\(copie\)\s*$/i.test(base)) return `${base} 2`;
  return `${base} (copie)`;
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await ctx.params;
    const id = (rawId ?? "").trim();
    if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const supabase = await getSupabaseServerClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ ok: false, error: authErr.message }, { status: 401 });
    if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;

    // Try V2 (EN columns)
    const v2 = await supabase
      .from("content_item")
      .select("id,user_id,type,title,prompt,content,status,scheduled_date,channel,tags")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!v2.error) {
      const row = (v2.data ?? null) as ContentRowV2 | null;
      if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

      const ins = await supabase
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
          tags: asTagsArray(row.tags),
        })
        .select("id")
        .single();

      if (ins.error) return NextResponse.json({ ok: false, error: ins.error.message }, { status: 400 });

      return NextResponse.json({ ok: true, id: ins.data?.id ?? null }, { status: 200 });
    }

    if (!isMissingColumnError((v2.error as PostgrestError | null)?.message)) {
      return NextResponse.json({ ok: false, error: v2.error.message }, { status: 400 });
    }

    // Fallback FR columns via alias
    const fr = await supabase
      .from("content_item")
      .select(
        "id,user_id,type,title:titre,prompt,content:contenu,status:statut,scheduled_date:date_planifiee,channel:canal,tags"
      )
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (fr.error) return NextResponse.json({ ok: false, error: fr.error.message }, { status: 400 });

    const row = fr.data as any | null;
    if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const tagsArray = asTagsArray(row.tags);
    const tagsAsText = JSON.stringify(tagsArray);

    const insFR = await supabase
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
        tags: tagsAsText,
      } as any)
      .select("id")
      .single();

    if (insFR.error) return NextResponse.json({ ok: false, error: insFR.error.message }, { status: 400 });

    return NextResponse.json({ ok: true, id: insFR.data?.id ?? null }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
export async function PATCH() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
