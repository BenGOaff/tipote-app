// POST /api/widgets/toast/[widgetId]/events
// Public endpoint — record an event (signup or purchase) from the pixel script
// Called from thank-you pages. No auth required.
//
// GET /api/widgets/toast/[widgetId]/events
// Auth endpoint — list events for widget owner (dashboard stats)

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type Ctx = { params: Promise<{ widgetId: string }> };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { widgetId } = await ctx.params;

  // Verify widget exists and is enabled
  const { data: widget } = await supabaseAdmin
    .from("toast_widgets")
    .select("id, enabled")
    .eq("id", widgetId)
    .single();

  if (!widget?.enabled) {
    return NextResponse.json({ ok: false, error: "widget_not_found" }, { status: 404, headers: CORS_HEADERS });
  }

  const body = await req.json().catch(() => ({}));
  const eventType = body.event_type;
  if (!eventType || !["signup", "purchase"].includes(eventType)) {
    return NextResponse.json({ ok: false, error: "invalid_event_type" }, { status: 400, headers: CORS_HEADERS });
  }

  // Clean up name: strip unresolved template variables (e.g. "{{ contact.first_name }}")
  let rawName = (body.name || body.first_name || "").slice(0, 50).trim();
  if (/\{\{.*\}\}/.test(rawName) || /\{%.*%\}/.test(rawName) || /^\{.*\}$/.test(rawName)) {
    rawName = "";
  }

  const { error } = await supabaseAdmin
    .from("toast_events")
    .insert({
      widget_id: widgetId,
      event_type: eventType,
      visitor_name: rawName || null,
      page_url: (body.page_url || body.url || "").slice(0, 500) || null,
      metadata: body.metadata || {},
    });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: CORS_HEADERS });
  }

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { widgetId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  // Verify ownership
  const { data: widget } = await supabase
    .from("toast_widgets")
    .select("id")
    .eq("id", widgetId)
    .eq("user_id", session.user.id)
    .single();

  if (!widget) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const { data: events, error } = await supabase
    .from("toast_events")
    .select("*")
    .eq("widget_id", widgetId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, events: events || [] });
}
