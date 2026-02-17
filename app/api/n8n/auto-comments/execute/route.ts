// app/api/n8n/auto-comments/execute/route.ts
// POST: Execute auto-comment jobs — called by n8n (rescue for after_pending)
// Uses the shared runAutoCommentBatch engine.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runAutoCommentBatch } from "@/lib/autoCommentEngine";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max (Vercel)

type ExecuteBody = {
  content_id: string;
  user_id: string;
  platform: string;
  platform_user_id: string;
  access_token: string;
  post_text: string;
  comment_type: "before" | "after";
  nb_comments: number;
  style_ton?: string;
  niche?: string;
  brand_tone?: string;
  langage?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  // Auth: accept either n8n secret or internal call header
  const secret = req.headers.get("x-n8n-secret") || "";
  const internalKey = req.headers.get("x-internal-key") || "";
  const validSecret = secret === process.env.N8N_SHARED_SECRET;
  const validInternal = internalKey === (process.env.INTERNAL_API_KEY || process.env.N8N_SHARED_SECRET || "");

  if (!validSecret && !validInternal) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: ExecuteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const {
    content_id,
    user_id,
    platform,
    platform_user_id,
    access_token,
    post_text,
    comment_type,
    nb_comments,
    style_ton,
    niche,
    brand_tone,
    langage,
  } = body;

  if (!content_id || !user_id || !platform || !access_token || !post_text || !comment_type || !nb_comments) {
    return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  try {
    const result = await runAutoCommentBatch({
      supabaseAdmin,
      contentId: content_id,
      userId: user_id,
      platform,
      accessToken: access_token,
      platformUserId: platform_user_id,
      postText: post_text,
      commentType: comment_type,
      nbComments: nb_comments,
      styleTon: style_ton,
      niche,
      brandTone: brand_tone,
      langage,
    });

    return NextResponse.json({
      ok: true,
      phase: comment_type,
      comments_requested: nb_comments,
      comments_posted: result.commentsPosted,
      comments_failed: result.commentsFailed,
      posts_found: result.postsFound,
      results: result.results,
    });
  } catch (err) {
    console.error("[auto-comments/execute] Fatal error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
