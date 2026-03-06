// app/api/pages/[pageId]/clicks/route.ts
// Lightweight endpoint to increment page CTA clicks (public, no auth required).

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ pageId: string }> };

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { pageId } = await ctx.params;

  try {
    await supabaseAdmin.rpc("increment_page_clicks", { p_page_id: pageId });
  } catch { /* fail silently */ }

  return NextResponse.json({ ok: true });
}
