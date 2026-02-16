// app/api/n8n/publish-callback/route.ts
// POST : appele par n8n apres publication d'un post.
// Met a jour le statut du content_item.
// Body : { content_id, platform?, success, postUrn?, postId?, error? }

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function isMissingColumn(msg?: string | null) {
  const m = (msg ?? "").toLowerCase();
  return m.includes("column") && (m.includes("does not exist") || m.includes("unknown"));
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
    // This triggers the "after" phase of auto-comments for scheduled posts
    await supabaseAdmin
      .from("content_item")
      .update({ auto_comments_status: "after_pending" })
      .eq("id", contentId)
      .eq("auto_comments_enabled", true)
      .eq("auto_comments_status", "before_done");
  } else {
    console.error(`n8n publish failed for ${contentId} (${platform ?? "unknown"}): ${errorMsg}`);
    // Mark as failed — merge meta to preserve images
    const { data: existingFailed } = await supabaseAdmin
      .from("content_item")
      .select("meta")
      .eq("id", contentId)
      .single();

    const existingFailedMeta = (existingFailed?.meta && typeof existingFailed.meta === "object") ? existingFailed.meta as Record<string, unknown> : {};
    const failedMeta = {
      ...existingFailedMeta,
      failed_at: new Date().toISOString(),
      failed_error: errorMsg || "Publication échouée",
      ...(platform ? { failed_platform: platform } : {}),
    };

    const { error: upErr } = await supabaseAdmin
      .from("content_item")
      .update({ status: "failed", meta: failedMeta })
      .eq("id", contentId);

    if (upErr && isMissingColumn(upErr.message)) {
      await supabaseAdmin
        .from("content_item")
        .update({ statut: "failed", meta: failedMeta } as any)
        .eq("id", contentId);
    }
  }

  return NextResponse.json({ ok: true });
}
