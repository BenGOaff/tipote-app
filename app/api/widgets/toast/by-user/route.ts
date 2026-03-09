// GET /api/widgets/toast/by-user?user_id=xxx
// Public endpoint — returns the user's first enabled toast widget ID.
// Used by PublicPageClient / PublicQuizClient to inject toast overlay on Tipote pages.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ ok: false, error: "missing_user_id" }, { status: 400, headers: CORS_HEADERS });
  }

  const { data: widget } = await supabaseAdmin
    .from("toast_widgets")
    .select("id")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    widget_id: widget?.id || null,
  }, { headers: CORS_HEADERS });
}
