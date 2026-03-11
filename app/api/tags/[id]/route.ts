// app/api/tags/[id]/route.ts
// PATCH / DELETE a single tag

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    let body: unknown = null;
    try { body = await request.json(); } catch { body = null; }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const rec = body as Record<string, unknown>;
    const update: Record<string, string> = {};

    if ("name" in rec) {
      const n = typeof rec.name === "string" ? rec.name.trim() : "";
      if (!n) return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
      update.name = n.slice(0, 50);
    }
    if ("color" in rec) {
      const c = typeof rec.color === "string" && /^#[0-9a-fA-F]{6}$/.test(rec.color) ? rec.color : null;
      if (!c) return NextResponse.json({ ok: false, error: "Invalid color (hex)" }, { status: 400 });
      update.color = c;
    }

    if (!Object.keys(update).length) {
      return NextResponse.json({ ok: false, error: "No fields" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("task_tags")
      .update(update)
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .select("id, name, color, created_at")
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, error: "Tag not found" }, { status: 404 });

    return NextResponse.json({ ok: true, tag: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { error } = await supabaseAdmin
      .from("task_tags")
      .delete()
      .eq("id", id)
      .eq("user_id", auth.user.id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
