// GET    /api/widgets/share/[widgetId] — Get widget details (owner)
// PATCH  /api/widgets/share/[widgetId] — Update widget config (owner)
// DELETE /api/widgets/share/[widgetId] — Delete widget (owner)

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Ctx = { params: Promise<{ widgetId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { widgetId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("social_share_widgets")
    .select("*")
    .eq("id", widgetId)
    .eq("user_id", session.user.id)
    .single();

  if (error || !data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, widget: data });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { widgetId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const allowed = [
    "name", "enabled", "platforms", "display_mode", "button_style",
    "button_size", "show_labels", "show_counts", "share_url", "share_text",
    "share_hashtags", "color_mode", "custom_color",
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("social_share_widgets")
    .update(updates)
    .eq("id", widgetId)
    .eq("user_id", session.user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, widget: data });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { widgetId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("social_share_widgets")
    .delete()
    .eq("id", widgetId)
    .eq("user_id", session.user.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
