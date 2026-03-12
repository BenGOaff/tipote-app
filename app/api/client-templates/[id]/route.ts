// PATCH  /api/client-templates/[id] — update template name/description/items
// DELETE /api/client-templates/[id] — delete template

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Update template fields
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.color !== undefined) updates.color = body.color;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("client_templates")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Replace items if provided
  if (Array.isArray(body.items)) {
    // Delete existing items
    await supabase.from("client_template_items").delete().eq("template_id", id);

    // Insert new items
    const rows = body.items
      .filter((title: string) => typeof title === "string" && title.trim())
      .map((title: string, i: number) => ({
        template_id: id,
        title: title.trim(),
        position: i,
      }));

    if (rows.length > 0) {
      await supabase.from("client_template_items").insert(rows);
    }
  }

  // Re-fetch
  const { data: full } = await supabase
    .from("client_templates")
    .select("*, client_template_items(*)")
    .eq("id", id)
    .single();

  return NextResponse.json({ ok: true, template: full });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("client_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
