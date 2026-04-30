// lib/pages/syncLegalUrls.ts
// One-shot fan-out: when the user updates her business profile's
// legal URLs (privacy_url / terms_url / cgv_url), propagate the
// new values to every hosted_page she owns so the live footer
// updates without her having to open each page.
//
// Mapping:
//   business_profiles.terms_url    → hosted_pages.legal_mentions_url
//   business_profiles.cgv_url      → hosted_pages.legal_cgv_url
//   business_profiles.privacy_url  → hosted_pages.legal_privacy_url
//
// Each page's column AND content_data.legal_*_url are written, and
// html_snapshot is rebuilt via buildPage so the public route
// (/api/pages/public/[slug]) serves the new footer immediately.
//
// Settings is the SOURCE OF TRUTH. We overwrite per-page values to
// match — if a user wants per-page customization, they can do it via
// the page editor AFTER syncing from settings, and that override
// persists until the next settings change.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildPage } from "@/lib/pageBuilder";
import { applySectionOrderToHtml } from "@/lib/pages/applySectionOrderToHtml";

export type LegalUrlsFromSettings = {
  privacy_url?: string;
  terms_url?: string;
  cgv_url?: string;
};

type HostedPageRow = {
  id: string;
  user_id: string;
  page_type: string;
  template_kind: string;
  template_id: string;
  content_data: Record<string, unknown> | null;
  brand_tokens: Record<string, unknown> | null;
  layout_config: Record<string, unknown> | null;
  section_order: { mobile?: string[]; desktop?: string[] } | null;
  locale: string | null;
  status: string;
};

/**
 * Fan out the user's legal URLs to all her hosted pages.
 *
 * Non-blocking caller pattern — call from inside an async IIFE so
 * the PATCH /api/profile response doesn't wait on N rebuilds.
 *
 * Skips archived pages by default (visitors don't see them, no need
 * to pay the rebuild cost). Linkinbio pages are also skipped — they
 * have their own footer rendering pipeline (buildLinkinbioPage) that
 * doesn't read content_data.legal_*_url.
 */
export async function syncLegalUrlsToUserPages(
  userId: string,
  settings: LegalUrlsFromSettings,
): Promise<{ updated: number; failed: number }> {
  // Map settings field → page column name
  const pageFields: Record<string, string | undefined> = {
    legal_mentions_url: settings.terms_url,
    legal_cgv_url: settings.cgv_url,
    legal_privacy_url: settings.privacy_url,
  };

  // Filter to fields the caller actually touched (settings can patch
  // just one of the three). Empty string is INTENTIONALLY ignored to
  // protect against partial save / state-init races that would
  // otherwise blast away every page's legal link en masse. If a user
  // really wants to remove a link, they can do it per-page from the
  // editor's Settings panel — that's a deliberate per-row action and
  // not subject to the auto fan-out.
  const provided: Record<string, string> = {};
  for (const [k, v] of Object.entries(pageFields)) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (trimmed.length === 0) continue;
    provided[k] = trimmed;
  }
  if (Object.keys(provided).length === 0) {
    return { updated: 0, failed: 0 };
  }

  const { data: pages, error: listErr } = await supabaseAdmin
    .from("hosted_pages")
    .select("id, user_id, page_type, template_kind, template_id, content_data, brand_tokens, layout_config, section_order, locale, status")
    .eq("user_id", userId)
    .neq("status", "archived");

  if (listErr) {
    console.error("[syncLegalUrls] page lookup failed:", listErr.message);
    return { updated: 0, failed: 0 };
  }
  if (!pages || pages.length === 0) {
    return { updated: 0, failed: 0 };
  }

  let updated = 0;
  let failed = 0;
  for (const row of pages as HostedPageRow[]) {
    try {
      const nextContentData: Record<string, unknown> = {
        ...(row.content_data ?? {}),
        ...provided,
      };

      let nextHtml: string | null = null;
      if (row.page_type === "linkinbio") {
        // Linkinbio renderer doesn't surface legal URLs in its
        // footer template, so we just persist the column update
        // without a rebuild. (No-op visually, but keeps the column
        // consistent for any future template that DOES read it.)
        nextHtml = null;
      } else {
        const pageType: "capture" | "sales" | "showcase" =
          row.template_kind === "vente" ? "sales" :
          row.template_kind === "vitrine" ? "showcase" :
          "capture";
        try {
          const rawHtml = buildPage({
            pageType,
            contentData: nextContentData,
            brandTokens: row.brand_tokens ?? null,
            locale: row.locale ?? "fr",
            layoutConfig: row.layout_config ?? null,
          });
          // Bake user's section ordering into the static snapshot
          // (same trick the editor iframe uses at runtime). Without
          // this the public footer rebuild reverts the layout to
          // the template default.
          nextHtml = applySectionOrderToHtml(rawHtml, row.section_order ?? null);
        } catch (buildErr) {
          // A bad template / corrupt content shouldn't block the
          // column write. Log and persist the column-only change.
          console.warn("[syncLegalUrls] buildPage failed for", row.id, buildErr);
          nextHtml = null;
        }
      }

      const updatePayload: Record<string, unknown> = {
        ...provided,
        content_data: nextContentData,
        updated_at: new Date().toISOString(),
      };
      if (nextHtml) updatePayload.html_snapshot = nextHtml;

      const { error: updErr } = await supabaseAdmin
        .from("hosted_pages")
        .update(updatePayload)
        .eq("id", row.id)
        .eq("user_id", userId); // belt-and-suspenders: never touch another user's row

      if (updErr) {
        failed++;
        console.error("[syncLegalUrls] update failed for", row.id, updErr.message);
      } else {
        updated++;
      }
    } catch (e) {
      failed++;
      console.error("[syncLegalUrls] unexpected error for page", row.id, e);
    }
  }

  return { updated, failed };
}
