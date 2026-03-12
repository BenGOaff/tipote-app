// GET  /api/client-templates — list user's process templates (with items)
// POST /api/client-templates — create a new template (with initial items)

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("client_templates")
    .select("*, client_template_items(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sort items by position within each template
  const templates = (data ?? []).map((t: any) => ({
    ...t,
    items: (t.client_template_items ?? []).sort(
      (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
    ),
  }));

  return NextResponse.json({ ok: true, templates });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Create template
  const { data: template, error: tplError } = await supabase
    .from("client_templates")
    .insert({
      user_id: user.id,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      color: body.color || "#6366f1",
    })
    .select()
    .single();

  if (tplError) return NextResponse.json({ error: tplError.message }, { status: 500 });

  // Create initial items if provided
  const items: string[] = body.items ?? [];
  if (items.length > 0) {
    const rows = items
      .filter((title: string) => typeof title === "string" && title.trim())
      .map((title: string, i: number) => ({
        template_id: template.id,
        title: title.trim(),
        position: i,
      }));

    if (rows.length > 0) {
      await supabase.from("client_template_items").insert(rows);
    }
  }

  // Re-fetch with items
  const { data: full } = await supabase
    .from("client_templates")
    .select("*, client_template_items(*)")
    .eq("id", template.id)
    .single();

  return NextResponse.json({ ok: true, template: full ?? template });
}
