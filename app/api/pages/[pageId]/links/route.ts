// app/api/pages/[pageId]/links/route.ts
// GET: list links for a linkinbio page (owner only)
// POST: add a new link/block
// PATCH: update a link/block (pass linkId in body)
// DELETE: remove a link/block (pass linkId in body)

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

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

  // Verify ownership
  const { data: page } = await supabase
    .from("hosted_pages")
    .select("id")
    .eq("id", pageId)
    .eq("user_id", session.user.id)
    .single();

  if (!page) {
    return NextResponse.json({ error: "Page introuvable" }, { status: 404 });
  }

  const { data: links, error } = await supabase
    .from("linkinbio_links")
    .select("*")
    .eq("page_id", pageId)
    .order("sort_order");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, links: links || [] });
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { pageId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  const blockType = body.block_type || "link";
  if (!["link", "header", "social_icons", "capture_form"].includes(blockType)) {
    return NextResponse.json({ error: "Invalid block_type" }, { status: 400 });
  }

  // Get the max sort_order for this page
  const { data: maxRow } = await supabase
    .from("linkinbio_links")
    .select("sort_order")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = ((maxRow as any)?.sort_order ?? -1) + 1;

  const { data: link, error } = await supabase
    .from("linkinbio_links")
    .insert({
      page_id: pageId,
      user_id: session.user.id,
      block_type: blockType,
      title: body.title || "",
      url: body.url || "",
      icon_url: body.icon_url || "",
      social_links: body.social_links || [],
      enabled: body.enabled !== false,
      sort_order: nextOrder,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, link });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { pageId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  const linkId = body.linkId;
  if (!linkId) {
    return NextResponse.json({ error: "Missing linkId" }, { status: 400 });
  }

  const allowed = ["title", "url", "icon_url", "social_links", "enabled"];
  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data: link, error } = await supabase
    .from("linkinbio_links")
    .update(updates)
    .eq("id", linkId)
    .eq("page_id", pageId)
    .eq("user_id", session.user.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, link });
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { pageId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  const linkId = body.linkId;
  if (!linkId) {
    return NextResponse.json({ error: "Missing linkId" }, { status: 400 });
  }

  const { error } = await supabase
    .from("linkinbio_links")
    .delete()
    .eq("id", linkId)
    .eq("page_id", pageId)
    .eq("user_id", session.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
