// app/api/automation/status/route.ts
// GET: poll auto-comment status for a specific content_id
// Used by the frontend to track progress during the publish-with-autocomments flow
// Query param: ?content_id=xxx

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function isMissingColumn(msg?: string | null) {
  const m = (msg ?? "").toLowerCase();
  return m.includes("does not exist") || (m.includes("column") && m.includes("unknown"));
}

const EN_SEL = "id, user_id, status, auto_comments_enabled, nb_comments_before, nb_comments_after, auto_comments_status";
const FR_SEL = "id, user_id, status:statut, auto_comments_enabled, nb_comments_before, nb_comments_after, auto_comments_status";

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const contentId = req.nextUrl.searchParams.get("content_id");
  if (!contentId) {
    return NextResponse.json({ ok: false, error: "content_id required" }, { status: 400 });
  }

  // Fetch content item (EN/FR schema compat)
  let content: any = null;
  const enRes = await supabaseAdmin
    .from("content_item")
    .select(EN_SEL)
    .eq("id", contentId)
    .maybeSingle();

  if (enRes.error && isMissingColumn(enRes.error.message)) {
    const frRes = await supabaseAdmin
      .from("content_item")
      .select(FR_SEL)
      .eq("id", contentId)
      .maybeSingle();
    content = frRes.data;
  } else {
    content = enRes.data;
  }

  if (!content) {
    return NextResponse.json({ ok: false, error: "Content not found" }, { status: 404 });
  }

  if (content.user_id !== session.user.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  // Count completed comments from logs
  const { count: beforeDone } = await supabaseAdmin
    .from("auto_comment_logs")
    .select("id", { count: "exact", head: true })
    .eq("post_tipote_id", contentId)
    .eq("comment_type", "before")
    .eq("status", "published");

  const { count: afterDone } = await supabaseAdmin
    .from("auto_comment_logs")
    .select("id", { count: "exact", head: true })
    .eq("post_tipote_id", contentId)
    .eq("comment_type", "after")
    .eq("status", "published");

  return NextResponse.json({
    ok: true,
    content_id: contentId,
    post_status: content.status,
    auto_comments_status: content.auto_comments_status,
    auto_comments_enabled: content.auto_comments_enabled,
    nb_comments_before: content.nb_comments_before,
    nb_comments_after: content.nb_comments_after,
    progress: {
      before_done: beforeDone ?? 0,
      before_total: content.nb_comments_before,
      after_done: afterDone ?? 0,
      after_total: content.nb_comments_after,
    },
  });
}
