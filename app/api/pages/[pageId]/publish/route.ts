// app/api/pages/[pageId]/publish/route.ts
// Publishes or unpublishes a hosted page.

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

  const newStatus = body?.publish === false ? "draft" : "published";

  const { data, error } = await supabase
    .from("hosted_pages")
    .update({ status: newStatus })
    .eq("id", pageId)
    .eq("user_id", session.user.id)
    .select("id, slug, status")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Page introuvable" }, { status: error ? 500 : 404 });
  }

  return NextResponse.json({ ok: true, page: data });
}
