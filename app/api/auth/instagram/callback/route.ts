// app/api/auth/instagram/callback/route.ts
// Ce endpoint remplit deux rôles sur le même GET :
//
//  1. Vérification webhook Meta (hub.mode=subscribe)
//     → Meta envoie hub.mode, hub.verify_token, hub.challenge
//     → On répond avec hub.challenge pour confirmer le webhook
//     → Variables : INSTAGRAM_WEBHOOK_VERIFY_TOKEN (ex: "tipote-meta-verify-2026")
//
//  2. Callback OAuth Instagram Professional Login (param "code")
//     → Instagram redirige ici après autorisation utilisateur
//     → On échange le code contre un token long-lived (~60 jours)
//     → On stocke la connexion dans social_connections (platform = "instagram")
//
// POST : reçoit les events webhook Instagram (comments, messages)
//        vérifie la signature X-Hub-Signature-256 avec INSTAGRAM_APP_SECRET

import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import {
  exchangeInstagramCodeForToken,
  exchangeInstagramForLongLivedToken,
  getInstagramUser,
} from "@/lib/meta";
import { encrypt, decrypt } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/* ─── GET : webhook verification OU OAuth callback ─── */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  // ── 1. Vérification webhook Meta (prioritaire) ──
  const hubMode = searchParams.get("hub.mode");
  const hubToken = searchParams.get("hub.verify_token");
  const hubChallenge = searchParams.get("hub.challenge");

  if (hubMode === "subscribe") {
    const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
    if (hubToken === verifyToken && hubChallenge) {
      console.log("[Instagram webhook] Verification OK");
      return new NextResponse(hubChallenge, { status: 200 });
    }
    console.warn("[Instagram webhook] Verification FAILED — verify_token mismatch or missing challenge");
    return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
  }

  // ── 2. OAuth callback ──
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const settingsUrl = `${appUrl}/settings?tab=connections`;

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        `${settingsUrl}&instagram_error=${encodeURIComponent("Session expirée. Reconnecte-toi à Tipote et réessaie.")}`
      );
    }

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      const desc = searchParams.get("error_description") ?? error;
      return NextResponse.redirect(
        `${settingsUrl}&instagram_error=${encodeURIComponent(desc)}`
      );
    }

    const cookieStore = await cookies();
    const savedState = cookieStore.get("instagram_oauth_state")?.value;
    cookieStore.delete("instagram_oauth_state");

    if (!code || !state || state !== savedState) {
      return NextResponse.redirect(
        `${settingsUrl}&instagram_error=${encodeURIComponent("State CSRF invalide. Reessaie.")}`
      );
    }

    // Échange code → short-lived token
    // On dérive le redirect_uri depuis l'URL réelle de la requête pour garantir une correspondance exacte avec Meta
    const callbackRedirectUri = `${req.nextUrl.origin}${req.nextUrl.pathname}`;
    console.log("[Instagram callback] Exchanging code for token... redirect_uri:", callbackRedirectUri);
    const shortLived = await exchangeInstagramCodeForToken(code, callbackRedirectUri);
    console.log("[Instagram callback] Short-lived token OK, user_id:", shortLived.user_id);

    // Échange short-lived → long-lived (~60 jours)
    const longLived = await exchangeInstagramForLongLivedToken(shortLived.access_token);
    console.log("[Instagram callback] Long-lived token OK, expires_in:", longLived.expires_in);

    // Profil Instagram
    const igUser = await getInstagramUser(longLived.access_token);
    console.log("[Instagram callback] IG user:", JSON.stringify(igUser));

    // Stockage en base
    const projectId = await getActiveProjectId(supabase, user.id);
    console.log("[Instagram callback] projectId:", projectId, "userId:", user.id);

    const tokenExpiresAt = new Date(
      Date.now() + (longLived.expires_in ?? 5184000) * 1000
    ).toISOString();

    const tokenEncrypted = encrypt(longLived.access_token);

    const connectionData = {
      user_id: user.id,
      project_id: projectId ?? null,
      platform: "instagram" as const,
      platform_user_id: igUser.id,
      platform_username: igUser.username ?? igUser.name ?? "Instagram",
      access_token_encrypted: tokenEncrypted,
      refresh_token_encrypted: null,
      token_expires_at: tokenExpiresAt,
      scopes: "instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages,instagram_business_content_publish",
      updated_at: new Date().toISOString(),
    };

    // Upsert : update si connexion Instagram existante, sinon insert
    let findQuery = supabase
      .from("social_connections")
      .select("id")
      .eq("user_id", user.id)
      .eq("platform", "instagram");

    if (projectId) {
      findQuery = findQuery.eq("project_id", projectId);
    } else {
      findQuery = findQuery.is("project_id", null);
    }

    const { data: existing } = await findQuery.maybeSingle();

    let dbError;
    if (existing) {
      console.log("[Instagram callback] Updating existing connection:", existing.id);
      const result = await supabase
        .from("social_connections")
        .update(connectionData)
        .eq("id", existing.id);
      dbError = result.error;
    } else {
      console.log("[Instagram callback] Inserting new connection");
      const result = await supabase
        .from("social_connections")
        .insert(connectionData);
      dbError = result.error;
    }

    if (dbError) {
      console.error("[Instagram callback] DB error:", JSON.stringify(dbError));
      return NextResponse.redirect(
        `${settingsUrl}&instagram_error=${encodeURIComponent(
          `Erreur de sauvegarde: ${dbError.message ?? dbError.code ?? "inconnu"}. Reessaie.`
        )}`
      );
    }

    // Abonnement webhook au niveau de l'app (non-bloquant)
    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
    const webhookCallbackUrl = `${appUrl}/api/auth/instagram/callback`;

    if (appId && appSecret && verifyToken) {
      try {
        const subParams = new URLSearchParams({
          object: "instagram",
          callback_url: webhookCallbackUrl,
          fields: "comments,messages",
          verify_token: verifyToken,
          access_token: `${appId}|${appSecret}`,
        });
        const subRes = await fetch(
          `https://graph.facebook.com/v21.0/${appId}/subscriptions`,
          { method: "POST", body: subParams }
        );
        const subJson = await subRes.json();
        if (subJson.success) {
          console.log("[Instagram callback] App webhook subscription: OK");
        } else {
          console.warn("[Instagram callback] App webhook subscription failed:", JSON.stringify(subJson));
        }
      } catch (err) {
        console.error("[Instagram callback] App webhook subscription error:", err);
      }
    } else {
      console.warn("[Instagram callback] Missing INSTAGRAM env vars — skipping webhook subscription");
    }

    console.log("[Instagram callback] Connection saved successfully!");
    return NextResponse.redirect(`${settingsUrl}&instagram_connected=1`);
  } catch (err) {
    console.error("[Instagram callback] Error:", err);
    return NextResponse.redirect(
      `${settingsUrl}&instagram_error=${encodeURIComponent(
        `Erreur de connexion Instagram: ${err instanceof Error ? err.message : "inconnue"}. Reessaie.`
      )}`
    );
  }
}

/* ─── POST : events webhook Instagram entrants ─── */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  // Vérification signature HMAC avec INSTAGRAM_APP_SECRET
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (appSecret) {
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
    const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
    if (signature !== expected) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: InstagramWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Seuls les events Instagram nous intéressent ici
  if (payload.object !== "instagram") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const results = { matched: 0, errors: 0 };

  for (const entry of payload.entry ?? []) {
    const igAccountId = entry.id;

    for (const change of entry.changes ?? []) {
      // Commentaires Instagram
      if (change.field !== "comments") continue;
      const val = change.value;
      if (!val.text || !val.from?.id) continue;

      // Récupérer le token Instagram depuis la DB
      let igAccessToken: string | null = null;
      let connUserId: string | undefined;
      try {
        const { data: conn } = await supabaseAdmin
          .from("social_connections")
          .select("access_token_encrypted, user_id")
          .eq("platform", "instagram")
          .eq("platform_user_id", igAccountId)
          .maybeSingle();

        if (conn?.access_token_encrypted) {
          igAccessToken = decrypt(conn.access_token_encrypted);
          connUserId = conn.user_id;
        }
      } catch (err) {
        console.error("[Instagram webhook] Token lookup error:", err);
      }

      if (!igAccessToken) {
        console.warn("[Instagram webhook] No token found for IG account:", igAccountId);
        continue;
      }

      await processInstagramComment({
        ig_account_id: igAccountId,
        sender_id: val.from.id,
        sender_name: val.from.username ?? val.from.id,
        comment_text: val.text,
        comment_id: val.id,
        media_id: val.media?.id,
        ig_access_token: igAccessToken,
        user_id: connUserId,
      });

      results.matched++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}

/* ─── Traitement d'un commentaire Instagram ─── */
async function processInstagramComment(params: {
  ig_account_id: string;
  sender_id: string;
  sender_name: string;
  comment_text: string;
  comment_id?: string;
  media_id?: string;
  ig_access_token: string;
  user_id?: string;
}): Promise<void> {
  const { ig_account_id, sender_id, sender_name, comment_text, comment_id, media_id, ig_access_token, user_id } = params;
  const commentUpper = comment_text.toUpperCase();

  try {
    let query = supabaseAdmin
      .from("social_automations")
      .select("*")
      .eq("enabled", true)
      .contains("platforms", ["instagram"]);

    if (user_id) query = query.eq("user_id", user_id);

    const { data: automations, error } = await query;
    if (error || !automations?.length) return;

    const matched = automations.find((auto: Record<string, any>) => {
      if (!commentUpper.includes(auto.trigger_keyword.toUpperCase())) return false;
      if (auto.target_post_url) {
        if (!media_id) return false;
        return auto.target_post_url === media_id || auto.target_post_url.includes(media_id);
      }
      return true;
    });

    if (!matched) return;

    const firstName = (sender_name ?? "").split(".")[0] ?? sender_name;

    // Répondre au commentaire (non-bloquant)
    if (matched.comment_reply_variants?.length && comment_id) {
      const variants: string[] = matched.comment_reply_variants;
      const replyText = variants[Math.floor(Math.random() * variants.length)];
      replyToInstagramComment(ig_access_token, comment_id, replyText).catch((err) => {
        console.error("[Instagram webhook] Comment reply failed:", err);
      });
    }

    // Envoyer un DM Instagram
    const dmText = personalize(matched.dm_message, { prenom: firstName, firstname: firstName });
    const dmResult = await sendInstagramDM(ig_access_token, ig_account_id, sender_id, dmText);

    // Mettre à jour les stats
    const currentStats = (matched.stats as Record<string, number>) ?? { triggers: 0, dms_sent: 0 };
    await supabaseAdmin
      .from("social_automations")
      .update({
        stats: {
          triggers: (currentStats.triggers ?? 0) + 1,
          dms_sent: (currentStats.dms_sent ?? 0) + (dmResult.ok ? 1 : 0),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", matched.id);

  } catch (err) {
    console.error("[Instagram webhook] processInstagramComment error:", err);
  }
}

/* ─── Helpers Instagram ─── */

function personalize(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

async function sendInstagramDM(
  igAccessToken: string,
  igAccountId: string,
  recipientId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://graph.instagram.com/v21.0/${igAccountId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        messaging_type: "RESPONSE",
        access_token: igAccessToken,
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

async function replyToInstagramComment(
  igAccessToken: string,
  commentId: string,
  text: string,
): Promise<void> {
  const res = await fetch(`https://graph.instagram.com/v21.0/${commentId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text, access_token: igAccessToken }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Instagram comment reply failed: ${errBody}`);
  }
}

/* ─── Types ─── */

interface InstagramWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    time?: number;
    changes: Array<{
      field: string;
      value: {
        from?: { id: string; username?: string };
        text?: string;
        id?: string;
        media?: { id: string };
      };
    }>;
  }>;
}
