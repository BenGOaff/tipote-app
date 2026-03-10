// app/api/pages/[pageId]/links/[linkId]/click/route.ts
// POST: Public endpoint to track link clicks (no auth — called via sendBeacon).

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ pageId: string; linkId: string }> };

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { pageId, linkId } = await ctx.params;

  if (!pageId || !linkId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Increment link click count + page click count (fire-and-forget)
  try {
    await Promise.all([
      supabaseAdmin.rpc("increment_linkinbio_clicks", { p_link_id: linkId }),
      supabaseAdmin.rpc("increment_page_clicks", { p_page_id: pageId }),
    ]);
  } catch {
    // fail-open
  }

  return NextResponse.json({ ok: true });
}
