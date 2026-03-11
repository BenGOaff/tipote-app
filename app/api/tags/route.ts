// app/api/tags/route.ts
// GET / POST tags utilisateur
// Auth + user_id scoped

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type TagRow = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
};

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("task_tags")
      .select("id, name, color, created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, tags: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown = null;
    try { body = await request.json(); } catch { body = null; }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const { name, color } = body as Record<string, unknown>;

    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }

    const safeColor = typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#6366f1";

    const { data, error } = await supabaseAdmin
      .from("task_tags")
      .insert({
        user_id: auth.user.id,
        name: trimmedName.slice(0, 50),
        color: safeColor,
      })
      .select("id, name, color, created_at")
      .single<TagRow>();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, tag: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
