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

  try {
    // 1. Récupérer toutes les automatisations Instagram actives
    const { data: automations, error: autoErr } = await supabaseAdmin
      .from("social_automations")
      .select("*")
      .eq("enabled", true)
      .contains("platforms", ["instagram"]);

    if (autoErr || !automations?.length) {
      return NextResponse.json({ ok: true, ...results, message: "No Instagram automations" });
    }

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
        .select("id, platform_user_id, access_token_encrypted, token_expires_at")
        .eq("user_id", userId)
        .eq("platform", "instagram")
        .maybeSingle();

      if (!conn?.access_token_encrypted) {
        console.warn(`[ig-comments] No Instagram connection for user ${userId}`);
        continue;
      }

      // Vérifier que le token n'est pas expiré
      if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
        console.warn(`[ig-comments] Token expired for user ${userId}, skipping`);
        continue;
      }

      let accessToken: string;
      try {
        accessToken = decrypt(conn.access_token_encrypted);
      } catch {
        console.error(`[ig-comments] Token decryption failed for user ${userId}`);
        continue;
      }

      const igUserId = conn.platform_user_id;

      // Pour chaque automatisation de ce user
      for (const auto of userAutos) {
        const keyword = (auto.trigger_keyword ?? "").toUpperCase();
        if (!keyword) continue;

        // Récupérer le target post ID
        const targetPostId = auto.target_post_url?.trim();
        if (!targetPostId) {
          console.warn(`[ig-comments] Automation ${auto.id} has no target post, skipping`);
          continue;
        }

        // Récupérer le dernier timestamp traité
        const meta = (auto.meta as Record<string, unknown>) ?? {};
        const lastProcessedId = (meta.ig_last_comment_id as string) ?? "";
        const lastProcessedTs = (meta.ig_last_processed as number) ?? 0;

        // Fetch les commentaires du post
        const comments = await fetchComments(accessToken, targetPostId);
        if (!comments.length) continue;

        results.processed += comments.length;

        // Filtrer les nouveaux commentaires contenant le mot-clé
        const newComments = comments.filter((c) => {
          // Ignorer les commentaires déjà traités
          if (lastProcessedTs && c.timestamp_unix <= lastProcessedTs) return false;
          if (lastProcessedId && c.id === lastProcessedId) return false;
          // Ignorer ses propres commentaires
          if (c.from_id === igUserId) return false;
          // Vérifier le mot-clé
          return c.text.toUpperCase().includes(keyword);
        });

        if (!newComments.length) continue;

        console.log(`[ig-comments] Found ${newComments.length} new matching comments for automation ${auto.id}`);

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
            } catch (err) {
              console.error(`[ig-comments] Comment reply failed for ${comment.id}:`, err);
              results.errors++;
            }
          }

          // b) Envoyer un DM via Private Reply (recipient.comment_id)
          //    C'est la méthode ManyChat : le DM est lié au commentaire
          const dmText = personalize(auto.dm_message ?? "", { prenom: firstName, firstname: firstName });
          if (dmText) {
            const dmResult = await sendInstagramPrivateReply(accessToken, igUserId, comment.id, dmText);

            if (dmResult.ok) {
              dmsSent++;
              results.dms_sent++;
            } else {
              console.error(`[ig-comments] DM failed for comment ${comment.id}:`, dmResult.error);
              results.errors++;

              // Fallback : essayer avec recipient.id si Private Reply échoue
              const fallbackResult = await sendInstagramDMById(accessToken, igUserId, comment.from_id, dmText);
              if (fallbackResult.ok) {
                dmsSent++;
                results.dms_sent++;
                results.errors--; // Annuler l'erreur puisque le fallback a fonctionné
              }
            }
          }

          // Pause entre les envois pour éviter le rate-limit
          await new Promise((r) => setTimeout(r, 1500));
        }

        // Mettre à jour les stats et le dernier commentaire traité
        const currentStats = (auto.stats as Record<string, number>) ?? { triggers: 0, dms_sent: 0 };
        const newestComment = newComments[0]; // Les commentaires sont triés du plus récent au plus ancien

        await supabaseAdmin
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
      }
    }
  } catch (err) {
    console.error("[ig-comments] Error:", err);
    results.errors++;
  }

  return NextResponse.json({ ok: true, ...results });
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

async function fetchComments(accessToken: string, mediaId: string): Promise<IGComment[]> {
  try {
    const res = await fetch(
      `${INSTAGRAM_GRAPH_BASE}/${mediaId}/comments?fields=id,text,timestamp,from{id,username}&limit=50&access_token=${accessToken}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[ig-comments] Fetch comments error (${res.status}):`, errText.slice(0, 300));
      return [];
    }

    const json = await res.json();
    return (json.data ?? []).map((c: any) => ({
      id: c.id,
      text: c.text ?? "",
      timestamp: c.timestamp,
      timestamp_unix: c.timestamp ? Math.floor(new Date(c.timestamp).getTime() / 1000) : 0,
      from_id: c.from?.id ?? "",
      username: c.from?.username ?? "",
    }));
  } catch (err) {
    console.error("[ig-comments] fetchComments error:", err);
    return [];
  }
}

/**
 * Envoie un DM Instagram via Private Reply (lié au commentaire).
 * C'est la méthode utilisée par ManyChat : recipient.comment_id
 * Doc : https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api#private-replies
 */
async function sendInstagramPrivateReply(
  accessToken: string,
  igUserId: string,
  commentId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
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

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[ig-comments] Private Reply DM error (${res.status}):`, errBody.slice(0, 500));
      return { ok: false, error: errBody };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Fallback : envoie un DM Instagram avec recipient.id (user IGSID).
 * Ne fonctionne que si une conversation existe déjà ou dans les 24h après interaction.
 */
async function sendInstagramDMById(
  accessToken: string,
  igUserId: string,
  recipientId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${INSTAGRAM_GRAPH_BASE}/${igUserId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        messaging_type: "RESPONSE",
        access_token: accessToken,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { ok: false, error: errBody };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
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
    throw new Error(`Instagram comment reply failed (${res.status}): ${errBody}`);
  }
}

function extractFirstName(name: string): string {
  return (name ?? "").split(/[\s._]/)[0] ?? name ?? "";
}

function personalize(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}
