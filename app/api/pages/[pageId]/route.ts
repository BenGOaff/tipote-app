// app/api/pages/[pageId]/route.ts
// GET: fetch single page (owner only)
// PATCH: update page fields (content_data, brand_tokens, slug, status, etc.)
// DELETE: archive page

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { renderTemplateHtml } from "@/lib/templates/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ pageId: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { pageId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("hosted_pages")
    .select("*")
    .eq("id", pageId)
    .eq("user_id", session.user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Page introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, page: data });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { pageId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, any>;
  try { body = await req.json(); } catch { body = {}; }

  // Allowed fields to update
  const allowed = [
    "title", "slug", "status", "content_data", "brand_tokens",
    "custom_images", "video_embed_url", "payment_url", "payment_button_text",
    "meta_title", "meta_description", "og_image_url",
    "legal_mentions_url", "legal_cgv_url", "legal_privacy_url",
    "capture_enabled", "capture_heading", "capture_subtitle", "capture_first_name", "sio_capture_tag",
    "iteration_count", "locale", "html_snapshot",
  ];

  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  // If content_data or brand_tokens changed, re-render HTML snapshot
  if (updates.content_data || updates.brand_tokens) {
    // Fetch current page to get template info
    const { data: current } = await supabase
      .from("hosted_pages")
      .select("template_kind, template_id, content_data, brand_tokens")
      .eq("id", pageId)
      .eq("user_id", session.user.id)
      .single();

    if (current) {
      const contentData = updates.content_data || current.content_data;
      const brandTokens = updates.brand_tokens || current.brand_tokens;

      try {
        const { html } = await renderTemplateHtml({
          kind: current.template_kind as any,
          templateId: current.template_id,
          mode: "preview",
          contentData,
          brandTokens: Object.keys(brandTokens || {}).length > 0 ? brandTokens : null,
        });
        updates.html_snapshot = html;
      } catch { /* keep existing snapshot */ }
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("hosted_pages")
    .update(updates)
    .eq("id", pageId)
    .eq("user_id", session.user.id)
    .select("id, slug, status, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, page: data });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { pageId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("hosted_pages")
    .update({ status: "archived" })
    .eq("id", pageId)
    .eq("user_id", session.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
