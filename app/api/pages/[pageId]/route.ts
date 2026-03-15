// app/api/pages/[pageId]/route.ts
// GET: fetch single page (owner only)
// PATCH: update page fields (content_data, brand_tokens, slug, status, etc.)
// DELETE: archive page

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { buildPage } from "@/lib/pageBuilder";
import { buildLinkinbioPage, type LinkinbioPageData } from "@/lib/linkinbioBuilder";
import { sanitizeHtmlSnapshot } from "@/lib/sanitizeHtml";

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
    "template_id",
    "custom_images", "video_embed_url", "payment_url", "payment_button_text",
    "meta_title", "meta_description", "og_image_url",
    "legal_mentions_url", "legal_cgv_url", "legal_privacy_url",
    "capture_enabled", "capture_heading", "capture_subtitle", "capture_first_name", "sio_capture_tag",
    "thank_you_title", "thank_you_message", "thank_you_cta_text", "thank_you_cta_url",
    "facebook_pixel_id", "google_tag_id",
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
      .select("title, page_type, template_kind, template_id, content_data, brand_tokens, capture_heading, capture_subtitle, capture_first_name, meta_title, meta_description, og_image_url, locale")
      .eq("id", pageId)
      .eq("user_id", session.user.id)
      .single();

    if (current) {
      const contentData = updates.content_data || current.content_data;
      const brandTokens = updates.brand_tokens || current.brand_tokens;

      try {
        if ((current as any).page_type === "linkinbio") {
          // Rebuild linkinbio HTML
          const [linksRes, profileRes] = await Promise.all([
            supabase.from("linkinbio_links").select("*").eq("page_id", pageId).order("sort_order"),
            supabase.from("business_profiles").select("brand_author_photo_url, brand_logo_url").eq("user_id", session.user.id).maybeSingle(),
          ]);
          const links = linksRes.data || [];
          const prof = profileRes.data as any;
          const cd = contentData || {};
          const bt = brandTokens || {};
          const pageData: LinkinbioPageData = {
            pageId,
            bio: cd.bio || "",
            displayName: (current as any).title || "",
            avatarUrl: prof?.brand_author_photo_url || undefined,
            logoUrl: prof?.brand_logo_url || undefined,
            links: links.map((l: any) => ({ id: l.id, block_type: l.block_type, title: l.title, url: l.url, icon_url: l.icon_url, social_links: l.social_links, enabled: l.enabled, sort_order: l.sort_order })),
            theme: cd.theme || "minimal",
            buttonStyle: cd.buttonStyle || "rounded",
            backgroundType: cd.backgroundType,
            backgroundValue: cd.backgroundValue,
            brandColor: bt["colors-primary"] || undefined,
            brandAccent: bt["colors-accent"] || undefined,
            brandFont: bt["typography-heading"] || undefined,
            captureHeading: (current as any).capture_heading || undefined,
            captureSubtitle: (current as any).capture_subtitle || undefined,
            captureFirstName: (current as any).capture_first_name,
            metaTitle: (current as any).meta_title || undefined,
            metaDescription: (current as any).meta_description || undefined,
            ogImageUrl: (current as any).og_image_url || undefined,
            locale: (current as any).locale || "fr",
          };
          updates.html_snapshot = buildLinkinbioPage(pageData);
        } else {
          const pageType = current.template_kind === "vente" ? "sales" : current.template_kind === "vitrine" ? "showcase" : "capture";
          const html = buildPage({
            pageType,
            contentData,
            brandTokens: Object.keys(brandTokens || {}).length > 0 ? brandTokens : null,
            locale: (current as any).locale || "fr",
          });
          updates.html_snapshot = html;
        }
      } catch { /* keep existing snapshot */ }
    }
  }

  // Always sanitize html_snapshot to strip editor artifacts (defense-in-depth)
  if (typeof updates.html_snapshot === "string" && updates.html_snapshot) {
    updates.html_snapshot = sanitizeHtmlSnapshot(updates.html_snapshot);
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
