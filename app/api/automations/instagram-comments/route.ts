// app/api/automations/instagram-comments/route.ts
// GET : appelé par n8n (cron) ou manuellement pour poll les commentaires Instagram
//       et déclencher le comment-to-DM automation (comme ManyChat).
//
// Flow :
//   1. Récupère toutes les automations Instagram actives
//   2. Pour chaque automation avec un target_post, fetch les commentaires récents
//   3. Matche les mots-clés
//   4. Répond au commentaire (public) avec une variante
//   5. Envoie un DM via Private Reply (recipient.comment_id)
//   6. Met à jour les stats et le dernier commentaire traité
//
// Sécurisé par N8N_SHARED_SECRET ou CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const INSTAGRAM_GRAPH_BASE = "https://graph.instagram.com/v21.0";

export async function GET(req: NextRequest) {
  // Auth par header secret (n8n ou cron)
  const secret = req.headers.get("x-n8n-secret") ?? req.headers.get("x-cron-secret");
  if (!secret || (secret !== process.env.N8N_SHARED_SECRET && secret !== process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = { processed: 0, replies: 0, dms_sent: 0, errors: 0 };
  const debug: string[] = [];

  try {
    // 1. Récupérer toutes les automatisations Instagram actives
    const { data: automations, error: autoErr } = await supabaseAdmin
      .from("social_automations")
      .select("*")
      .eq("enabled", true)
      .contains("platforms", ["instagram"]);

    if (autoErr) {
      debug.push(`DB error: ${autoErr.message}`);
      return NextResponse.json({ ok: false, ...results, debug });
    }

    if (!automations?.length) {
      debug.push("No active Instagram automations found in DB");
      return NextResponse.json({ ok: true, ...results, debug });
    }

    debug.push(`Found ${automations.length} active automation(s)`);

    // 2. Grouper les automatisations par user_id
    const autosByUser = new Map<string, typeof automations>();
    for (const auto of automations) {
      const userId = auto.user_id;
      if (!autosByUser.has(userId)) autosByUser.set(userId, []);
      autosByUser.get(userId)!.push(auto);
    }

    // 3. Pour chaque user, récupérer le token Instagram et traiter les commentaires
    for (const [userId, userAutos] of autosByUser) {
      // Récupérer la connexion Instagram
      const { data: conn } = await supabaseAdmin
        .from("social_connections")
        .select("id, platform_user_id, platform_username, access_token_encrypted, token_expires_at")
        .eq("user_id", userId)
        .eq("platform", "instagram")
        .maybeSingle();

      if (!conn?.access_token_encrypted) {
        debug.push(`User ${userId.slice(0, 8)}…: no Instagram connection found`);
        continue;
      }

      // Vérifier que le token n'est pas expiré
      if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
        debug.push(`User ${userId.slice(0, 8)}…: token expired (${conn.token_expires_at})`);
        continue;
      }

      let accessToken: string;
      try {
        accessToken = decrypt(conn.access_token_encrypted);
      } catch {
        debug.push(`User ${userId.slice(0, 8)}…: token decryption failed`);
        continue;
      }

      const igUserId = conn.platform_user_id;
      const igUsername = conn.platform_username ?? "";
      debug.push(`User ${userId.slice(0, 8)}…: connection OK (ig_id=${igUserId}, username=${igUsername})`);

      // Pour chaque automatisation de ce user
      for (const auto of userAutos) {
        const keyword = (auto.trigger_keyword ?? "").toUpperCase();
        if (!keyword) {
          debug.push(`  Auto ${auto.id.slice(0, 8)}…: no trigger keyword, skipping`);
          continue;
        }

        // Récupérer le target post ID
        const targetPostId = auto.target_post_url?.trim();
        if (!targetPostId) {
          debug.push(`  Auto ${auto.id.slice(0, 8)}…: no target post, skipping`);
          continue;
        }

        debug.push(`  Auto ${auto.id.slice(0, 8)}… "${auto.name}": keyword="${keyword}", post=${targetPostId}`);

        // Récupérer le dernier timestamp traité
        const meta = (auto.meta as Record<string, unknown>) ?? {};
        const lastProcessedId = (meta.ig_last_comment_id as string) ?? "";
        const lastProcessedTs = (meta.ig_last_processed as number) ?? 0;

        // Fetch les commentaires du post
        const fetchResult = await fetchComments(accessToken, targetPostId, igUsername);
        if (fetchResult.error) {
          debug.push(`    Fetch comments error: ${fetchResult.error}`);
          results.errors++;
          continue;
        }

        const comments = fetchResult.comments;
        if (!comments.length) {
          debug.push(`    No comments found on post ${targetPostId}`);
          continue;
        }

        debug.push(`    Fetched ${comments.length} comment(s) from post`);
        results.processed += comments.length;

        // Filtrer les nouveaux commentaires contenant le mot-clé
        const newComments = comments.filter((c) => {
          // Ignorer les commentaires déjà traités (par timestamp)
          if (lastProcessedTs && c.timestamp_unix <= lastProcessedTs) return false;
          // Ignorer par ID
          if (lastProcessedId && c.id === lastProcessedId) return false;
          // Ignorer ses propres commentaires (par username ou ID)
          if (igUserId && c.from_id && c.from_id === igUserId) return false;
          if (igUsername && c.username && c.username.toLowerCase() === igUsername.toLowerCase()) return false;
          // Vérifier le mot-clé
          return c.text.toUpperCase().includes(keyword);
        });

        if (!newComments.length) {
          debug.push(`    No NEW matching comments (keyword="${keyword}", last_ts=${lastProcessedTs})`);
          // Log sample of what comments look like for debugging
          if (comments.length > 0) {
            const sample = comments.slice(0, 3).map((c) =>
              `"${c.text.slice(0, 50)}" by ${c.username || c.from_id || "unknown"} at ${c.timestamp_unix}`
            );
            debug.push(`    Sample comments: ${sample.join(" | ")}`);
          }
          continue;
        }

        debug.push(`    Found ${newComments.length} new matching comment(s)!`);

        let dmsSent = 0;
        let repliesSent = 0;

        for (const comment of newComments) {
          const firstName = extractFirstName(comment.username ?? comment.from_id);

          // a) Répondre au commentaire (public, non-bloquant)
          if (auto.comment_reply_variants?.length) {
            const variants: string[] = auto.comment_reply_variants;
            const replyText = personalize(
              variants[Math.floor(Math.random() * variants.length)],
              { prenom: firstName, firstname: firstName }
            );

            try {
              await replyToInstagramComment(accessToken, comment.id, replyText);
              repliesSent++;
              results.replies++;
              debug.push(`    Comment reply sent to ${comment.id}`);
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              debug.push(`    Comment reply FAILED for ${comment.id}: ${errMsg.slice(0, 200)}`);
              results.errors++;
            }
          }

          // b) Envoyer un DM via Private Reply (recipient.comment_id)
          const dmText = personalize(auto.dm_message ?? "", { prenom: firstName, firstname: firstName });
          if (dmText) {
            const dmResult = await sendInstagramPrivateReply(accessToken, igUserId, comment.id, dmText);

            if (dmResult.ok) {
              dmsSent++;
              results.dms_sent++;
              debug.push(`    DM sent via ${dmResult.method} for comment ${comment.id}`);
            } else {
              debug.push(`    DM FAILED for comment ${comment.id}: ${dmResult.error?.slice(0, 200)}`);
              results.errors++;
            }
          }

          // Pause entre les envois pour éviter le rate-limit
          await new Promise((r) => setTimeout(r, 1500));
        }

        // Mettre à jour les stats et le dernier commentaire traité
        const currentStats = (auto.stats as Record<string, number>) ?? { triggers: 0, dms_sent: 0 };
        const newestComment = newComments.reduce((a, b) =>
          a.timestamp_unix >= b.timestamp_unix ? a : b
        );

        const { error: updateErr } = await supabaseAdmin
          .from("social_automations")
          .update({
            stats: {
              triggers: (currentStats.triggers ?? 0) + newComments.length,
              dms_sent: (currentStats.dms_sent ?? 0) + dmsSent,
            },
            meta: {
              ...meta,
              ig_last_comment_id: newestComment.id,
              ig_last_processed: Math.floor(Date.now() / 1000),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", auto.id);

        if (updateErr) {
          debug.push(`    Stats update failed: ${updateErr.message}`);
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

interface IGComment {
  id: string;
  text: string;
  timestamp: string;
  timestamp_unix: number;
  from_id: string;
  username: string;
}

interface FetchResult {
  comments: IGComment[];
  error?: string;
}

/**
 * Fetch comments from an Instagram media post.
 * Tries multiple field combinations for compatibility with both
 * Instagram Login API and legacy Graph API tokens.
 */
async function fetchComments(
  accessToken: string,
  mediaId: string,
  ownerUsername: string,
): Promise<FetchResult> {
  // Stratégie 1 : champs compatibles Instagram API with Instagram Login
  // L'API avec Instagram Login supporte `username` directement (pas `from{id,username}`)
  const fieldSets = [
    "id,text,timestamp,username",
    "id,text,timestamp,from{id,username}",
    "id,text,timestamp",
  ];

  for (const fields of fieldSets) {
    try {
      const url = `${INSTAGRAM_GRAPH_BASE}/${mediaId}/comments?fields=${encodeURIComponent(fields)}&limit=50&access_token=${accessToken}`;
      const res = await fetch(url, { cache: "no-store" });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[ig-comments] Fetch with fields="${fields}" failed (${res.status}):`, errText.slice(0, 200));
        // Try next field set
        continue;
      }

      const json = await res.json();
      const data = json.data ?? [];

      if (!data.length) {
        return { comments: [] };
      }

      const comments: IGComment[] = data.map((c: any) => ({
        id: c.id,
        text: c.text ?? "",
        timestamp: c.timestamp,
        timestamp_unix: c.timestamp ? Math.floor(new Date(c.timestamp).getTime() / 1000) : 0,
        // Handle both direct `username` field and nested `from.username`
        from_id: c.from?.id ?? "",
        username: c.username ?? c.from?.username ?? "",
      }));

      console.log(`[ig-comments] Fetched ${comments.length} comments with fields="${fields}"`);
      return { comments };
    } catch (err) {
      console.error(`[ig-comments] fetchComments error with fields="${fields}":`, err);
      continue;
    }
  }

  return { comments: [], error: "All field combinations failed for fetching comments" };
}

/**
 * Envoie un DM Instagram via Private Reply (lié au commentaire).
 * Essaie 3 méthodes dans l'ordre :
 *   1. IG Graph API : POST /{ig-user-id}/messages avec recipient.comment_id
 *   2. FB Messenger : POST /me/messages avec recipient.comment_id
 *   3. IG Graph API : POST /{ig-user-id}/messages avec recipient.id (si from_id disponible)
 */
async function sendInstagramPrivateReply(
  accessToken: string,
  igUserId: string,
  commentId: string,
  text: string,
): Promise<{ ok: boolean; method?: string; error?: string }> {
  const errors: string[] = [];

  // Tentative 1 : Instagram Graph API (endpoint Instagram Login)
  try {
    const res = await fetch(`${INSTAGRAM_GRAPH_BASE}/${igUserId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: { text },
        access_token: accessToken,
      }),
    });

    if (res.ok) {
      return { ok: true, method: "ig_graph_private_reply" };
    }

    const errBody = await res.text();
    errors.push(`IG(${res.status}): ${errBody.slice(0, 150)}`);
  } catch (err) {
    errors.push(`IG: ${String(err).slice(0, 100)}`);
  }

  // Tentative 2 : Messenger Platform (graph.facebook.com/me/messages)
  try {
    const fbRes = await fetch("https://graph.facebook.com/v21.0/me/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: { text },
      }),
    });

    if (fbRes.ok) {
      return { ok: true, method: "fb_messenger_private_reply" };
    }

    const fbErr = await fbRes.text();
    errors.push(`FB(${fbRes.status}): ${fbErr.slice(0, 150)}`);
  } catch (err) {
    errors.push(`FB: ${String(err).slice(0, 100)}`);
  }

  return { ok: false, error: errors.join(" | ") };
}

/**
 * Répond publiquement à un commentaire Instagram.
 */
async function replyToInstagramComment(
  accessToken: string,
  commentId: string,
  text: string,
): Promise<void> {
  const res = await fetch(`${INSTAGRAM_GRAPH_BASE}/${commentId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text, access_token: accessToken }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`(${res.status}): ${errBody}`);
  }
}

function extractFirstName(name: string): string {
  return (name ?? "").split(/[\s._]/)[0] ?? name ?? "";
}

function personalize(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}
