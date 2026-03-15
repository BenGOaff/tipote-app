// app/api/pages/public/[slug]/route.ts
// Public API endpoint to fetch a published page by slug.
// Uses supabaseAdmin (service_role) to bypass RLS — same pattern as /api/quiz/[quizId]/public.
// No auth required: this serves the public-facing hosted page.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

// Full select — contains all columns expected by PublicPageClient
const PAGE_SELECT_FULL =
  "id, user_id, title, slug, page_type, html_snapshot, locale, meta_title, meta_description, og_image_url, capture_enabled, capture_heading, capture_subtitle, capture_first_name, payment_url, payment_button_text, video_embed_url, legal_mentions_url, legal_cgv_url, legal_privacy_url, thank_you_title, thank_you_message, thank_you_cta_text, thank_you_cta_url, facebook_pixel_id, google_tag_id, brand_tokens, content_data, status";

// Minimal select — fallback if some columns have not been migrated yet
const PAGE_SELECT_MINIMAL =
  "id, user_id, title, slug, page_type, html_snapshot, status";

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { slug } = await ctx.params;

  if (!slug) {
    return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });
  }

  try {
    // Try full select first
    let result = await supabaseAdmin
      .from("hosted_pages")
      .select(PAGE_SELECT_FULL)
      .eq("slug", slug)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // If column error, fallback to minimal select
    if (result.error) {
      const msg = (result.error.message ?? "").toLowerCase();
      const isColumnError = msg.includes("does not exist") || msg.includes("column") || msg.includes("pgrst");
      if (isColumnError) {
        console.warn("[public-page-api] Column error, falling back to minimal select:", result.error.message);
        result = await supabaseAdmin
          .from("hosted_pages")
          .select(PAGE_SELECT_MINIMAL)
          .eq("slug", slug)
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
      }
    }

    if (result.error) {
      console.error("[public-page-api] Supabase error for slug:", slug, result.error.message, result.error.code);
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
    }

    if (!result.data) {
      // Also try without status filter to give a better error message
      const { data: anyPage } = await supabaseAdmin
        .from("hosted_pages")
        .select("id, slug, status")
        .eq("slug", slug)
        .limit(1)
        .maybeSingle();

      if (anyPage) {
        console.warn("[public-page-api] Page found but not published:", slug, "status:", (anyPage as any).status);
        return NextResponse.json({ ok: false, error: "Page not published yet" }, { status: 404 });
      }

      return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404 });
    }

    const data = result.data as any;

    // Fetch creator's address_form preference (tu/vous)
    let addressForm = "tu";
    try {
      if (data.user_id) {
        const { data: bp } = await supabaseAdmin
          .from("business_profiles")
          .select("address_form")
          .eq("user_id", data.user_id)
          .maybeSingle();
        addressForm = (bp as any)?.address_form === "vous" ? "vous" : "tu";
      }
    } catch {
      // fail-open: keep default "tu"
    }

    // Increment views (non-blocking, fire-and-forget)
    try {
      supabaseAdmin.rpc("increment_page_views", { p_page_id: data.id }).then(() => {}, () => {});
    } catch {
      // ignore
    }

    // Look up user's enabled widgets (toast + share)
    let toastWidgetId: string | null = null;
    let shareWidgetId: string | null = null;
    try {
      if (data.user_id) {
        const [twRes, swRes] = await Promise.all([
          supabaseAdmin
            .from("toast_widgets")
            .select("id")
            .eq("user_id", data.user_id)
            .eq("enabled", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
          supabaseAdmin
            .from("social_share_widgets")
            .select("id")
            .eq("user_id", data.user_id)
            .eq("enabled", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);
        toastWidgetId = twRes.data?.id || null;
        shareWidgetId = swRes.data?.id || null;
      }
    } catch {
      // fail-open: no widgets
    }

    // Strip user_id from public response, inject address_form
    const { user_id: _uid, ...pagePublic } = data;

    // Ensure defaults for optional fields that client expects
    return NextResponse.json({
      ok: true,
      toast_widget_id: toastWidgetId,
      share_widget_id: shareWidgetId,
      page: {
        capture_enabled: true,
        capture_heading: "",
        capture_subtitle: "",
        capture_first_name: false,
        payment_url: "",
        payment_button_text: "",
        video_embed_url: "",
        legal_mentions_url: "",
        legal_cgv_url: "",
        legal_privacy_url: "",
        og_image_url: "",
        meta_title: "",
        meta_description: "",
        thank_you_title: "",
        thank_you_message: "",
        thank_you_cta_text: "",
        thank_you_cta_url: "",
        facebook_pixel_id: "",
        google_tag_id: "",
        ...pagePublic,
        address_form: addressForm,
      },
    });
  } catch (err: any) {
    console.error("[public-page-api] Unexpected error for slug:", slug, err?.message, err?.stack?.slice(0, 300));
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
