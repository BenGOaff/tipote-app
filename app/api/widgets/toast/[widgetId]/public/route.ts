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

  // Fetch widget config (include user_id for page_leads lookup)
  const { data: widget, error } = await supabaseAdmin
    .from("toast_widgets")
    .select("id, user_id, enabled, position, display_duration, delay_between, max_per_session, style, custom_messages, show_recent_signups, show_recent_purchases, show_visitor_count, visitor_count_label, signup_label, purchase_label, anonymize_after")
    .eq("id", widgetId)
    .single();

  if (error || !widget) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: CORS_HEADERS });
  }

  if (!widget.enabled) {
    return NextResponse.json({ ok: false, error: "disabled" }, { status: 403, headers: CORS_HEADERS });
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch recent toast_events (last 24h, max 20)
  const { data: toastEvents } = await supabaseAdmin
    .from("toast_events")
    .select("event_type, visitor_name, page_url, created_at")
    .eq("widget_id", widgetId)
    .gte("created_at", since24h)
    .order("created_at", { ascending: false })
    .limit(20);

  // Also fetch recent page_leads (last 24h) to include signups that
  // may not have a corresponding toast_event (captured before the fix)
  let mergedEvents: Array<{ event_type: string; visitor_name: string | null; page_url: string | null; created_at: string }> = [...(toastEvents || [])];

  if (widget.show_recent_signups && widget.user_id) {
    const { data: recentLeads } = await supabaseAdmin
      .from("page_leads")
      .select("first_name, created_at")
      .eq("user_id", widget.user_id)
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(20);

    if (recentLeads && recentLeads.length > 0) {
      // Build a set of existing toast event timestamps to avoid duplicates
      const existingTimes = new Set(
        (toastEvents || [])
          .filter((e: any) => e.event_type === "signup")
          .map((e: any) => {
            // Round to nearest second for matching
            const d = new Date(e.created_at);
            return `${Math.floor(d.getTime() / 1000)}`;
          })
      );

      for (const lead of recentLeads) {
        const leadSec = `${Math.floor(new Date(lead.created_at).getTime() / 1000)}`;
        // Only add if no matching toast_event exists (within 1-second window)
        if (!existingTimes.has(leadSec) && !existingTimes.has(`${Number(leadSec) - 1}`) && !existingTimes.has(`${Number(leadSec) + 1}`)) {
          mergedEvents.push({
            event_type: "signup",
            visitor_name: lead.first_name || null,
            page_url: null,
            created_at: lead.created_at,
          });
        }
      }

      // Re-sort by created_at desc and limit to 20
      mergedEvents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      mergedEvents = mergedEvents.slice(0, 20);
    }
  }

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
    events: mergedEvents,
    active_visitors: visitorCount ?? 0,
  }, { headers: CORS_HEADERS });
}
