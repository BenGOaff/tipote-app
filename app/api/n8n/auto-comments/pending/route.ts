// app/api/n8n/auto-comments/pending/route.ts
// GET: returns pending auto-comment jobs for n8n to process
// Called by n8n cron workflow every 5 minutes
// Secured via X-N8N-Secret header
//
// Smart timing logic:
// - "before" phase (auto_comments_status = 'pending'):
//     - status = 'draft' → immediate publish, return now
//     - status = 'scheduled' → only return if scheduled_date/time is within ~25 min
// - "after" phase (auto_comments_status = 'after_pending'):
//     - Always return (post is already published)

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MAX_DAILY_COMMENTS_PER_PLATFORM } from "@/lib/automationCredits";

export const dynamic = "force-dynamic";

function isMissingColumn(msg?: string | null) {
  const m = (msg ?? "").toLowerCase();
  return m.includes("does not exist") || (m.includes("column") && m.includes("unknown"));
}

const EN_SELECT =
  "id, user_id, project_id, type, title, content, status, channel, scheduled_date, auto_comments_enabled, nb_comments_before, nb_comments_after, auto_comments_status, meta";
const FR_SELECT =
  "id, user_id, project_id, type, title:titre, content:contenu, status:statut, channel:canal, scheduled_date:date_planifiee, auto_comments_enabled, nb_comments_before, nb_comments_after, auto_comments_status, meta";

function decrypt(encrypted: string): string {
  if (!encrypted) return "";
  const crypto = require("crypto");
  const key = process.env.SOCIAL_ENCRYPTION_KEY;
  if (!key) return "";

  try {
    const buf = Buffer.from(encrypted, "base64");
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(buf.length - 16);
    const ciphertext = buf.subarray(12, buf.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, undefined, "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return "";
  }
}

/** Check if a scheduled post is due within the next `windowMinutes` minutes */
function isWithinWindow(post: any, windowMinutes: number): boolean {
  if (!post.scheduled_date) return false;

  const now = new Date();
  const scheduledTime = post.meta?.scheduled_time as string | undefined;

  // Build full scheduled datetime
  let scheduledDate: Date;
  if (scheduledTime) {
    scheduledDate = new Date(`${post.scheduled_date}T${scheduledTime}:00`);
  } else {
    // No specific time → assume start of day, always within window if date is today or past
    scheduledDate = new Date(`${post.scheduled_date}T00:00:00`);
  }

  // Check if scheduled time is within [now, now + windowMinutes]
  const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);
  return scheduledDate <= windowEnd;
}

export async function GET(req: NextRequest) {
  // Auth check
  const secret = req.headers.get("x-n8n-secret") || "";
  if (!secret || secret !== process.env.N8N_SHARED_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch posts with active auto-comments in any actionable phase (EN/FR schema compat)
    let posts: any[] | null = null;

    const enRes = await supabaseAdmin
      .from("content_item")
      .select(EN_SELECT)
      .eq("auto_comments_enabled", true)
      .in("auto_comments_status", ["pending", "after_pending"])
      .order("created_at", { ascending: true })
      .limit(20);

    if (enRes.error && isMissingColumn(enRes.error.message)) {
      const frRes = await supabaseAdmin
        .from("content_item")
        .select(FR_SELECT)
        .eq("auto_comments_enabled", true)
        .in("auto_comments_status", ["pending", "after_pending"])
        .order("created_at", { ascending: true })
        .limit(20);

      if (frRes.error) {
        console.error("[n8n/auto-comments/pending] query error (FR fallback):", frRes.error);
        return NextResponse.json({ ok: false, error: frRes.error.message }, { status: 500 });
      }
      posts = frRes.data;
    } else if (enRes.error) {
      console.error("[n8n/auto-comments/pending] query error:", enRes.error);
      return NextResponse.json({ ok: false, error: enRes.error.message }, { status: 500 });
    } else {
      posts = enRes.data;
    }

    if (!posts || posts.length === 0) {
      return NextResponse.json({ ok: true, count: 0, jobs: [] });
    }

    const jobs: any[] = [];

    for (const post of posts) {
      const acStatus = post.auto_comments_status;

      // Determine phase and apply timing logic
      let commentType: "before" | "after";
      let nbComments: number;

      if (acStatus === "pending") {
        // BEFORE phase
        if (post.nb_comments_before <= 0) continue;

        // Smart timing for scheduled posts
        if (post.status === "scheduled") {
          // Only return if scheduled time is within ~25 min
          if (!isWithinWindow(post, 25)) continue;
        }
        // For draft (immediate publish): return now

        commentType = "before";
        nbComments = post.nb_comments_before;
      } else if (acStatus === "after_pending") {
        // AFTER phase — post is already published
        if (post.nb_comments_after <= 0) continue;
        commentType = "after";
        nbComments = post.nb_comments_after;
      } else {
        continue;
      }

      // Get user's auto-comment style preferences
      const { data: profile } = await supabaseAdmin
        .from("business_profiles")
        .select("auto_comment_style_ton, auto_comment_langage, auto_comment_objectifs, brand_tone_of_voice, niche")
        .eq("user_id", post.user_id)
        .maybeSingle();

      // Get social connection for the platform
      const postPlatform = post.channel || "";
      const { data: connection } = await supabaseAdmin
        .from("social_connections")
        .select("platform_user_id, access_token_encrypted, token_expires_at")
        .eq("user_id", post.user_id)
        .eq("platform", postPlatform)
        .maybeSingle();

      if (!connection?.access_token_encrypted) continue;

      // Check token expiry
      if (connection.token_expires_at) {
        const expiresAt = new Date(connection.token_expires_at);
        if (expiresAt < new Date()) continue;
      }

      const accessToken = decrypt(connection.access_token_encrypted);
      if (!accessToken) continue;

      jobs.push({
        content_id: post.id,
        user_id: post.user_id,
        project_id: post.project_id,
        platform: postPlatform,
        platform_user_id: connection.platform_user_id,
        access_token: accessToken,
        post_text: post.content || post.title || "",
        post_title: post.title || "",
        comment_type: commentType,
        nb_comments: nbComments,
        style_ton: profile?.auto_comment_style_ton || "professionnel",
        langage: profile?.auto_comment_langage || {},
        objectifs: profile?.auto_comment_objectifs || [],
        brand_tone: profile?.brand_tone_of_voice || "",
        niche: profile?.niche || "",
        max_daily: MAX_DAILY_COMMENTS_PER_PLATFORM,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "https://app.tipote.com"}/api/n8n/auto-comments/log`,
      });
    }

    return NextResponse.json({
      ok: true,
      count: jobs.length,
      jobs,
    });
  } catch (err) {
    console.error("[n8n/auto-comments/pending] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
