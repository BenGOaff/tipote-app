// app/api/n8n/scheduled-posts/route.ts
// GET : appelé par le workflow cron n8n pour récupérer les posts à publier.
// Retourne les posts "scheduled" dont la date+heure est <= maintenant.
// Sécurisé par N8N_SHARED_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Auth par header secret
  const secret = req.headers.get("x-n8n-secret");
  if (!secret || secret !== process.env.N8N_SHARED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const nowHHMM = now.toTimeString().slice(0, 5); // HH:MM

  // Récupérer les posts scheduled avec date <= aujourd'hui
  // On filtre ensuite côté serveur pour l'heure (meta->scheduled_time)
  const { data: items, error } = await supabaseAdmin
    .from("content_item")
    .select("id, user_id, project_id, title, content, status, scheduled_date, channel, type, meta")
    .eq("status", "scheduled")
    .lte("scheduled_date", todayStr)
    .not("content", "is", null)
    .order("scheduled_date", { ascending: true })
    .limit(50);

  if (error) {
    console.error("scheduled-posts query error:", error);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  // Filtrer par heure (si meta.scheduled_time est défini)
  const duePosts = (items ?? []).filter((item) => {
    const scheduledTime = item.meta?.scheduled_time as string | undefined;
    if (!scheduledTime) {
      // Pas d'heure définie → publiable dès que la date est passée
      return item.scheduled_date! < todayStr || true;
    }
    // La date est aujourd'hui : vérifier l'heure
    if (item.scheduled_date === todayStr) {
      return scheduledTime <= nowHHMM;
    }
    // La date est passée : publier
    return true;
  });

  // Pour chaque post, récupérer le token LinkedIn du user
  const postsWithTokens = await Promise.all(
    duePosts.map(async (post) => {
      // Chercher la connexion LinkedIn pour ce user+project
      let query = supabaseAdmin
        .from("social_connections")
        .select("platform_user_id, access_token_encrypted, token_expires_at")
        .eq("user_id", post.user_id)
        .eq("platform", "linkedin");

      if (post.project_id) {
        query = query.eq("project_id", post.project_id);
      }

      const { data: conn } = await query.single();

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

      return {
        content_id: post.id,
        user_id: post.user_id,
        platform: "linkedin",
        person_id: conn.platform_user_id,
        access_token: accessToken,
        commentary: post.content,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/n8n/publish-callback`,
      };
    })
  );

  const validPosts = postsWithTokens.filter(Boolean);

  return NextResponse.json({
    ok: true,
    count: validPosts.length,
    posts: validPosts,
  });
}
