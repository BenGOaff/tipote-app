// GET /api/widgets/toast/[widgetId]/public
// Public endpoint — returns widget config + recent events + active visitor count
// Called by the embeddable script. No auth required.

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

export async function GET(req: NextRequest, ctx: Ctx) {
  const { widgetId } = await ctx.params;
  const pageUrl = req.nextUrl.searchParams.get("page_url") || null;

  // Fetch widget config
  const { data: widget, error } = await supabaseAdmin
    .from("toast_widgets")
    .select("id, enabled, position, display_duration, delay_between, max_per_session, style, custom_messages, show_recent_signups, show_recent_purchases, show_visitor_count, visitor_count_label, signup_label, purchase_label, anonymize_after")
    .eq("id", widgetId)
    .single();

  if (error || !widget) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: CORS_HEADERS });
  }

  if (!widget.enabled) {
    return NextResponse.json({ ok: false, error: "disabled" }, { status: 403, headers: CORS_HEADERS });
  }

  // Fetch recent events (last 24h, max 20)
  const { data: events } = await supabaseAdmin
    .from("toast_events")
    .select("event_type, visitor_name, page_url, created_at")
    .eq("widget_id", widgetId)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(20);

  // Count active visitors
  const { data: visitorCount } = await supabaseAdmin
    .rpc("count_active_visitors", { p_widget_id: widgetId, p_page_url: pageUrl });

  return NextResponse.json({
    ok: true,
    widget: {
      position: widget.position,
      display_duration: widget.display_duration,
      delay_between: widget.delay_between,
      max_per_session: widget.max_per_session,
      style: widget.style,
      custom_messages: widget.custom_messages,
      show_recent_signups: widget.show_recent_signups,
      show_recent_purchases: widget.show_recent_purchases,
      show_visitor_count: widget.show_visitor_count,
      visitor_count_label: widget.visitor_count_label,
      signup_label: widget.signup_label,
      purchase_label: widget.purchase_label,
      anonymize_after: widget.anonymize_after,
    },
    events: events || [],
    active_visitors: visitorCount ?? 0,
  }, { headers: CORS_HEADERS });
}
