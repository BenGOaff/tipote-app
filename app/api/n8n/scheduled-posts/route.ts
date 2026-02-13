// app/api/n8n/scheduled-posts/route.ts
// GET : appele par les workflows cron n8n pour recuperer les posts a publier.
// Retourne les posts "scheduled" dont la date+heure est <= maintenant.
// Securise par N8N_SHARED_SECRET.
// Query param optionnel : ?platform=linkedin|facebook|threads (defaut: tous)

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const SUPPORTED_PLATFORMS = ["linkedin", "facebook", "threads"];

export async function GET(req: NextRequest) {
  // Auth par header secret
  const secret = req.headers.get("x-n8n-secret");
  if (!secret || secret !== process.env.N8N_SHARED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Filtrer par plateforme si spécifié
  const url = new URL(req.url);
  const platformFilter = url.searchParams.get("platform");

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const nowHHMM = now.toTimeString().slice(0, 5); // HH:MM

  // Récupérer les posts scheduled avec date <= aujourd'hui
  let query = supabaseAdmin
    .from("content_item")
    .select("id, user_id, project_id, title, content, status, scheduled_date, channel, type, meta")
    .eq("status", "scheduled")
    .lte("scheduled_date", todayStr)
    .not("content", "is", null)
    .order("scheduled_date", { ascending: true })
    .limit(50);

  // Filtrer par channel/platform si demandé
  if (platformFilter && SUPPORTED_PLATFORMS.includes(platformFilter)) {
    query = query.eq("channel", platformFilter);
  }

  const { data: items, error } = await query;

  if (error) {
    console.error("scheduled-posts query error:", error);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  // Filtrer par heure (si meta.scheduled_time est défini)
  const duePosts = (items ?? []).filter((item) => {
    const scheduledTime = item.meta?.scheduled_time as string | undefined;
    if (!scheduledTime) {
      return item.scheduled_date! < todayStr || true;
    }
    if (item.scheduled_date === todayStr) {
      return scheduledTime <= nowHHMM;
    }
    return true;
  });

  // Pour chaque post, récupérer le token de la plateforme correspondante
  const postsWithTokens = await Promise.all(
    duePosts.map(async (post) => {
      // Déterminer la plateforme à partir du channel ou du filter
      const platform = post.channel ?? platformFilter ?? "linkedin";

      if (!SUPPORTED_PLATFORMS.includes(platform)) return null;

      // Chercher la connexion pour ce user+project+platform
      let connQuery = supabaseAdmin
        .from("social_connections")
        .select("platform_user_id, access_token_encrypted, token_expires_at")
        .eq("user_id", post.user_id)
        .eq("platform", platform);

      if (post.project_id) {
        connQuery = connQuery.eq("project_id", post.project_id);
      }

      const { data: conn } = await connQuery.single();

      if (!conn) return null;

      // Vérifier expiration
      if (conn.token_expires_at && new Date(conn.token_expires_at) < now) {
        return null; // Token expiré, skip
      }

      let accessToken: string;
      try {
        accessToken = decrypt(conn.access_token_encrypted);
      } catch {
        return null;
      }

      const postData: Record<string, unknown> = {
        content_id: post.id,
        user_id: post.user_id,
        platform,
        platform_user_id: conn.platform_user_id,
        access_token: accessToken,
        commentary: post.content,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/n8n/publish-callback`,
      };

      // Pour Facebook, inclure l'image_url si presente
      if (platform === "facebook" && post.meta?.image_url) {
        postData.image_url = post.meta.image_url;
      }

      // Pour Threads, inclure l'image_url si presente (optionnel, Threads supporte le texte seul)
      if (platform === "threads" && post.meta?.image_url) {
        postData.image_url = post.meta.image_url;
      }

      return postData;
    })
  );

  const validPosts = postsWithTokens.filter(Boolean);

  return NextResponse.json({
    ok: true,
    count: validPosts.length,
    posts: validPosts,
  });
}
