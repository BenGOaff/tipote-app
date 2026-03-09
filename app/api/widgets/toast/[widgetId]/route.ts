// GET    /api/widgets/toast/[widgetId] — Get widget details (owner)
// PATCH  /api/widgets/toast/[widgetId] — Update widget config (owner)
// DELETE /api/widgets/toast/[widgetId] — Delete widget (owner)

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Ctx = { params: Promise<{ widgetId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { widgetId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("toast_widgets")
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

  // Whitelist updatable fields
  const allowed = [
    "name", "enabled", "position", "display_duration", "delay_between",
    "max_per_session", "style", "custom_messages",
    "show_recent_signups", "show_recent_purchases", "show_visitor_count",
    "visitor_count_label", "signup_label", "purchase_label", "anonymize_after",
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("toast_widgets")
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
    .from("toast_widgets")
    .delete()
    .eq("id", widgetId)
    .eq("user_id", session.user.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
