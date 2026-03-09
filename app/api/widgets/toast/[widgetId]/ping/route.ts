// POST /api/widgets/toast/[widgetId]/ping
// Public endpoint — heartbeat from embedded script to track active visitors.
// Called every 30s by the script. Upserts the visitor's ping record.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type Ctx = { params: Promise<{ widgetId: string }> };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { widgetId } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const visitorId = (body.visitor_id || "").slice(0, 64);
  const pageUrl = (body.page_url || "").slice(0, 500);

  if (!visitorId) {
    return NextResponse.json({ ok: false, error: "missing_visitor_id" }, { status: 400, headers: CORS_HEADERS });
  }

  // Upsert ping (update last_seen if already exists)
  const { error } = await supabaseAdmin
    .from("toast_pings")
    .upsert(
      {
        widget_id: widgetId,
        visitor_id: visitorId,
        page_url: pageUrl || null,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "widget_id,visitor_id" }
    );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: CORS_HEADERS });
  }

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
