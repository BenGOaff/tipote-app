// app/api/automations/twitter-comments/route.ts
// GET : appelé par n8n (cron) pour poll les replies sur les tweets X/Twitter
//       et déclencher le comment-to-DM automation.
//
// Flow :
//   1. Récupère toutes les automations Twitter actives
//   2. Pour chaque automation avec un target_post (tweet URL/ID) :
//      - Fetch les replies via l'API interne Twitter (scraping cookies)
//      - Matche les mots-clés
//      - Répond au tweet (public) via API v2 officielle
//      - Envoie un DM via l'API interne Twitter
//   3. Met à jour les stats et le dernier commentaire traité
//
// Sécurisé par N8N_SHARED_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/crypto";
import {
  getTweetReplies,
  replyToTweet,
  sendTwitterDM,
  sendTwitterDMv2,
  extractTweetId,
} from "@/lib/twitterScraper";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 min max

export async function GET(req: NextRequest) {
  const secret =
    req.headers.get("x-n8n-secret") ?? req.headers.get("x-cron-secret");
  if (
    !secret ||
    (secret !== process.env.N8N_SHARED_SECRET &&
      secret !== process.env.CRON_SECRET)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = { processed: 0, replies: 0, dms_sent: 0, errors: 0 };
  const debug: string[] = [];

  try {
    // 1. Vérifier que les cookies Twitter sont configurés
    if (!process.env.TWITTER_AUTH_TOKEN || !process.env.TWITTER_CT0) {
      debug.push("TWITTER_AUTH_TOKEN or TWITTER_CT0 not set — scraping disabled");
      return NextResponse.json({ ok: false, ...results, debug });
    }

    // 2. Récupérer toutes les automatisations Twitter actives
    const { data: automations, error: autoErr } = await supabaseAdmin
      .from("social_automations")
      .select("*")
      .eq("enabled", true)
      .contains("platforms", ["twitter"]);

    if (autoErr) {
      debug.push(`DB error: ${autoErr.message}`);
      return NextResponse.json({ ok: false, ...results, debug });
    }

    if (!automations?.length) {
      debug.push("No active Twitter automations found");
      return NextResponse.json({ ok: true, ...results, debug });
    }

    debug.push(`Found ${automations.length} active automation(s)`);

    // 3. Grouper par user_id
    const autosByUser = new Map<string, typeof automations>();
    for (const auto of automations) {
      if (!autosByUser.has(auto.user_id)) autosByUser.set(auto.user_id, []);
      autosByUser.get(auto.user_id)!.push(auto);
    }

    // 4. Pour chaque user
    for (const [userId, userAutos] of autosByUser) {
      // Récupérer la connexion Twitter (pour le token OAuth v2 — utilisé pour les replies officielles)
      const { data: conn } = await supabaseAdmin
        .from("social_connections")
        .select(
          "id, platform_user_id, platform_username, access_token_encrypted, token_expires_at",
        )
        .eq("user_id", userId)
        .eq("platform", "twitter")
        .maybeSingle();

      if (!conn?.access_token_encrypted) {
        debug.push(
          `User ${userId.slice(0, 8)}…: no Twitter connection found`,
        );
        continue;
      }

      let accessToken: string;
      try {
        accessToken = decrypt(conn.access_token_encrypted);
      } catch {
        debug.push(`User ${userId.slice(0, 8)}…: token decryption failed`);
        continue;
      }

      const twitterUserId = conn.platform_user_id;
      const twitterUsername = (conn.platform_username ?? "").replace("@", "");
      debug.push(
        `User ${userId.slice(0, 8)}…: connection OK (tw_id=${twitterUserId}, @${twitterUsername})`,
      );

      // Pour chaque automatisation
      for (const auto of userAutos) {
        const keyword = (auto.trigger_keyword ?? "").toUpperCase();
        if (!keyword) {
          debug.push(
            `  Auto ${auto.id.slice(0, 8)}…: no keyword, skipping`,
          );
          continue;
        }

        const targetPostUrl = auto.target_post_url?.trim();
        if (!targetPostUrl) {
          debug.push(
            `  Auto ${auto.id.slice(0, 8)}…: no target post URL, skipping`,
          );
          continue;
        }

        const tweetId = extractTweetId(targetPostUrl);
        if (!tweetId) {
          debug.push(
            `  Auto ${auto.id.slice(0, 8)}…: invalid tweet URL "${targetPostUrl}"`,
          );
          continue;
        }

        debug.push(
          `  Auto ${auto.id.slice(0, 8)}… "${auto.name}": keyword="${keyword}", tweet=${tweetId}`,
        );

        // Tracking
        const meta = (auto.meta as Record<string, unknown>) ?? {};
        const processedIds = new Set<string>(
          Array.isArray(meta.tw_processed_ids)
            ? (meta.tw_processed_ids as string[])
            : [],
        );

        // Fetch replies
        let replies: Awaited<ReturnType<typeof getTweetReplies>>;
        try {
          replies = await getTweetReplies(tweetId);
          results.processed += replies.length;
          debug.push(`    Fetched ${replies.length} reply(ies)`);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          debug.push(`    getTweetReplies failed: ${errMsg.slice(0, 300)}`);
          results.errors++;
          continue;
        }

        if (!replies.length) {
          debug.push(`    No replies found`);
          continue;
        }

        // Filtrer les nouveaux commentaires contenant le mot-clé
        const newReplies = replies.filter((r) => {
          if (processedIds.has(r.id)) return false;
          // Ignorer ses propres tweets
          if (twitterUserId && r.authorId === twitterUserId) return false;
          if (
            twitterUsername &&
            r.authorUsername.toLowerCase() === twitterUsername.toLowerCase()
          )
            return false;
          // Vérifier le mot-clé
          return r.text.toUpperCase().includes(keyword);
        });

        if (!newReplies.length) {
          debug.push(
            `    No NEW matching replies (keyword="${keyword}")`,
          );
          if (replies.length > 0) {
            const sample = replies
              .slice(0, 3)
              .map(
                (r) =>
                  `"${r.text.slice(0, 50)}" by @${r.authorUsername}`,
              );
            debug.push(`    Sample: ${sample.join(" | ")}`);
          }
          continue;
        }

        debug.push(
          `    Found ${newReplies.length} new matching reply(ies)!`,
        );

        let dmsSent = 0;
        let repliesSent = 0;

        for (const reply of newReplies) {
          // ── DEDUP: re-read meta from DB ──
          const { data: freshAuto } = await supabaseAdmin
            .from("social_automations")
            .select("meta")
            .eq("id", auto.id)
            .single();

          const freshMeta =
            (freshAuto?.meta as Record<string, unknown>) ?? {};
          const freshProcessed: string[] = Array.isArray(
            freshMeta.tw_processed_ids,
          )
            ? (freshMeta.tw_processed_ids as string[])
            : [];

          if (freshProcessed.includes(reply.id)) {
            debug.push(
              `    SKIP ${reply.id} (already processed — fresh DB check)`,
            );
            continue;
          }

          // ── MARK AS PROCESSED BEFORE sending (prevents duplicates) ──
          const updatedIds = [...freshProcessed, reply.id].slice(-200);
          await supabaseAdmin
            .from("social_automations")
            .update({
              meta: {
                ...freshMeta,
                tw_last_processed: Math.floor(Date.now() / 1000),
                tw_processed_ids: updatedIds,
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", auto.id);

          const firstName = extractFirstName(
            reply.authorName || reply.authorUsername,
          );

          // a) Répondre au tweet (public) via API v2 officielle
          if (auto.comment_reply_variants?.length) {
            const variants: string[] = auto.comment_reply_variants;
            const replyText = personalize(
              variants[Math.floor(Math.random() * variants.length)],
              { prenom: firstName, firstname: firstName, username: reply.authorUsername },
            );

            const replyResult = await replyToTweet(
              accessToken,
              reply.id,
              replyText,
            );

            if (replyResult.ok) {
              repliesSent++;
              results.replies++;
              debug.push(
                `    Comment reply sent to ${reply.id} (@${reply.authorUsername})`,
              );
            } else {
              debug.push(
                `    Comment reply FAILED for ${reply.id}: ${replyResult.error?.slice(0, 200)}`,
              );
              results.errors++;
            }
          }

          // b) Envoyer un DM
          const dmText = personalize(auto.dm_message ?? "", {
            prenom: firstName,
            firstname: firstName,
            username: reply.authorUsername,
          });

          if (dmText) {
            // Essayer d'abord la méthode principale, puis le fallback
            let dmResult = await sendTwitterDM(reply.authorId, dmText);

            if (!dmResult.ok) {
              debug.push(
                `    DM method 1 failed: ${dmResult.error?.slice(0, 150)}`,
              );
              dmResult = await sendTwitterDMv2(reply.authorId, dmText);
            }

            if (dmResult.ok) {
              dmsSent++;
              results.dms_sent++;
              debug.push(
                `    DM sent to @${reply.authorUsername} (${reply.authorId})`,
              );
            } else {
              debug.push(
                `    DM FAILED for @${reply.authorUsername}: ${dmResult.error?.slice(0, 200)}`,
              );
              results.errors++;
            }
          }

          // Pause entre les envois (rate-limit)
          await new Promise((r) => setTimeout(r, 2000));
        }

        // Mettre à jour les stats
        const currentStats =
          (auto.stats as Record<string, number>) ?? {
            triggers: 0,
            dms_sent: 0,
          };

        if (dmsSent > 0 || repliesSent > 0) {
          await supabaseAdmin
            .from("social_automations")
            .update({
              stats: {
                triggers: (currentStats.triggers ?? 0) + newReplies.length,
                dms_sent: (currentStats.dms_sent ?? 0) + dmsSent,
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

/* ─── Helpers ─── */

function extractFirstName(name: string): string {
  return (name ?? "").split(/[\s._]/)[0] ?? name ?? "";
}

function personalize(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => vars[key] ?? `{{${key}}}`,
  );
}
