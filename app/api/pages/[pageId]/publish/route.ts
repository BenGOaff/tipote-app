// app/api/pages/[pageId]/publish/route.ts
// Publishes or unpublishes a hosted page.
// On publish: re-renders html_snapshot from the latest content_data/brand_tokens
// to guarantee the public page always reflects the most recent edits.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { buildPage } from "@/lib/pageBuilder";
import { buildLinkinbioPage, type LinkinbioPageData } from "@/lib/linkinbioBuilder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ pageId: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { pageId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  const newStatus = body?.publish === false ? "draft" : "published";

  // When publishing, re-render html_snapshot from the latest content to ensure freshness
  const updates: Record<string, any> = { status: newStatus };

  if (newStatus === "published") {
    const { data: current } = await supabase
      .from("hosted_pages")
      .select("title, page_type, template_kind, template_id, content_data, brand_tokens, meta_title, meta_description, og_image_url, capture_heading, capture_subtitle, capture_first_name, locale")
      .eq("id", pageId)
      .eq("user_id", session.user.id)
      .single();

    if (current) {
      try {
        if ((current as any).page_type === "linkinbio") {
          // Fetch links and profile for linkinbio rebuild
          const [linksRes, profileRes] = await Promise.all([
            supabase
              .from("linkinbio_links")
              .select("*")
              .eq("page_id", pageId)
              .order("sort_order"),
            supabase
              .from("business_profiles")
              .select("brand_author_photo_url, brand_logo_url")
              .eq("user_id", session.user.id)
              .maybeSingle(),
          ]);
          const links = linksRes.data || [];
          const prof = profileRes.data as any;
          const cd = current.content_data as any || {};
          const bt = current.brand_tokens as any || {};

          const pageData: LinkinbioPageData = {
            pageId,
            bio: cd.bio || "",
            displayName: (current as any).title || "",
            avatarUrl: prof?.brand_author_photo_url || undefined,
            logoUrl: prof?.brand_logo_url || undefined,
            links: links.map((l: any) => ({
              id: l.id,
              block_type: l.block_type,
              title: l.title,
              url: l.url,
              icon_url: l.icon_url,
              social_links: l.social_links,
              enabled: l.enabled,
              sort_order: l.sort_order,
            })),
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
            contentData: current.content_data || {},
            brandTokens: Object.keys(current.brand_tokens || {}).length > 0 ? current.brand_tokens : null,
            locale: (current as any).locale || "fr",
          });
          updates.html_snapshot = html;
        }
      } catch { /* keep existing snapshot */ }
    }
  }

  const { data, error } = await supabase
    .from("hosted_pages")
    .update(updates)
    .eq("id", pageId)
    .eq("user_id", session.user.id)
    .select("id, slug, status")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Page introuvable" }, { status: error ? 500 : 404 });
  }

  return NextResponse.json({ ok: true, page: data });
}
