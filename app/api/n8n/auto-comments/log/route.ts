// app/api/n8n/auto-comments/log/route.ts
// POST: log a published auto-comment from n8n
// Updates auto_comments_status on the content_item
// Secured via X-N8N-Secret header
//
// Status transitions on batch_complete:
//   before done → "before_done" (waiting for publication)
//   after done  → "completed"

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Auth check
  const secret = req.headers.get("x-n8n-secret") || "";
  if (!secret || secret !== process.env.N8N_SHARED_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const {
    content_id,
    user_id,
    project_id,
    target_post_id,
    target_post_url,
    platform,
    comment_text,
    comment_type,
    angle,
    success,
    error: errorMsg,
    batch_complete,
  } = body;

  if (!content_id || !user_id || !platform || !comment_type) {
    return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  try {
    // 1. Insert log entry (skip if batch_complete-only signal with no comment)
    if (comment_text || target_post_id) {
      const { error: insertError } = await supabaseAdmin
        .from("auto_comment_logs")
        .insert({
          user_id,
          project_id: project_id || null,
          post_tipote_id: content_id,
          target_post_id: target_post_id || null,
          target_post_url: target_post_url || null,
          platform,
          comment_text: comment_text || "",
          comment_type,
          angle: angle || null,
          status: success ? "published" : "failed",
          error_message: success ? null : (errorMsg || "Unknown error"),
          published_at: success ? new Date().toISOString() : null,
        });

      if (insertError) {
        console.error("[n8n/auto-comments/log] insert error:", insertError);
      }
    }

    // 2. If batch_complete flag is set, advance auto_comments_status
    if (batch_complete) {
      const { data: content } = await supabaseAdmin
        .from("content_item")
        .select("auto_comments_status, nb_comments_before, nb_comments_after")
        .eq("id", content_id)
        .maybeSingle();

      if (content) {
        let newStatus = content.auto_comments_status;

        if (comment_type === "before") {
          // Before comments done → mark as "before_done"
          // Frontend (for immediate) or scheduled-posts (for scheduled) will handle publication
          // After publication, status advances to "after_pending"
          newStatus = "before_done";
        } else if (comment_type === "after") {
          // After comments done → everything complete
          newStatus = "completed";
        }

        if (newStatus !== content.auto_comments_status) {
          const { error: updateError } = await supabaseAdmin
            .from("content_item")
            .update({ auto_comments_status: newStatus })
            .eq("id", content_id);

          if (updateError) {
            console.error("[n8n/auto-comments/log] status update error:", updateError);
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/n8n/auto-comments/log] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
