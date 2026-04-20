// app/api/pages/[pageId]/publish/route.ts
// Publishes or unpublishes a hosted page.
// On publish: re-renders html_snapshot from the latest content_data/brand_tokens
// to guarantee the public page always reflects the most recent edits.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildPage } from "@/lib/pageBuilder";
import { buildLinkinbioPage, type LinkinbioPageData } from "@/lib/linkinbioBuilder";
import { checkPublishedSlugAvailable } from "@/lib/hostedPageSlug";

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

  // When publishing:
  //  - linkinbio: always rebuild html_snapshot, since the canonical content
  //    lives in the linkinbio_links table and html_snapshot is derived;
  //  - other page types: keep the html_snapshot the editor already wrote.
  //    The editor's inline-text/image/structural edits go straight into
  //    html_snapshot without round-tripping through content_data, so a
  //    rebuild from content_data would silently drop those edits at publish
  //    time (Marie-Paule, 2026-04). We only rebuild as a fallback when no
  //    html_snapshot exists yet.
  const updates: Record<string, any> = { status: newStatus };

  if (newStatus === "published") {
    // Use select("*") so any single missing column doesn't fail the lookup
    // and silently skip the rebuild (which would publish a stale snapshot).
    const { data: current, error: currentErr } = await supabase
      .from("hosted_pages")
      .select("*")
      .eq("id", pageId)
      .eq("user_id", session.user.id)
      .single();

    if (currentErr || !current) {
      console.error("[pages/publish] page lookup failed", { pageId, error: currentErr?.message });
      return NextResponse.json({ error: currentErr?.message || "Page introuvable" }, { status: 404 });
    }

    // Slug-collision guard: another user might have published the same slug
    // since this page was last saved (per-user uniqueness lets that slip
    // through). Refuse before flipping status to published so the public URL
    // doesn't silently route to two different pages depending on created_at.
    const slugForPublish = (current as any).slug as string;
    if (slugForPublish) {
      const slugCheck = await checkPublishedSlugAvailable(supabaseAdmin, slugForPublish, pageId);
      if (slugCheck.conflict) {
        return NextResponse.json(
          { error: `Le slug "${slugForPublish}" est déjà utilisé par une autre page publiée. Renomme cette page avant de publier.` },
          { status: 409 },
        );
      }
    }

    {
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
          const existingHtml = (current as any).html_snapshot;
          const hasExistingHtml = typeof existingHtml === "string" && existingHtml.length > 0;
          if (!hasExistingHtml) {
            const pageType = current.template_kind === "vente" ? "sales" : current.template_kind === "vitrine" ? "showcase" : "capture";
            const html = buildPage({
              pageType,
              contentData: current.content_data || {},
              brandTokens: Object.keys(current.brand_tokens || {}).length > 0 ? current.brand_tokens : null,
              locale: (current as any).locale || "fr",
              layoutConfig: (current as any).layout_config || null,
            });
            updates.html_snapshot = html;
          }
        }
      } catch (err: any) {
        // For linkinbio, the rebuild is not optional: html_snapshot is
        // derived from linkinbio_links which is the canonical source. A
        // failed rebuild = we'd publish whatever stale snapshot was there,
        // possibly the empty initial placeholder. Hard-fail so the user can
        // retry rather than silently going live with broken content.
        if ((current as any).page_type === "linkinbio") {
          console.error("[pages/publish] linkinbio rebuild failed", { pageId, error: err?.message });
          return NextResponse.json(
            { error: `Rebuild de la page link-in-bio échoué : ${err?.message || "erreur inconnue"}. Réessaie ou vérifie tes liens.` },
            { status: 500 },
          );
        }
        // For sales/capture pages we already kept a valid html_snapshot
        // since the editor writes it directly; just log and proceed.
        console.error("[pages/publish] rebuild failed, keeping existing snapshot", {
          pageId,
          pageType: (current as any).page_type,
          error: err?.message,
        });
      }
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
