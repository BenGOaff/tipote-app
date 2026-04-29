// app/api/pages/[pageId]/route.ts
// GET: fetch single page (owner only)
// PATCH: update page fields (content_data, brand_tokens, slug, status, etc.)
// DELETE: archive page

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildPage } from "@/lib/pageBuilder";
import { buildLinkinbioPage, type LinkinbioPageData } from "@/lib/linkinbioBuilder";
import { sanitizeHtmlSnapshot } from "@/lib/sanitizeHtml";
import { parseLayoutConfig } from "@/lib/pageLayout";
import { checkPublishedSlugAvailable } from "@/lib/hostedPageSlug";

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
    "thank_you_title", "thank_you_subtitle", "thank_you_message", "thank_you_cta_text", "thank_you_cta_url",
    "thank_you_ctas", "thank_you_show_email_hint",
    "facebook_pixel_id", "google_tag_id",
    "iteration_count", "locale", "html_snapshot",
    "layout_config", "section_order",
  ];

  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  // Strict validation for layout_config: never trust client JSON — the parser
  // returns a safe, enum-constrained object even if the payload is hostile.
  if ("layout_config" in updates) {
    updates.layout_config = parseLayoutConfig(updates.layout_config);
  }

  // Slug-change guard: if the user is trying to set a slug that another user
  // already owns on a published page, refuse. Without this guard the request
  // succeeds (the per-user unique index doesn't see the conflict) and the
  // public route would silently start serving the OLDER user's page (or the
  // newer one — order-by created_at desc), effectively hijacking that URL.
  // We only block when this page is already published OR when the request is
  // simultaneously moving it to published; a draft slug can sit on top of an
  // existing published slug harmlessly until the user attempts to publish.
  if ("slug" in updates && typeof updates.slug === "string" && updates.slug) {
    const willBePublished = updates.status === "published";
    if (willBePublished) {
      const slugCheck = await checkPublishedSlugAvailable(supabaseAdmin, updates.slug, pageId);
      if (slugCheck.conflict) {
        return NextResponse.json(
          { error: `Le slug "${updates.slug}" est déjà utilisé par une autre page publiée. Choisis-en un différent.` },
          { status: 409 },
        );
      }
    } else {
      // Even for drafts: if the page is already published, a slug change must
      // not collide either, otherwise the live URL silently routes to a
      // different row. Look up current status first.
      const { data: currentRow } = await supabase
        .from("hosted_pages")
        .select("status")
        .eq("id", pageId)
        .eq("user_id", session.user.id)
        .maybeSingle();
      if ((currentRow as any)?.status === "published") {
        const slugCheck = await checkPublishedSlugAvailable(supabaseAdmin, updates.slug, pageId);
        if (slugCheck.conflict) {
          return NextResponse.json(
            { error: `Le slug "${updates.slug}" est déjà utilisé par une autre page publiée. Choisis-en un différent.` },
            { status: 409 },
          );
        }
      }
    }
  }

  // Validate section_order: only accept { mobile?: string[]; desktop?: string[] }
  // with short safe id strings. Anything else is coerced to an empty object.
  if ("section_order" in updates) {
    const raw = updates.section_order;
    const cleanArr = (v: unknown): string[] => {
      if (!Array.isArray(v)) return [];
      return v
        .filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 128)
        .filter((x) => /^[a-zA-Z0-9_-]+$/.test(x));
    };
    if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      updates.section_order = {
        mobile: cleanArr(obj.mobile),
        desktop: cleanArr(obj.desktop),
      };
    } else {
      updates.section_order = {};
    }
  }

  // Mirror legal_*_url column writes into content_data so the renderer
  // (lib/pageBuilder.ts → buildFooter) picks them up. The columns are
  // a public-API convenience but the actual footer rendering reads
  // content_data.legal_*_url. Without this mirror, the editor saves
  // the URLs to the column and the visitor never sees them on the
  // live page (Marie-Paule, 2026-04-29).
  const LEGAL_URL_FIELDS = ["legal_mentions_url", "legal_cgv_url", "legal_privacy_url"] as const;
  const legalUrlInPatch = LEGAL_URL_FIELDS.some((f) => f in updates);
  if (legalUrlInPatch) {
    // Snapshot of which fields the client is changing (or clearing —
    // empty string explicitly removes the link).
    const legalPatch: Record<string, string> = {};
    for (const f of LEGAL_URL_FIELDS) {
      if (f in updates) legalPatch[f] = String(updates[f] ?? "");
    }
    // Merge into updates.content_data, lazily fetching the current
    // value when the client didn't ship one with this PATCH.
    if (!updates.content_data) {
      const { data: row } = await supabase
        .from("hosted_pages")
        .select("content_data")
        .eq("id", pageId)
        .eq("user_id", session.user.id)
        .single();
      updates.content_data = (row as { content_data?: Record<string, unknown> } | null)?.content_data ?? {};
    }
    updates.content_data = { ...(updates.content_data as Record<string, unknown>), ...legalPatch };
  }

  // Re-render html_snapshot from content_data — but ONLY when the client did
  // not provide one. The page editor's inline-text / image / structural edits
  // mutate the iframe DOM directly without round-tripping through content_data,
  // and ship the resulting HTML in `html_snapshot`. If we rebuilt regardless,
  // we'd hand the client back a freshly rendered AI version of the page and
  // wipe every inline edit they just made (Marie-Paule, 2026-04). Chat-driven
  // updates and layout-config changes still trigger the rebuild because they
  // only ship structured fields, not html_snapshot.
  const clientProvidedHtml = typeof updates.html_snapshot === "string" && updates.html_snapshot.length > 0;
  if (!clientProvidedHtml && (updates.content_data || updates.brand_tokens || updates.layout_config)) {
    // Fetch current page to get template info. Use select("*") instead of
    // enumerating columns: any single missing column would otherwise fail the
    // query, leave `current` falsy, skip the rebuild, and ship the public
    // page out of sync with content_data — the same Marie-Paule failure mode
    // (Apr 2026) but on the rebuild branch instead of the read branch.
    const { data: current, error: currentErr } = await supabase
      .from("hosted_pages")
      .select("*")
      .eq("id", pageId)
      .eq("user_id", session.user.id)
      .single();

    if (currentErr) {
      console.error("[pages/PATCH] rebuild lookup failed", { pageId, error: currentErr.message, code: currentErr.code });
    }

    if (current) {
      const contentData = updates.content_data || current.content_data;
      const brandTokens = updates.brand_tokens || current.brand_tokens;
      const layoutCfg = "layout_config" in updates ? updates.layout_config : (current as any).layout_config;

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
            layoutConfig: layoutCfg || null,
          });
          updates.html_snapshot = html;
        }
      } catch (err: any) {
        // Log instead of swallowing — a builder throw used to silently keep
        // the previous snapshot, leaving the public page diverged from the
        // editor without any signal in logs.
        console.error("[pages/PATCH] rebuild failed, keeping existing snapshot", {
          pageId,
          pageType: (current as any).page_type,
          error: err?.message,
        });
      }
    }
  }

  // Always sanitize html_snapshot to strip editor artifacts (defense-in-depth)
  if (typeof updates.html_snapshot === "string" && updates.html_snapshot) {
    updates.html_snapshot = sanitizeHtmlSnapshot(updates.html_snapshot);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Retry on "column does not exist" by dropping the offending column from the
  // payload. Without this, a single missing column (e.g. when a Supabase
  // migration hasn't been deployed yet) silently throws away the whole update,
  // and the user can't understand why their edits never persist.
  // We surface the dropped columns in the response so the client can warn
  // the user that part of their save was silently lost.
  let attemptUpdates: Record<string, any> = updates;
  let lastError: { message: string; code?: string } | null = null;
  const dropped: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const { data, error } = await supabase
      .from("hosted_pages")
      .update(attemptUpdates)
      .eq("id", pageId)
      .eq("user_id", session.user.id)
      .select("id, slug, status, updated_at")
      .single();

    if (!error) {
      if (dropped.length > 0) {
        return NextResponse.json({
          ok: true,
          page: data,
          dropped,
          warning: `Colonnes manquantes en base, ignorées pendant la sauvegarde : ${dropped.join(", ")}. Déploie les dernières migrations Supabase.`,
        });
      }
      return NextResponse.json({ ok: true, page: data });
    }

    lastError = { message: error.message, code: error.code };
    const msg = (error.message ?? "").toLowerCase();
    const isColumnError = msg.includes("does not exist") && msg.includes("column");
    if (!isColumnError) break;
    const match = error.message.match(/column ['"]?(?:hosted_pages\.)?([a-zA-Z0-9_]+)['"]?/);
    const missing = match?.[1];
    if (!missing || !(missing in attemptUpdates)) break;
    dropped.push(missing);
    const { [missing]: _drop, ...rest } = attemptUpdates;
    if (Object.keys(rest).length === 0) break;
    attemptUpdates = rest;
  }

  return NextResponse.json({ error: lastError?.message || "Update failed", dropped }, { status: 500 });
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
