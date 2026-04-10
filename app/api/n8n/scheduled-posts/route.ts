// app/api/n8n/scheduled-posts/route.ts
// GET : appele par les workflows cron n8n pour recuperer les posts a publier.
// Retourne les posts "scheduled" dont la date+heure est <= maintenant.
// Securise par N8N_SHARED_SECRET.
// Query param optionnel : ?platform=linkedin|facebook|threads|twitter|pinterest|tiktok

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/crypto";
import { refreshSocialToken } from "@/lib/refreshSocialToken";
import { uploadImageToLinkedIn, publishPost } from "@/lib/linkedin";
import { publishToFacebookPage, publishPhotoToFacebookPage, publishMultiPhotoToFacebookPage, publishVideoToFacebookPage } from "@/lib/meta";

export const dynamic = "force-dynamic";

const SUPPORTED_PLATFORMS = ["linkedin", "facebook", "threads", "twitter", "pinterest", "tiktok"];

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

/**
 * Résout toutes les URLs d'images depuis meta.
 * Retourne un tableau d'URLs (vide si aucune image).
 */
function resolveAllImageUrls(meta: any): string[] {
  if (!meta) return [];
  if (Array.isArray(meta.images) && meta.images.length > 0) {
    return meta.images
      .map((img: any) => (typeof img === "string" ? img : img?.url))
      .filter(Boolean) as string[];
  }
  if (typeof meta.image_url === "string" && meta.image_url.trim()) {
    return [meta.image_url];
  }
  return [];
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

  // Utiliser formatToParts pour un format HH:MM fiable (évite les séparateurs localisés
  // comme "h" en français qui cassent la comparaison avec scheduled_time stocké en "HH:MM")
  const timeParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(parisNow);
  const parisHour = timeParts.find(p => p.type === "hour")?.value ?? "00";
  const parisMinute = timeParts.find(p => p.type === "minute")?.value ?? "00";
  const nowHHMM = `${parisHour}:${parisMinute}`;

  const todayStr = parisDate;

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

  // Convertit "HH:MM" (ou "H:MM") en minutes depuis minuit pour comparaison fiable
  function timeToMinutes(hhmm: string): number {
    const parts = hhmm.split(":");
    const h = parseInt(parts[0] ?? "0", 10);
    const m = parseInt(parts[1] ?? "0", 10);
    return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
  }

  const nowMinutes = timeToMinutes(nowHHMM);

  // Filtrer par heure (si meta.scheduled_time est defini)
  const duePosts = (items ?? []).filter((item) => {
    const scheduledTime = item.meta?.scheduled_time as string | undefined;
    if (!scheduledTime) {
      return true;
    }
    if (item.scheduled_date === todayStr) {
      // Comparaison numérique robuste (insensible au format "7:00" vs "07:00")
      return timeToMinutes(scheduledTime) <= nowMinutes;
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

  // ── Cleanup: Reset posts stuck in "publishing" for over 10 minutes ──
  // If n8n crashes after claiming a post but before calling the callback,
  // the post stays at "publishing" forever. Reset them to "scheduled".
  try {
    const tenMinAgo = new Date(parisNow.getTime() - 10 * 60 * 1000).toISOString();
    const { error: stuckErr } = await supabaseAdmin
      .from("content_item")
      .update({ status: "scheduled" })
      .eq("status", "publishing")
      .lt("updated_at", tenMinAgo);
    if (stuckErr && isMissingColumn(stuckErr.message)) {
      await supabaseAdmin
        .from("content_item")
        .update({ statut: "scheduled" } as any)
        .eq("statut", "publishing")
        .lt("updated_at", tenMinAgo);
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
          conn.refresh_token_encrypted,
          conn.access_token_encrypted,
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

      // Pour LinkedIn : uploader l'image côté app avant d'envoyer à n8n
      // (n8n ne gère pas le process d'upload en 2 étapes de LinkedIn)
      if (imageUrl && platform === "linkedin") {
        try {
          const imageUrn = await uploadImageToLinkedIn(accessToken, conn.platform_user_id, imageUrl);
          postData.image_urn = imageUrn;
          console.log(`[scheduled-posts] LinkedIn image uploaded for post ${post.id}: ${imageUrn}`);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const isGif = imageUrl.toLowerCase().includes(".gif");
          if (isGif) {
            console.warn(`[scheduled-posts] LinkedIn GIF processing failed for post ${post.id}, posting without image. Use PNG/JPG instead. Error: ${errMsg}`);
          } else {
            console.error(`[scheduled-posts] LinkedIn image upload failed for post ${post.id}, posting without image:`, errMsg);
          }
        }
      }

      // Vidéo : passer video_url pour TikTok, Facebook, Instagram
      if (platform === "tiktok" || platform === "facebook" || platform === "instagram") {
        const videoUrl = post.meta?.video_url;
        if (videoUrl) {
          postData.video_url = videoUrl;
        }

        // TikTok et Facebook : inclure toutes les images si disponibles (multi-photos / carrousel)
        if (platform === "tiktok" || platform === "facebook") {
          const allImages = resolveAllImageUrls(post.meta);
          if (allImages.length > 1) {
            postData.images = allImages;
          }
        }

        // TikTok et Instagram nécessitent au moins une image ou une vidéo
        if ((platform === "tiktok" || platform === "instagram") && !videoUrl && !imageUrl) {
          console.warn(
            `[scheduled-posts] ${platform} post ${post.id} skipped: missing video or image`
          );
          return null;
        }
      }

      // Pour Pinterest : titre, board_id et image requis
      if (platform === "pinterest") {
        postData.title = post.title || "";
        postData.board_id = post.meta?.pinterest_board_id ?? null;
        if (post.meta?.pinterest_link) {
          postData.link = post.meta.pinterest_link;
        }
        // Skip post si données manquantes (board_id ou image)
        if (!postData.board_id || !imageUrl) {
          console.warn(
            `[scheduled-posts] Pinterest post ${post.id} skipped: missing board_id or image`
          );
          return null;
        }
      }

      return postData;
    })
  );

  const validPosts = postsWithTokens.filter(Boolean);

  // ── Direct publish: LinkedIn + Facebook ──
  // These platforms are published directly here instead of being returned to n8n.
  // LinkedIn: avoids content truncation in n8n JSON templates.
  // Facebook: avoids dependency on n8n meta-publish workflow which may not be configured.
  const DIRECT_PLATFORMS = ["linkedin", "facebook"];
  const directPosts = validPosts.filter((p: any) => DIRECT_PLATFORMS.includes(p.platform));
  const otherPosts = validPosts.filter((p: any) => !DIRECT_PLATFORMS.includes(p.platform));

  for (const post of directPosts as any[]) {
    const platform = post.platform as string;
    try {
      let result: { ok: boolean; postId?: string; postUrn?: string; error?: string };

      if (platform === "linkedin") {
        result = await publishPost(
          post.access_token,
          post.platform_user_id,
          post.commentary,
          post.image_url,
        );
        if (result.postUrn) result.postId = result.postUrn;
      } else {
        // Facebook: direct Graph API call
        const fbVideoUrl = post.video_url;
        const fbImages: string[] = Array.isArray(post.images) ? post.images : [];
        if (fbVideoUrl) {
          result = await publishVideoToFacebookPage(post.access_token, post.platform_user_id, post.commentary, fbVideoUrl);
        } else if (fbImages.length > 1) {
          result = await publishMultiPhotoToFacebookPage(post.access_token, post.platform_user_id, post.commentary, fbImages);
        } else if (post.image_url) {
          result = await publishPhotoToFacebookPage(post.access_token, post.platform_user_id, post.commentary, post.image_url);
        } else {
          result = await publishToFacebookPage(post.access_token, post.platform_user_id, post.commentary);
        }
      }

      // Build callback payload
      const callbackPayload: Record<string, unknown> = {
        content_id: post.content_id,
        platform,
        success: result.ok,
      };
      const resultId = result.postId ?? result.postUrn;
      if (result.ok && resultId) {
        callbackPayload.postId = resultId;
        if (result.postUrn) callbackPayload.postUrn = result.postUrn;
      } else if (!result.ok) {
        callbackPayload.error = result.error ?? `${platform} API error`;
      }

      // Call the callback endpoint to update status
      const callbackUrl = post.callback_url;
      let callbackOk = false;
      if (callbackUrl) {
        try {
          const cbRes = await fetch(callbackUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-N8N-Secret": process.env.N8N_SHARED_SECRET ?? "",
            },
            body: JSON.stringify(callbackPayload),
          });
          callbackOk = cbRes.ok;
        } catch (err) {
          console.error(`[scheduled-posts] ${platform} callback failed for ${post.content_id}:`, err);
        }
      }

      // Fallback: update status directly if callback failed
      if (!callbackOk) {
        console.warn(`[scheduled-posts] ${platform} callback unreachable for ${post.content_id}, updating status directly`);
        if (result.ok) {
          const meta: Record<string, unknown> = { published_at: new Date().toISOString(), published_platform: platform };
          if (resultId) meta[`${platform}_post_id`] = resultId;
          if (result.postUrn) meta.linkedin_post_urn = result.postUrn;
          // Build post URL for Facebook
          if (platform === "facebook" && resultId) {
            meta.facebook_post_url = `https://www.facebook.com/${resultId}`;
          }
          await supabaseAdmin
            .from("content_item")
            .update({ status: "published", meta } as any)
            .eq("id", post.content_id);
        } else {
          await supabaseAdmin
            .from("content_item")
            .update({ status: "scheduled" } as any)
            .eq("id", post.content_id);
        }
      }

      console.log(`[scheduled-posts] ${platform} direct publish for ${post.content_id}: ok=${result.ok}, id=${resultId ?? "none"}`);
    } catch (err) {
      console.error(`[scheduled-posts] ${platform} direct publish error for ${post.content_id}:`, err);
      try {
        await supabaseAdmin
          .from("content_item")
          .update({ status: "scheduled" })
          .eq("id", post.content_id);
      } catch { /* ignore */ }
    }
  }

  // ── Lock: mark returned posts as "publishing" (only if RPC was not used) ──
  if (!usedAtomicClaim && otherPosts.length > 0) {
    const ids = otherPosts.map((p: any) => p.content_id).filter(Boolean);
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

  console.log(`[scheduled-posts] platform=${platformFilter ?? "all"} today=${todayStr} now=${nowHHMM} claimed=${(items ?? []).length} due=${duePosts.length} valid=${validPosts.length} direct=${directPosts.length} other_via_n8n=${otherPosts.length}`);

  // Ne retourner que les posts non-direct (les LinkedIn+Facebook sont déjà publiés)
  return NextResponse.json({
    ok: true,
    count: otherPosts.length,
    posts: otherPosts,
  });
}
