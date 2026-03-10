// GET /api/widgets/share/[widgetId]/public
// Public endpoint — returns share widget config. No auth required.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type Ctx = { params: Promise<{ widgetId: string }> };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { widgetId } = await ctx.params;

  const { data: widget, error } = await supabaseAdmin
    .from("social_share_widgets")
    .select("id, enabled, platforms, display_mode, button_style, button_size, show_labels, show_counts, share_url, share_text, share_hashtags, color_mode, custom_color")
    .eq("id", widgetId)
    .single();

  if (error || !widget) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: CORS_HEADERS });
  }

  if (!widget.enabled) {
    return NextResponse.json({ ok: false, error: "disabled" }, { status: 403, headers: CORS_HEADERS });
  }

  return NextResponse.json({
    ok: true,
    widget: {
      platforms: widget.platforms,
      display_mode: widget.display_mode,
      button_style: widget.button_style,
      button_size: widget.button_size,
      show_labels: widget.show_labels,
      show_counts: widget.show_counts,
      share_url: widget.share_url,
      share_text: widget.share_text,
      share_hashtags: widget.share_hashtags,
      color_mode: widget.color_mode,
      custom_color: widget.custom_color,
    },
  }, { headers: CORS_HEADERS });
}
