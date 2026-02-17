// app/api/automation/activate/route.ts
// POST: activate auto-comments for a post
// - Verifies plan access (PRO/ELITE/BETA)
// - Consumes AI credits (0.25 per comment) from the standard user_credits pool
// - Updates content_item with auto-comment settings
// - Triggers auto-comment execution directly (+ n8n webhook as fallback)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { decrypt } from "@/lib/crypto";
import {
  getUserPlan,
  planHasAutoComments,
  calculateCreditsNeeded,
  MAX_COMMENTS_BEFORE,
  MAX_COMMENTS_AFTER,
  CREDIT_PER_COMMENT,
} from "@/lib/automationCredits";
import {
  searchRelevantPosts,
  generateComment,
  likePost,
  postCommentOnPost,
  randomDelay,
  type CommentAngleId,
} from "@/lib/autoCommentEngine";

export const dynamic = "force-dynamic";

function isMissingColumn(msg?: string | null) {
  const m = (msg ?? "").toLowerCase();
  return m.includes("does not exist") || (m.includes("column") && m.includes("unknown"));
}

const EN_CONTENT_SEL = "id, user_id, type, content, status, channel, auto_comments_enabled, project_id";
const FR_CONTENT_SEL = "id, user_id, type, content:contenu, status:statut, channel:canal, auto_comments_enabled, project_id";

const ActivateSchema = z.object({
  content_id: z.string().uuid(),
  nb_comments_before: z.number().int().min(0).max(MAX_COMMENTS_BEFORE),
  nb_comments_after: z.number().int().min(0).max(MAX_COMMENTS_AFTER),
});

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // 1. Check plan access
  let plan: string;
  try {
    plan = await getUserPlan(userId);
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Erreur lecture plan: " + (err instanceof Error ? err.message : "?") }, { status: 500 });
  }

  if (!planHasAutoComments(plan)) {
    return NextResponse.json(
      { ok: false, error: "PLAN_REQUIRED", message: "L'auto-commentaire nécessite un abonnement Pro ou Elite." },
      { status: 403 },
    );
  }

  // 2. Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ActivateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { content_id, nb_comments_before, nb_comments_after } = parsed.data;

  if (nb_comments_before === 0 && nb_comments_after === 0) {
    return NextResponse.json(
      { ok: false, error: "Au moins 1 commentaire avant ou après est requis." },
      { status: 400 },
    );
  }

  // 3. Verify content belongs to user (EN/FR schema compat)
  let content: any = null;
  const enRes = await supabaseAdmin
    .from("content_item")
    .select(EN_CONTENT_SEL)
    .eq("id", content_id)
    .maybeSingle();

  if (enRes.error && isMissingColumn(enRes.error.message)) {
    const frRes = await supabaseAdmin
      .from("content_item")
      .select(FR_CONTENT_SEL)
      .eq("id", content_id)
      .maybeSingle();
    content = frRes.data;
  } else {
    content = enRes.data;
  }

  if (!content) {
    return NextResponse.json({ ok: false, error: "Contenu introuvable." }, { status: 404 });
  }

  if (content.user_id !== userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  // If auto_comments already enabled, reset before re-activating (allows retesting)
  if (content.auto_comments_enabled) {
    await supabaseAdmin
      .from("content_item")
      .update({
        auto_comments_enabled: false,
        auto_comments_status: null,
        nb_comments_before: 0,
        nb_comments_after: 0,
        auto_comments_credits_consumed: 0,
      })
      .eq("id", content_id);
  }

  // 4. Calculate AI credits needed (0.25 per comment)
  const creditsNeeded = calculateCreditsNeeded(nb_comments_before, nb_comments_after);

  // 5. Check AI credits balance and consume
  let creditsRemaining: number;
  try {
    const balance = await ensureUserCredits(userId);
    if (balance.total_remaining < creditsNeeded) {
      return NextResponse.json(
        {
          ok: false,
          error: "NO_CREDITS",
          message: `Crédits insuffisants. ${creditsNeeded} crédits requis, ${balance.total_remaining} disponibles.`,
          credits_needed: creditsNeeded,
          credits_remaining: balance.total_remaining,
        },
        { status: 402 },
      );
    }

    // Consume credits — use Math.ceil to handle any integer constraint in the RPC
    const amountToConsume = Math.max(1, Math.ceil(creditsNeeded));
    const newBalance = await consumeCredits(userId, amountToConsume, {
      kind: "auto_comments",
      content_id,
      nb_before: nb_comments_before,
      nb_after: nb_comments_after,
      credit_per_comment: CREDIT_PER_COMMENT,
    });
    creditsRemaining = newBalance.total_remaining;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("NO_CREDITS")) {
      return NextResponse.json(
        { ok: false, error: "NO_CREDITS", message: "Crédits IA insuffisants." },
        { status: 402 },
      );
    }
    return NextResponse.json({ ok: false, error: "Erreur crédits: " + msg }, { status: 500 });
  }

  // 6. Update content_item with auto-comment settings
  const initialStatus = nb_comments_before > 0 ? "pending" : "before_done";
  const platform = content.channel || content.type || "";

  const { error: updateError } = await supabaseAdmin
    .from("content_item")
    .update({
      auto_comments_enabled: true,
      nb_comments_before,
      nb_comments_after,
      auto_comments_credits_consumed: creditsNeeded,
      auto_comments_status: initialStatus,
    })
    .eq("id", content_id);

  if (updateError) {
    console.error("[activate] DB update error:", updateError.message);
  }

  // 7. Trigger auto-comment execution directly (fire-and-forget)
  // Get social connection for executing comments
  if (nb_comments_before > 0) {
    triggerExecution({
      content_id,
      user_id: userId,
      project_id: content.project_id,
      platform,
      post_text: content.content || "",
      comment_type: "before",
      nb_comments: nb_comments_before,
    });
  }

  return NextResponse.json({
    ok: true,
    credits_consumed: creditsNeeded,
    credits_remaining: creditsRemaining,
    auto_comments: {
      enabled: true,
      nb_before: nb_comments_before,
      nb_after: nb_comments_after,
      status: initialStatus,
    },
  });
}

// ─── Execute auto-comments directly (no self-fetch) ──────────────────────────

const ANGLES: CommentAngleId[] = ["question", "agree", "congrats", "deeper", "experience"];
const DELAY_BETWEEN_COMMENTS_MIN = 30_000;  // 30 seconds
const DELAY_BETWEEN_COMMENTS_MAX = 120_000; // 2 minutes

function triggerExecution(opts: {
  content_id: string;
  user_id: string;
  project_id?: string;
  platform: string;
  post_text: string;
  comment_type: "before" | "after";
  nb_comments: number;
}) {
  // Run in background — don't await
  void (async () => {
    try {
      // Get social connection
      let connQuery = supabaseAdmin
        .from("social_connections")
        .select("platform_user_id, access_token_encrypted")
        .eq("user_id", opts.user_id)
        .eq("platform", opts.platform);

      if (opts.project_id) {
        connQuery = connQuery.eq("project_id", opts.project_id);
      }

      const { data: conn } = await connQuery.maybeSingle();
      if (!conn?.access_token_encrypted) {
        console.error("[activate] No social connection for", opts.platform);
        await supabaseAdmin.from("content_item").update({ auto_comments_status: "before_done" }).eq("id", opts.content_id);
        return;
      }

      let accessToken: string;
      try {
        accessToken = decrypt(conn.access_token_encrypted);
      } catch {
        console.error("[activate] Failed to decrypt token");
        await supabaseAdmin.from("content_item").update({ auto_comments_status: "before_done" }).eq("id", opts.content_id);
        return;
      }

      // Get user's style preferences
      const { data: profile } = await supabaseAdmin
        .from("business_profiles")
        .select("auto_comment_style_ton, auto_comment_langage, auto_comment_objectifs, brand_tone_of_voice, niche")
        .eq("user_id", opts.user_id)
        .maybeSingle();

      const styleTon = profile?.auto_comment_style_ton || "professionnel";
      const niche = profile?.niche || "";
      const brandTone = profile?.brand_tone_of_voice || "";
      const langage = profile?.auto_comment_langage || {};

      // 1. Search for relevant posts
      console.log(`[activate] Starting ${opts.comment_type} phase: ${opts.nb_comments} comments for ${opts.platform}`);

      const relevantPosts = await searchRelevantPosts(
        opts.platform,
        accessToken,
        conn.platform_user_id,
        niche,
        opts.post_text,
        opts.nb_comments + 5,
      );

      console.log(`[activate] Found ${relevantPosts.length} relevant posts on ${opts.platform}`);

      const postsToComment = relevantPosts.slice(0, opts.nb_comments);

      // 2. For each comment: generate, like, comment
      for (let i = 0; i < postsToComment.length; i++) {
        const targetPost = postsToComment[i];
        const angle = ANGLES[i % ANGLES.length];

        try {
          // Human-like delay between comments (skip for first)
          if (i > 0) {
            await randomDelay(DELAY_BETWEEN_COMMENTS_MIN, DELAY_BETWEEN_COMMENTS_MAX);
          }

          // Generate AI comment
          const commentText = await generateComment({
            targetPostText: targetPost.text,
            angle,
            styleTon: styleTon,
            niche,
            brandTone: brandTone,
            platform: opts.platform,
            langage,
          });

          if (!commentText) {
            console.warn(`[activate] Empty comment generated for post ${targetPost.id}`);
            continue;
          }

          // Like the post first (natural behavior)
          await likePost(opts.platform, accessToken, conn.platform_user_id, targetPost.id);

          // Small delay between like and comment
          await randomDelay(3_000, 8_000);

          // Post the comment
          const commentResult = await postCommentOnPost(
            opts.platform,
            accessToken,
            conn.platform_user_id,
            targetPost.id,
            commentText,
          );

          // Log the comment
          try {
            await supabaseAdmin.from("auto_comment_logs").insert({
              user_id: opts.user_id,
              post_tipote_id: opts.content_id,
              target_post_id: targetPost.id || null,
              target_post_url: targetPost.url || null,
              platform: opts.platform,
              comment_text: commentText,
              comment_type: opts.comment_type,
              angle,
              status: commentResult.ok ? "published" : "failed",
              error_message: commentResult.ok ? null : (commentResult.error || "Unknown error"),
              published_at: commentResult.ok ? new Date().toISOString() : null,
            });
          } catch (logErr) {
            console.error("[activate] Failed to log comment:", logErr);
          }

          if (commentResult.ok) {
            console.log(`[activate] Comment ${i + 1}/${postsToComment.length} posted on ${opts.platform}`);
          } else {
            console.error(`[activate] Comment ${i + 1} failed:`, commentResult.error);
          }
        } catch (err) {
          console.error(`[activate] Error on comment ${i + 1}:`, err);
        }
      }

      // 3. Mark batch as complete
      const newStatus = opts.comment_type === "before" ? "before_done" : "completed";
      await supabaseAdmin
        .from("content_item")
        .update({ auto_comments_status: newStatus })
        .eq("id", opts.content_id);

      console.log(`[activate] ${opts.comment_type} phase complete for ${opts.content_id}. Status → ${newStatus}`);
    } catch (err) {
      console.error("[activate] triggerExecution error:", err);
      // On failure, still mark as before_done so the publish flow isn't blocked forever
      try {
        await supabaseAdmin
          .from("content_item")
          .update({ auto_comments_status: opts.comment_type === "before" ? "before_done" : "completed" })
          .eq("id", opts.content_id);
      } catch { /* ignore */ }
    }
  })();
}
