// lib/linkinbioRebuild.ts
// Server-side helper: rebuild html_snapshot for a linkinbio page from the
// current state of linkinbio_links + business_profiles + hosted_pages.
//
// WHY THIS EXISTS
// ---------------
// Without this, any write to linkinbio_links (add / update / delete / reorder)
// leaves hosted_pages.html_snapshot stale until the user manually republishes.
// The editor preview rebuilds locally so the user sees the change, but the
// publicly-served /p/[slug] keeps the OLD HTML — visitors see deleted links,
// miss new ones, or land on the original placeholder snapshot.
//
// USAGE
// -----
// Call after any successful mutation to linkinbio_links. Pass a Supabase
// client that has owner-level access (the route's getSupabaseServerClient is
// fine since we only ever rebuild pages the caller already verified they own).
// We deliberately re-fetch the page row instead of trusting client input.

import { buildLinkinbioPage, type LinkinbioPageData } from "./linkinbioBuilder";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rebuild and persist html_snapshot for a linkinbio page.
 * Returns true if rebuilt, false if the page isn't a linkinbio (no-op).
 * Logs (does not throw) on rebuild failure — callers should not block the
 * primary CRUD response on snapshot rebuild errors.
 */
export async function rebuildLinkinbioSnapshot(
  supabase: SupabaseClient,
  pageId: string,
  userId: string,
): Promise<boolean> {
  try {
    const { data: page, error: pageErr } = await supabase
      .from("hosted_pages")
      .select("id, page_type, title, content_data, brand_tokens, capture_heading, capture_subtitle, capture_first_name, meta_title, meta_description, og_image_url, locale")
      .eq("id", pageId)
      .eq("user_id", userId)
      .single();

    if (pageErr || !page) {
      console.warn("[rebuildLinkinbioSnapshot] page lookup failed", { pageId, error: pageErr?.message });
      return false;
    }

    if ((page as any).page_type !== "linkinbio") {
      return false;
    }

    const [linksRes, profileRes] = await Promise.all([
      supabase.from("linkinbio_links").select("*").eq("page_id", pageId).order("sort_order"),
      supabase.from("business_profiles").select("brand_author_photo_url, brand_logo_url").eq("user_id", userId).maybeSingle(),
    ]);

    const links = linksRes.data || [];
    const prof = profileRes.data as any;
    const cd = ((page as any).content_data as any) || {};
    const bt = ((page as any).brand_tokens as any) || {};

    const pageData: LinkinbioPageData = {
      pageId,
      bio: cd.bio || "",
      displayName: (page as any).title || "",
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
      captureHeading: (page as any).capture_heading || undefined,
      captureSubtitle: (page as any).capture_subtitle || undefined,
      captureFirstName: (page as any).capture_first_name,
      metaTitle: (page as any).meta_title || undefined,
      metaDescription: (page as any).meta_description || undefined,
      ogImageUrl: (page as any).og_image_url || undefined,
      locale: (page as any).locale || "fr",
    };

    const html = buildLinkinbioPage(pageData);

    const { error: updErr } = await supabase
      .from("hosted_pages")
      .update({ html_snapshot: html })
      .eq("id", pageId)
      .eq("user_id", userId);

    if (updErr) {
      console.error("[rebuildLinkinbioSnapshot] persist failed", { pageId, error: updErr.message });
      return false;
    }

    return true;
  } catch (err: any) {
    console.error("[rebuildLinkinbioSnapshot] unexpected error", { pageId, message: err?.message });
    return false;
  }
}
