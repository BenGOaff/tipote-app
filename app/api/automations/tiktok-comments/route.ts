// app/api/automations/tiktok-comments/route.ts
// GET : appelé par n8n (cron) pour poll les commentaires TikTok récents
//       et déclencher les auto-replies sur les mots-clés correspondants.
// Sécurisé par N8N_SHARED_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/crypto";
import { refreshSocialToken } from "@/lib/refreshSocialToken";
import { listVideos, listComments, replyToComment } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Auth par header secret
  const secret = req.headers.get("x-n8n-secret");
  if (!secret || secret !== process.env.N8N_SHARED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: { processed: number; replies: number; errors: number } = {
    processed: 0,
    replies: 0,
    errors: 0,
  };

  try {
    // 1. Récupérer toutes les automatisations TikTok actives
    const { data: automations, error: autoErr } = await supabaseAdmin
      .from("social_automations")
      .select("*")
      .eq("enabled", true)
      .contains("platforms", ["tiktok"]);

    if (autoErr || !automations?.length) {
      return NextResponse.json({ ok: true, ...results, message: "No TikTok automations" });
    }

    // 2. Grouper les automatisations par user_id
    const autosByUser = new Map<string, typeof automations>();
    for (const auto of automations) {
      const userId = auto.user_id;
      if (!autosByUser.has(userId)) autosByUser.set(userId, []);
      autosByUser.get(userId)!.push(auto);
    }

    // 3. Pour chaque user, récupérer le token TikTok et les vidéos récentes
    for (const [userId, userAutos] of autosByUser) {
      let accessToken: string;

      // Récupérer la connexion TikTok
      const { data: conn } = await supabaseAdmin
        .from("social_connections")
        .select("id, platform_user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
        .eq("user_id", userId)
        .eq("platform", "tiktok")
        .maybeSingle();

      if (!conn?.access_token_encrypted) {
        console.warn(`[tiktok-comments] No TikTok connection for user ${userId}`);
        continue;
      }

      // Vérifier / rafraîchir le token
      const REFRESH_BUFFER_MS = 5 * 60 * 1000;
      const isExpired = conn.token_expires_at &&
        new Date(conn.token_expires_at) < new Date(Date.now() + REFRESH_BUFFER_MS);

      if (isExpired) {
        const refreshResult = await refreshSocialToken(conn.id, "tiktok", conn.refresh_token_encrypted ?? null);
        if (!refreshResult.ok || !refreshResult.accessToken) {
          console.error(`[tiktok-comments] Token refresh failed for user ${userId}`);
          continue;
        }
        accessToken = refreshResult.accessToken;
      } else {
        try {
          accessToken = decrypt(conn.access_token_encrypted);
        } catch {
          continue;
        }
      }

      // Récupérer les vidéos récentes (dernières 20)
      const { videos } = await listVideos(accessToken, 20);
      if (videos.length === 0) continue;

      // Pour chaque automatisation de ce user
      for (const auto of userAutos) {
        const keyword = (auto.trigger_keyword ?? "").toUpperCase();
        if (!keyword) continue;

        // Filtrer les vidéos par target_post_url si défini
        const targetVideos = auto.target_post_url
          ? videos.filter((v: any) => v.id === auto.target_post_url)
          : videos;

        if (targetVideos.length === 0) continue;

        // Récupérer le dernier timestamp traité (stocké dans auto.meta.tiktok_last_processed)
        const lastProcessed = (auto.meta as any)?.tiktok_last_processed ?? 0;

        for (const video of targetVideos) {
          const videoId = video.id;
          if (!videoId) continue;

          // Lister les commentaires de cette vidéo
          const { comments } = await listComments(accessToken, videoId, 50);
          results.processed += comments.length;

          // Filtrer les nouveaux commentaires contenant le mot-clé
          const newComments = comments.filter((c) => {
            if (c.create_time <= lastProcessed) return false;
            if (c.parent_comment_id) return false; // ignorer les sous-commentaires
            if (c.user_id === conn.platform_user_id) return false; // ignorer ses propres commentaires
            return c.text.toUpperCase().includes(keyword);
          });

          // Choisir des variantes de réponse
          const variants: string[] = auto.comment_reply_variants?.length
            ? auto.comment_reply_variants
            : [auto.dm_message ?? "Merci pour ton commentaire !"];

          for (const comment of newComments) {
            const replyText = variants[Math.floor(Math.random() * variants.length)];

            // Personnaliser avec le prénom/username
            const firstName = (comment.username ?? "").split(" ")[0] || "";
            const personalizedReply = replyText
              .replace(/\{\{prenom\}\}/gi, firstName)
              .replace(/\{\{firstname\}\}/gi, firstName);

            const replyResult = await replyToComment(
              accessToken,
              videoId,
              comment.id,
              personalizedReply,
            );

            if (replyResult.ok) {
              results.replies++;
            } else {
              results.errors++;
              console.error(`[tiktok-comments] Reply failed for comment ${comment.id}:`, replyResult.error);
            }

            // Petite pause entre les replies pour éviter le rate-limit
            await new Promise((r) => setTimeout(r, 1000));
          }
        }

        // Mettre à jour le dernier timestamp traité
        const nowTimestamp = Math.floor(Date.now() / 1000);
        const currentStats = (auto.stats as Record<string, number>) ?? { triggers: 0, dms_sent: 0 };
        await supabaseAdmin
          .from("social_automations")
          .update({
            stats: {
              triggers: (currentStats.triggers ?? 0) + results.replies,
              dms_sent: (currentStats.dms_sent ?? 0) + results.replies,
            },
            meta: {
              ...(auto.meta as Record<string, unknown> ?? {}),
              tiktok_last_processed: nowTimestamp,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", auto.id);
      }
    }
  } catch (err) {
    console.error("[tiktok-comments] Error:", err);
    results.errors++;
  }

  return NextResponse.json({ ok: true, ...results });
}
