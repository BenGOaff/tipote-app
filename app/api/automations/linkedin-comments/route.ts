// app/api/automations/linkedin-comments/route.ts
// GET : appelé par n8n (cron) pour poll les commentaires LinkedIn récents
//       et déclencher les auto-replies sur les mots-clés correspondants.
//
// Flow :
//   1. Récupère toutes les automations LinkedIn actives
//   2. Pour chaque automation :
//      - Si target_post_url défini → fetch les commentaires de ce post
//      - Sinon → fetch les posts récents du user, puis leurs commentaires
//   3. Matche les mots-clés
//   4. Répond au commentaire (public, nested reply)
//   5. Met à jour les stats et le dernier commentaire traité
//
// Sécurisé par N8N_SHARED_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/crypto";
import { refreshSocialToken } from "@/lib/refreshSocialToken";
import {
  getMyPosts,
  getPostComments,
  replyToLinkedInComment,
  type LinkedInComment,
} from "@/lib/linkedin";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 min max

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-n8n-secret") ?? req.headers.get("x-cron-secret");
  if (!secret || (secret !== process.env.N8N_SHARED_SECRET && secret !== process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = { processed: 0, replies: 0, errors: 0 };
  const debug: string[] = [];

  try {
    // 1. Récupérer toutes les automatisations LinkedIn actives
    const { data: automations, error: autoErr } = await supabaseAdmin
      .from("social_automations")
      .select("*")
      .eq("enabled", true)
      .contains("platforms", ["linkedin"]);

    if (autoErr) {
      debug.push(`DB error: ${autoErr.message}`);
      return NextResponse.json({ ok: false, ...results, debug });
    }

    if (!automations?.length) {
      debug.push("No active LinkedIn automations found");
      return NextResponse.json({ ok: true, ...results, debug });
    }

    debug.push(`Found ${automations.length} active automation(s)`);

    // 2. Grouper par user_id
    const autosByUser = new Map<string, typeof automations>();
    for (const auto of automations) {
      if (!autosByUser.has(auto.user_id)) autosByUser.set(auto.user_id, []);
      autosByUser.get(auto.user_id)!.push(auto);
    }

    // 3. Pour chaque user
    for (const [userId, userAutos] of autosByUser) {
      // Récupérer la connexion LinkedIn
      const { data: conn } = await supabaseAdmin
        .from("social_connections")
        .select("id, platform_user_id, platform_username, access_token_encrypted, refresh_token_encrypted, token_expires_at")
        .eq("user_id", userId)
        .eq("platform", "linkedin")
        .maybeSingle();

      if (!conn?.access_token_encrypted) {
        debug.push(`User ${userId.slice(0, 8)}…: no LinkedIn connection`);
        continue;
      }

      // Vérifier / rafraîchir le token
      let accessToken: string;
      const REFRESH_BUFFER_MS = 5 * 60 * 1000;
      const isExpired =
        conn.token_expires_at &&
        new Date(conn.token_expires_at) < new Date(Date.now() + REFRESH_BUFFER_MS);

      if (isExpired) {
        const refreshResult = await refreshSocialToken(conn.id, "linkedin", conn.refresh_token_encrypted ?? null);
        if (!refreshResult.ok || !refreshResult.accessToken) {
          debug.push(`User ${userId.slice(0, 8)}…: token refresh failed`);
          continue;
        }
        accessToken = refreshResult.accessToken;
      } else {
        try {
          accessToken = decrypt(conn.access_token_encrypted);
        } catch {
          debug.push(`User ${userId.slice(0, 8)}…: token decryption failed`);
          continue;
        }
      }

      const personUrn = `urn:li:person:${conn.platform_user_id}`;
      debug.push(`User ${userId.slice(0, 8)}…: connection OK`);

      // Pour chaque automatisation
      for (const auto of userAutos) {
        const keyword = (auto.trigger_keyword ?? "").toUpperCase();
        if (!keyword) {
          debug.push(`  Auto ${auto.id.slice(0, 8)}…: no keyword, skipping`);
          continue;
        }

        debug.push(`  Auto ${auto.id.slice(0, 8)}… "${auto.name}": keyword="${keyword}"`);

        // Récupérer le meta pour le tracking
        const meta = (auto.meta as Record<string, unknown>) ?? {};
        const processedIds = new Set<string>(
          Array.isArray(meta.li_processed_ids) ? (meta.li_processed_ids as string[]) : [],
        );

        // Déterminer les posts à scanner
        let postsToScan: Array<{ urn: string; text: string }> = [];

        if (auto.target_post_url?.trim()) {
          // Post spécifique
          postsToScan = [{ urn: auto.target_post_url.trim(), text: "" }];
          debug.push(`    Target post: ${auto.target_post_url}`);
        } else {
          // Tous les posts récents (derniers 10)
          try {
            const myPosts = await getMyPosts(accessToken, conn.platform_user_id, 10);
            postsToScan = myPosts.map((p) => ({ urn: p.urn, text: p.text }));
            debug.push(`    Scanning ${postsToScan.length} recent posts`);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            debug.push(`    getMyPosts failed: ${errMsg}`);
            results.errors++;
            continue;
          }
        }

        if (!postsToScan.length) {
          debug.push(`    No posts to scan`);
          continue;
        }

        // Pour chaque post, scanner les commentaires
        for (const post of postsToScan) {
          let comments: LinkedInComment[];
          try {
            comments = await getPostComments(accessToken, post.urn, 50);
            results.processed += comments.length;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            debug.push(`    getPostComments(${post.urn}) failed: ${errMsg}`);
            results.errors++;
            continue;
          }

          if (!comments.length) continue;

          // Filtrer les nouveaux commentaires contenant le mot-clé
          const newComments = comments.filter((c) => {
            if (processedIds.has(c.id)) return false;
            if (c.parentCommentUrn) return false; // ignorer les sous-commentaires (replies)
            if (c.actorUrn === personUrn) return false; // ignorer ses propres commentaires
            return c.message.toUpperCase().includes(keyword);
          });

          if (!newComments.length) continue;

          debug.push(`    Post ${post.urn.slice(0, 30)}…: ${newComments.length} new matching comment(s)`);

          // Choisir des variantes de réponse
          const variants: string[] = auto.comment_reply_variants?.length
            ? auto.comment_reply_variants
            : ["Merci pour ton commentaire ! 🙏"];

          for (const comment of newComments) {
            // Dedup: re-check from DB
            const { data: freshAuto } = await supabaseAdmin
              .from("social_automations")
              .select("meta")
              .eq("id", auto.id)
              .single();

            const freshMeta = (freshAuto?.meta as Record<string, unknown>) ?? {};
            const freshProcessed: string[] = Array.isArray(freshMeta.li_processed_ids)
              ? (freshMeta.li_processed_ids as string[])
              : [];

            if (freshProcessed.includes(comment.id)) {
              debug.push(`    SKIP ${comment.id.slice(0, 20)}… (already processed)`);
              continue;
            }

            // Marquer comme traité AVANT d'envoyer (évite les doublons)
            const updatedIds = [...freshProcessed, comment.id].slice(-200);
            await supabaseAdmin
              .from("social_automations")
              .update({
                meta: {
                  ...freshMeta,
                  li_last_processed: Math.floor(Date.now() / 1000),
                  li_processed_ids: updatedIds,
                },
                updated_at: new Date().toISOString(),
              })
              .eq("id", auto.id);

            // Personnaliser la réponse
            const replyText = variants[Math.floor(Math.random() * variants.length)];

            // Répondre au commentaire (nested reply)
            const replyResult = await replyToLinkedInComment(
              accessToken,
              post.urn,
              comment.id,
              personUrn,
              replyText,
            );

            if (replyResult.ok) {
              results.replies++;
              debug.push(`    Reply sent to ${comment.id.slice(0, 20)}…`);
            } else {
              results.errors++;
              debug.push(`    Reply FAILED: ${replyResult.error?.slice(0, 200)}`);
            }

            // Pause entre les replies (rate-limit LinkedIn)
            await new Promise((r) => setTimeout(r, 2000));
          }
        }

        // Mettre à jour les stats
        const currentStats = (auto.stats as Record<string, number>) ?? { triggers: 0, dms_sent: 0 };
        if (results.replies > 0) {
          await supabaseAdmin
            .from("social_automations")
            .update({
              stats: {
                triggers: (currentStats.triggers ?? 0) + results.replies,
                dms_sent: currentStats.dms_sent ?? 0,
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", auto.id);
        }
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    debug.push(`Top-level error: ${errMsg}`);
    results.errors++;
  }

  return NextResponse.json({ ok: true, ...results, debug });
}
