// app/api/n8n/auto-comments/execute/route.ts
// POST: Execute auto-comment jobs — search, generate, like, comment
// Can be called by n8n OR directly by the app after activation.
// Processes one job at a time with human-like delays between actions.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateComment,
  searchRelevantPosts,
  postCommentOnPost,
  likePost,
  randomDelay,
  type CommentAngleId,
} from "@/lib/autoCommentEngine";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max (Vercel)

const ANGLES: CommentAngleId[] = ["question", "agree", "congrats", "deeper", "experience"];

// Delays to simulate human behavior (in ms)
const DELAY_BETWEEN_COMMENTS_MIN = 30_000;  // 30 seconds
const DELAY_BETWEEN_COMMENTS_MAX = 120_000; // 2 minutes

const LOG_URL_BASE = typeof process !== "undefined"
  ? (process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "https://app.tipote.com")
  : "https://app.tipote.com";

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
    style_ton = "professionnel",
    niche = "",
    brand_tone = "",
    langage,
  } = body;

  if (!content_id || !user_id || !platform || !access_token || !post_text || !comment_type || !nb_comments) {
    return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  console.log(`[auto-comments/execute] Starting ${comment_type} phase: ${nb_comments} comments for ${platform} post ${content_id}`);

  const results: Array<{ success: boolean; targetPostId?: string; targetPostUrl?: string; commentText?: string; angle?: string; error?: string }> = [];

  try {
    // 1. Search for relevant posts
    const relevantPosts = await searchRelevantPosts(
      platform,
      access_token,
      platform_user_id,
      niche,
      post_text,
      nb_comments + 5, // fetch extra in case some fail
    );

    console.log(`[auto-comments/execute] Found ${relevantPosts.length} relevant posts on ${platform}`);

    // 2. For each comment needed: pick a post, generate comment, like, comment
    const postsToComment = relevantPosts.slice(0, nb_comments);
    const commentsToMake = Math.min(nb_comments, postsToComment.length);

    for (let i = 0; i < commentsToMake; i++) {
      const targetPost = postsToComment[i];
      const angle = ANGLES[i % ANGLES.length];

      try {
        // Add human-like delay between comments (skip for first one)
        if (i > 0) {
          await randomDelay(DELAY_BETWEEN_COMMENTS_MIN, DELAY_BETWEEN_COMMENTS_MAX);
        }

        // Generate AI comment
        const commentText = await generateComment({
          targetPostText: targetPost.text,
          angle,
          styleTon: style_ton,
          niche,
          brandTone: brand_tone,
          platform,
          langage,
        });

        if (!commentText) {
          results.push({ success: false, targetPostId: targetPost.id, error: "Empty comment generated" });
          continue;
        }

        // Like the post first (natural behavior)
        await likePost(platform, access_token, platform_user_id, targetPost.id);

        // Small delay between like and comment
        await randomDelay(3_000, 8_000);

        // Post the comment
        const commentResult = await postCommentOnPost(
          platform,
          access_token,
          platform_user_id,
          targetPost.id,
          commentText,
        );

        if (commentResult.ok) {
          console.log(`[auto-comments/execute] Comment ${i + 1}/${commentsToMake} posted on ${platform}`);
          results.push({
            success: true,
            targetPostId: targetPost.id,
            targetPostUrl: targetPost.url,
            commentText,
            angle,
          });
        } else {
          console.error(`[auto-comments/execute] Comment ${i + 1} failed:`, commentResult.error);
          results.push({
            success: false,
            targetPostId: targetPost.id,
            error: commentResult.error,
          });
        }

        // Log each comment individually
        await logComment({
          content_id,
          user_id,
          platform,
          target_post_id: targetPost.id,
          target_post_url: targetPost.url,
          comment_text: commentText,
          comment_type,
          angle,
          success: commentResult.ok,
          error: commentResult.ok ? undefined : commentResult.error,
        });

      } catch (err) {
        console.error(`[auto-comments/execute] Error on comment ${i + 1}:`, err);
        results.push({
          success: false,
          targetPostId: targetPost.id,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    // If we didn't have enough posts to comment on, log it
    if (postsToComment.length < nb_comments) {
      console.warn(`[auto-comments/execute] Only found ${postsToComment.length} posts, needed ${nb_comments}`);
    }

    // 3. Mark batch as complete — advance auto_comments_status
    const newStatus = comment_type === "before" ? "before_done" : "completed";
    await supabaseAdmin
      .from("content_item")
      .update({ auto_comments_status: newStatus })
      .eq("id", content_id);

    console.log(`[auto-comments/execute] ${comment_type} phase complete for ${content_id}. Status → ${newStatus}`);

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      ok: true,
      phase: comment_type,
      comments_requested: nb_comments,
      comments_posted: successCount,
      comments_failed: results.length - successCount,
      posts_found: relevantPosts.length,
      new_status: newStatus,
      results,
    });

  } catch (err) {
    console.error("[auto-comments/execute] Fatal error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

// ─── Helper: log a single comment to auto_comment_logs ───────────────────────

async function logComment(opts: {
  content_id: string;
  user_id: string;
  platform: string;
  target_post_id?: string;
  target_post_url?: string;
  comment_text: string;
  comment_type: "before" | "after";
  angle: string;
  success: boolean;
  error?: string;
}) {
  try {
    await supabaseAdmin.from("auto_comment_logs").insert({
      user_id: opts.user_id,
      post_tipote_id: opts.content_id,
      target_post_id: opts.target_post_id || null,
      target_post_url: opts.target_post_url || null,
      platform: opts.platform,
      comment_text: opts.comment_text,
      comment_type: opts.comment_type,
      angle: opts.angle,
      status: opts.success ? "published" : "failed",
      error_message: opts.success ? null : (opts.error || "Unknown error"),
      published_at: opts.success ? new Date().toISOString() : null,
    });
  } catch (err) {
    console.error("[auto-comments/execute] Failed to log comment:", err);
  }
}
