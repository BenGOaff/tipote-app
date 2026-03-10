// app/api/pages/[pageId]/links/reorder/route.ts
// POST: reorder linkinbio links by providing an ordered array of link IDs.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ pageId: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { pageId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  const orderedIds: string[] = body.orderedIds;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ error: "orderedIds array required" }, { status: 400 });
  }

  // Update sort_order for each link
  const updates = orderedIds.map((id, index) =>
    supabase
      .from("linkinbio_links")
      .update({ sort_order: index })
      .eq("id", id)
      .eq("page_id", pageId)
      .eq("user_id", session.user.id)
  );

  await Promise.all(updates);

  return NextResponse.json({ ok: true });
}
