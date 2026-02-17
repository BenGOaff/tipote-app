// app/api/n8n/scheduled-posts/route.ts
// GET : appele par les workflows cron n8n pour recuperer les posts a publier.
// Retourne les posts "scheduled" dont la date+heure est <= maintenant.
// Securise par N8N_SHARED_SECRET.
// Query param optionnel : ?platform=linkedin|facebook|threads|twitter|reddit

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/crypto";
import { refreshSocialToken } from "@/lib/refreshSocialToken";

export const dynamic = "force-dynamic";

const SUPPORTED_PLATFORMS = ["linkedin", "facebook", "threads", "twitter", "reddit"];

/**
 * Résout l'URL de la première image depuis meta.
 * Supporte le nouveau format (meta.images[]) et l'ancien (meta.image_url).
 */
function resolveImageUrl(meta: any): string | undefined {
  if (!meta) return undefined;
  if (Array.isArray(meta.images) && meta.images.length > 0) {
    const first = meta.images[0];
    if (typeof first === "string") return first;
    if (first?.url) return first.url;
  }
  if (typeof meta.image_url === "string" && meta.image_url.trim()) {
    return meta.image_url;
  }
  return undefined;
}

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

export async function GET(req: NextRequest) {
  // Auth par header secret
  const secret = req.headers.get("x-n8n-secret");
  if (!secret || secret !== process.env.N8N_SHARED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Filtrer par plateforme si specifie
  const url = new URL(req.url);
  const platformFilter = url.searchParams.get("platform");

  // ── Use Europe/Paris timezone (users set times in their local tz) ──
  const parisNow = new Date();
  const parisDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(parisNow); // YYYY-MM-DD
  const parisTime = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).format(parisNow); // HH:MM

  const todayStr = parisDate;
  const nowHHMM = parisTime;

  // --- Atomic claim: fetch + lock scheduled posts in one transaction ---
  // Uses RPC claim_scheduled_posts() with FOR UPDATE SKIP LOCKED to prevent
  // race conditions between overlapping cron runs.
  // Falls back to non-atomic SELECT+UPDATE if the RPC doesn't exist yet.
  const EN_SELECT = "id, user_id, project_id, title, content, status, scheduled_date, channel, type, meta";
  const FR_SELECT = "id, user_id, project_id, title:titre, content:contenu, status:statut, scheduled_date:date_planifiee, channel:canal, type, meta";

  let items: any[] | null = null;
  let usedAtomicClaim = false;

  // Try atomic RPC first
  const rpcParams: Record<string, unknown> = { p_today: todayStr, p_limit: 50 };
  if (platformFilter && SUPPORTED_PLATFORMS.includes(platformFilter)) {
    rpcParams.p_platform = platformFilter;
  }

  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc("claim_scheduled_posts", rpcParams);

  if (!rpcError && rpcData) {
    // RPC succeeded — posts are already locked as "publishing"
    usedAtomicClaim = true;
    // Normalize FR column names to EN for downstream code
    items = (rpcData as any[]).map((row: any) => ({
      ...row,
      title: row.titre ?? row.title,
      content: row.contenu ?? row.content,
      status: row.statut ?? row.status,
      scheduled_date: row.date_planifiee ?? row.scheduled_date,
      channel: row.canal ?? row.channel,
    }));
  } else {
    // RPC not available — fallback to non-atomic SELECT (+ lock after)
    if (rpcError) {
      console.warn("[scheduled-posts] claim_scheduled_posts RPC unavailable, using fallback:", rpcError.message);
    }

    // Essai 1 : colonnes EN
    {
      let query = supabaseAdmin
        .from("content_item")
        .select(EN_SELECT)
        .eq("status", "scheduled")
        .lte("scheduled_date", todayStr)
        .not("content", "is", null)
        .order("scheduled_date", { ascending: true })
        .limit(50);

      if (platformFilter && SUPPORTED_PLATFORMS.includes(platformFilter)) {
        query = query.eq("channel", platformFilter);
      }

      const { data, error } = await query;

      if (!error) {
        items = data;
      } else if (isMissingColumn(error.message)) {
        // Essai 2 : colonnes FR
        let queryFR = supabaseAdmin
          .from("content_item")
          .select(FR_SELECT)
          .eq("statut", "scheduled")
          .lte("date_planifiee", todayStr)
          .not("contenu", "is", null)
          .order("date_planifiee", { ascending: true })
          .limit(50);

        if (platformFilter && SUPPORTED_PLATFORMS.includes(platformFilter)) {
          queryFR = queryFR.eq("canal", platformFilter);
        }

        const { data: dataFR, error: errorFR } = await queryFR;

        if (errorFR) {
          console.error("scheduled-posts query error (FR fallback):", errorFR);
          return NextResponse.json({ error: "DB error" }, { status: 500 });
        }
        items = dataFR;
      } else {
        console.error("scheduled-posts query error:", error);
        return NextResponse.json({ error: "DB error" }, { status: 500 });
      }
    }
  }

  // Filtrer par heure (si meta.scheduled_time est defini)
  const duePosts = (items ?? []).filter((item) => {
    const scheduledTime = item.meta?.scheduled_time as string | undefined;
    if (!scheduledTime) {
      return true;
    }
    if (item.scheduled_date === todayStr) {
      return scheduledTime <= nowHHMM;
    }
    return true;
  });

  // ── Fix: Release posts that were claimed by the RPC but are not yet due ──
  // The atomic RPC claims all posts for today regardless of time. Posts whose
  // scheduled_time hasn't been reached yet must be reset back to "scheduled"
  // so they'll be picked up on the next cron run when the time is right.
  if (usedAtomicClaim && items && duePosts.length < items.length) {
    const dueIds = new Set(duePosts.map((p: any) => p.id));
    const notDueIds = (items as any[]).filter((p: any) => !dueIds.has(p.id)).map((p: any) => p.id);
    if (notDueIds.length > 0) {
      console.log(`[scheduled-posts] Releasing ${notDueIds.length} post(s) not yet due (time not reached)`);
      const { error: releaseErr } = await supabaseAdmin
        .from("content_item")
        .update({ status: "scheduled" })
        .in("id", notDueIds);
      if (releaseErr && isMissingColumn(releaseErr.message)) {
        await supabaseAdmin
          .from("content_item")
          .update({ statut: "scheduled" } as any)
          .in("id", notDueIds);
      }
    }
  }

  // ── Cleanup: Reset posts stuck in "publishing" for over 30 minutes ──
  // If n8n crashes after claiming a post but before calling the callback,
  // the post stays at "publishing" forever. Reset them to "scheduled".
  try {
    const thirtyMinAgo = new Date(parisNow.getTime() - 30 * 60 * 1000).toISOString();
    const { error: stuckErr } = await supabaseAdmin
      .from("content_item")
      .update({ status: "scheduled" })
      .eq("status", "publishing")
      .lt("updated_at", thirtyMinAgo);
    if (stuckErr && isMissingColumn(stuckErr.message)) {
      await supabaseAdmin
        .from("content_item")
        .update({ statut: "scheduled" } as any)
        .eq("statut", "publishing")
        .lt("updated_at", thirtyMinAgo);
    }
  } catch (err) {
    console.warn("[scheduled-posts] Stuck cleanup error:", err);
  }

  // Pour chaque post, recuperer le token de la plateforme correspondante
  const postsWithTokens = await Promise.all(
    duePosts.map(async (post) => {
      // Determiner la plateforme a partir du channel ou du filter
      const platform = post.channel ?? platformFilter ?? "linkedin";

      if (!SUPPORTED_PLATFORMS.includes(platform)) return null;

      // Chercher la connexion pour ce user+project+platform
      let connQuery = supabaseAdmin
        .from("social_connections")
        .select("id, platform_user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
        .eq("user_id", post.user_id)
        .eq("platform", platform);

      if (post.project_id) {
        connQuery = connQuery.eq("project_id", post.project_id);
      }

      const { data: conn } = await connQuery.single();

      if (!conn) return null;

      let accessToken: string;

      // If token is expired, try to refresh it
      if (conn.token_expires_at && new Date(conn.token_expires_at) < parisNow) {
        const refreshResult = await refreshSocialToken(
          conn.id,
          platform,
          conn.refresh_token_encrypted
        );
        if (!refreshResult.ok || !refreshResult.accessToken) {
          console.error(`[scheduled-posts] Token refresh failed for ${platform} user ${post.user_id}: ${refreshResult.error}`);
          return null;
        }
        accessToken = refreshResult.accessToken;
      } else {
        try {
          accessToken = decrypt(conn.access_token_encrypted);
        } catch {
          return null;
        }
      }

      // Résoudre l'image : meta.images[] (nouveau format) ou meta.image_url (legacy)
      const imageUrl = resolveImageUrl(post.meta);

      const postData: Record<string, unknown> = {
        content_id: post.id,
        user_id: post.user_id,
        platform,
        platform_user_id: conn.platform_user_id,
        person_id: conn.platform_user_id, // alias pour les workflows LinkedIn qui utilisent person_id
        access_token: accessToken,
        commentary: post.content,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/n8n/publish-callback`,
      };

      // Ajouter l'image pour toutes les plateformes qui la supportent
      if (imageUrl) {
        postData.image_url = imageUrl;
      }

      // Pour Reddit, le titre est obligatoire
      if (platform === "reddit") {
        postData.title = post.title || "Post depuis Tipote";
      }

      return postData;
    })
  );

  const validPosts = postsWithTokens.filter(Boolean);

  // ── Lock: mark returned posts as "publishing" (only if RPC was not used) ──
  if (!usedAtomicClaim && validPosts.length > 0) {
    const ids = validPosts.map((p: any) => p.content_id).filter(Boolean);
    if (ids.length > 0) {
      // Try EN column first, then FR fallback
      const { error: lockErr } = await supabaseAdmin
        .from("content_item")
        .update({ status: "publishing" })
        .in("id", ids);

      if (lockErr && isMissingColumn(lockErr.message)) {
        await supabaseAdmin
          .from("content_item")
          .update({ statut: "publishing" } as any)
          .in("id", ids);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    count: validPosts.length,
    posts: validPosts,
  });
}