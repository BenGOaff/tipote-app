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
  "id, title, slug, page_type, html_snapshot, meta_title, meta_description, og_image_url, capture_enabled, capture_heading, capture_subtitle, capture_first_name, payment_url, payment_button_text, video_embed_url, legal_mentions_url, legal_cgv_url, legal_privacy_url, status";

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

    // Increment views (non-blocking)
    supabaseAdmin.rpc("increment_page_views", { p_page_id: data.id }).then(() => {}, () => {});

    return NextResponse.json({ ok: true, page: data });
  } catch (err: any) {
    console.error("[public-page-api] Unexpected error:", err?.message);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
