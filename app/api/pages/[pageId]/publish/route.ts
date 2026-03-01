// app/api/pages/[pageId]/publish/route.ts
// Publishes or unpublishes a hosted page.
// On publish: re-renders html_snapshot from the latest content_data/brand_tokens
// to guarantee the public page always reflects the most recent edits.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { renderTemplateHtml } from "@/lib/templates/render";

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

  // When publishing, re-render html_snapshot from the latest content to ensure freshness
  const updates: Record<string, any> = { status: newStatus };

  if (newStatus === "published") {
    const { data: current } = await supabase
      .from("hosted_pages")
      .select("template_kind, template_id, content_data, brand_tokens")
      .eq("id", pageId)
      .eq("user_id", session.user.id)
      .single();

    if (current) {
      try {
        const { html } = await renderTemplateHtml({
          kind: current.template_kind as any,
          templateId: current.template_id,
          mode: "preview",
          contentData: current.content_data || {},
          brandTokens: Object.keys(current.brand_tokens || {}).length > 0 ? current.brand_tokens : null,
        });
        updates.html_snapshot = html;
      } catch { /* keep existing snapshot */ }
    }
  }

  const { data, error } = await supabase
    .from("hosted_pages")
    .update(updates)
    .eq("id", pageId)
    .eq("user_id", session.user.id)
    .select("id, slug, status")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Page introuvable" }, { status: error ? 500 : 404 });
  }

  return NextResponse.json({ ok: true, page: data });
}
