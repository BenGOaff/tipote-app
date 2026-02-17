// app/api/n8n/publish-callback/route.ts
// POST : appele par n8n apres publication d'un post.
// Met a jour le statut du content_item.
// Body : { content_id, platform?, success, postUrn?, postId?, error? }

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/crypto";
import { runAutoCommentBatch } from "@/lib/autoCommentEngine";

export const dynamic = "force-dynamic";

function isMissingColumn(msg?: string | null) {
  const m = (msg ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find the '") ||
    m.includes("schema cache") ||
    m.includes("pgrst") ||
    (m.includes("column") && (m.includes("exist") || m.includes("unknown")))
  );
}

/** Met a jour le statut du content_item (compat colonnes FR/EN).
 *  MERGES new meta fields with existing meta (preserves images, etc.). */
async function updatePublishedStatus(contentId: string, newMetaFields: Record<string, string>) {
  // Fetch existing meta to merge (preserve images, etc.)
  const { data: existing } = await supabaseAdmin
    .from("content_item")
    .select("meta")
    .eq("id", contentId)
    .single();

  const existingMeta = (existing?.meta && typeof existing.meta === "object") ? existing.meta as Record<string, unknown> : {};
  const mergedMeta = { ...existingMeta, ...newMetaFields };

  // Essai 1 : colonne EN "status"
  const { error: err1 } = await supabaseAdmin
    .from("content_item")
    .update({ status: "published", meta: mergedMeta })
    .eq("id", contentId);

  if (!err1) return;

  if (isMissingColumn(err1.message)) {
    // Essai 2 : colonne FR "statut"
    await supabaseAdmin
      .from("content_item")
      .update({ statut: "published", meta: mergedMeta } as any)
      .eq("id", contentId);
  } else {
    console.error("publish-callback: update error", err1);
  }
}

export async function POST(req: NextRequest) {
  // Auth par header secret
  const secret = req.headers.get("x-n8n-secret");
  if (!secret || secret !== process.env.N8N_SHARED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const contentId = body?.content_id as string | undefined;
  const platform = body?.platform as string | undefined;
  const success = body?.success as boolean | undefined;
  const postUrn = body?.postUrn as string | undefined;
  const postId = body?.postId as string | undefined;
  const errorMsg = body?.error as string | undefined;

  if (!contentId) {
    return NextResponse.json({ error: "content_id manquant" }, { status: 400 });
  }

  if (success) {
    // Marquer comme publié + stocker les infos du post dans meta
    const meta: Record<string, string> = {
      published_at: new Date().toISOString(),
    };

    // Stocker l'identifiant du post selon la plateforme
    if (postUrn) meta.linkedin_post_urn = postUrn;
    if (postId) meta[`${platform ?? "social"}_post_id`] = postId;
    if (platform) meta.published_platform = platform;

    // Construire l'URL du post
    if (platform === "linkedin" && postUrn) {
      const urn = postUrn.startsWith("urn:") ? postUrn : `urn:li:share:${postUrn}`;
      meta.linkedin_post_url = `https://www.linkedin.com/feed/update/${urn}/`;
    }
    if (platform === "twitter" && postId) {
      meta.twitter_post_url = `https://twitter.com/i/status/${postId}`;
    }
    if (platform === "threads" && postId) {
      meta.threads_post_url = postId.startsWith("http") ? postId : `https://www.threads.net/t/${postId}`;
    }
    if (platform === "facebook" && postId) {
      meta.facebook_post_url = `https://www.facebook.com/${postId}`;
    }

    await updatePublishedStatus(contentId, meta);

    // Advance auto_comments_status: before_done → after_pending
    // Also triggers the "after" execution directly
    const { data: advancedItem } = await supabaseAdmin
      .from("content_item")
      .update({ auto_comments_status: "after_pending" })
      .eq("id", contentId)
      .eq("auto_comments_enabled", true)
      .eq("auto_comments_status", "before_done")
      .select("id, user_id, project_id, content, contenu, channel, canal, nb_comments_after")
      .maybeSingle();

    // Trigger after-comment execution if there are after-comments to do
    if (advancedItem && advancedItem.nb_comments_after > 0) {
      const itemPlatform = advancedItem.channel || advancedItem.canal || platform || "";
      const itemContent = advancedItem.content || advancedItem.contenu || "";
      void triggerAfterExecution(advancedItem.id, advancedItem.user_id, advancedItem.project_id, itemPlatform, itemContent, advancedItem.nb_comments_after);
    }
  } else {
    console.error(`n8n publish failed for ${contentId} (${platform ?? "unknown"}): ${errorMsg}`);

    // Safety: check if the post was already published before resetting to "scheduled".
    // This prevents re-queuing a post that n8n actually published successfully
    // but reported as failed (e.g. callback timeout).
    const { data: existingFailed } = await supabaseAdmin
      .from("content_item")
      .select("meta")
      .eq("id", contentId)
      .single();

    const existingFailedMeta = (existingFailed?.meta && typeof existingFailed.meta === "object") ? existingFailed.meta as Record<string, unknown> : {};

    if (existingFailedMeta.published_at) {
      // Post was already published — do NOT reset status
      console.warn(`[publish-callback] Post ${contentId} already published (published_at=${existingFailedMeta.published_at}), ignoring failure callback`);
      return NextResponse.json({ ok: true, note: "Already published, skipping status reset" });
    }

    const failRetryCount = typeof existingFailedMeta.fail_retry_count === "number" ? existingFailedMeta.fail_retry_count + 1 : 1;
    const failedMeta = {
      ...existingFailedMeta,
      last_failed_at: new Date().toISOString(),
      last_failed_error: errorMsg || "Publication échouée",
      fail_retry_count: failRetryCount,
      ...(platform ? { last_failed_platform: platform } : {}),
    };

    // After 5 failed attempts, mark as "failed" to prevent infinite retries
    const newStatus = failRetryCount >= 5 ? "failed" : "scheduled";

    const { error: upErr } = await supabaseAdmin
      .from("content_item")
      .update({ status: newStatus, meta: failedMeta })
      .eq("id", contentId);

    if (upErr && isMissingColumn(upErr.message)) {
      await supabaseAdmin
        .from("content_item")
        .update({ statut: newStatus, meta: failedMeta } as any)
        .eq("id", contentId);
    }
  }

  return NextResponse.json({ ok: true });
}

// ─── Fire-and-forget: run after-comments via shared engine ───────────────────

async function triggerAfterExecution(
  contentId: string,
  userId: string,
  projectId: string | null,
  platform: string,
  postText: string,
  nbAfter: number,
) {
  try {
    let connQuery = supabaseAdmin
      .from("social_connections")
      .select("platform_user_id, access_token_encrypted")
      .eq("user_id", userId)
      .eq("platform", platform);
    if (projectId) connQuery = connQuery.eq("project_id", projectId);

    const { data: conn } = await connQuery.maybeSingle();
    if (!conn?.access_token_encrypted) {
      await supabaseAdmin.from("content_item").update({ auto_comments_status: "completed" }).eq("id", contentId);
      return;
    }

    let accessToken: string;
    try { accessToken = decrypt(conn.access_token_encrypted); } catch {
      await supabaseAdmin.from("content_item").update({ auto_comments_status: "completed" }).eq("id", contentId);
      return;
    }

    const { data: profile } = await supabaseAdmin
      .from("business_profiles")
      .select("auto_comment_style_ton, auto_comment_langage, brand_tone_of_voice, niche")
      .eq("user_id", userId)
      .maybeSingle();

    await runAutoCommentBatch({
      supabaseAdmin,
      contentId,
      userId,
      platform,
      accessToken,
      platformUserId: conn.platform_user_id,
      postText,
      commentType: "after",
      nbComments: nbAfter,
      styleTon: profile?.auto_comment_style_ton || "professionnel",
      niche: profile?.niche || "",
      brandTone: profile?.brand_tone_of_voice || "",
      langage: profile?.auto_comment_langage || {},
    });
  } catch (err) {
    console.error("[publish-callback] triggerAfterExecution error:", err);
    try {
      await supabaseAdmin.from("content_item").update({ auto_comments_status: "completed" }).eq("id", contentId);
    } catch { /* ignore */ }
  }
}
