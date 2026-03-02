// app/api/pages/public/[slug]/route.ts
// Public API endpoint to fetch a published page by slug.
// Uses supabaseAdmin (service_role) to bypass RLS — same pattern as /api/quiz/[quizId]/public.
// No auth required: this serves the public-facing hosted page.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

const PAGE_SELECT =
  "id, user_id, title, slug, page_type, html_snapshot, meta_title, meta_description, og_image_url, capture_enabled, capture_heading, capture_subtitle, capture_first_name, payment_url, payment_button_text, video_embed_url, legal_mentions_url, legal_cgv_url, legal_privacy_url, status";

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { slug } = await ctx.params;

  if (!slug) {
    return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("hosted_pages")
      .select(PAGE_SELECT)
      .eq("slug", slug)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[public-page-api] Supabase error for slug:", slug, error.message);
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404 });
    }

    // Fetch creator's address_form preference (tu/vous)
    let addressForm = "tu";
    if ((data as any).user_id) {
      const { data: bp } = await supabaseAdmin
        .from("business_profiles")
        .select("address_form")
        .eq("user_id", (data as any).user_id)
        .maybeSingle();
      addressForm = (bp as any)?.address_form === "vous" ? "vous" : "tu";
    }

    // Increment views (non-blocking)
    supabaseAdmin.rpc("increment_page_views", { p_page_id: data.id }).then(() => {}, () => {});

    // Strip user_id from public response, inject address_form
    const { user_id: _uid, ...pagePublic } = data as any;

    return NextResponse.json({ ok: true, page: { ...pagePublic, address_form: addressForm } });
  } catch (err: any) {
    console.error("[public-page-api] Unexpected error:", err?.message);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
