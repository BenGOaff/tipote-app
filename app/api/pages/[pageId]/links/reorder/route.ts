// app/api/pages/[pageId]/links/reorder/route.ts
// POST: reorder linkinbio links by providing an ordered array of link IDs.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { rebuildLinkinbioSnapshot } from "@/lib/linkinbioRebuild";

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

  // Run all updates in parallel, then collect failures. Without explicit error
  // collection, a per-row failure (RLS denial, missing row, type error)
  // returned `{ok:true}` to the client and the user kept seeing their stale
  // order. Surface partial failure with 500 so the editor can refetch and
  // recover instead of optimistically showing a non-persisted reorder.
  const updates = orderedIds.map((id, index) =>
    supabase
      .from("linkinbio_links")
      .update({ sort_order: index })
      .eq("id", id)
      .eq("page_id", pageId)
      .eq("user_id", session.user.id),
  );

  const results = await Promise.all(updates);
  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    console.error("[links/reorder] partial failure", {
      pageId,
      total: results.length,
      failed: failed.length,
      firstError: failed[0].error?.message,
    });
    return NextResponse.json(
      { error: `Reorder partiel : ${failed.length}/${results.length} mises à jour ont échoué (${failed[0].error?.message ?? "erreur inconnue"})` },
      { status: 500 },
    );
  }

  // Refresh public html_snapshot so visitors see the new order immediately.
  await rebuildLinkinbioSnapshot(supabase, pageId, session.user.id);

  return NextResponse.json({ ok: true });
}
