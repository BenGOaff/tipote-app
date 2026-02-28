// app/api/automations/subscribe/route.ts
// Abonne la page Facebook/Instagram de l'utilisateur aux webhooks Meta.
// Appelé quand une automation comment-to-DM est créée ou activée.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { decrypt } from "@/lib/crypto";
import { subscribePageToWebhooks } from "@/lib/meta";

export const dynamic = "force-dynamic";

const GRAPH_API_VERSION = "v21.0";

export async function POST(req: NextRequest) {
  // 1. Vérifier auth
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  // Déterminer la plateforme depuis le body (optionnel, default: "facebook")
  let platform = "facebook";
  try {
    const body = await req.json().catch(() => ({}));
    if (body.platform === "instagram") platform = "instagram";
  } catch {
    // pas de body, on utilise facebook par défaut
  }

  if (platform === "instagram") {
    return subscribeInstagram(user.id, projectId);
  }

  return subscribeFacebook(user.id, projectId);
}

/* ─── Facebook subscription ─── */
async function subscribeFacebook(userId: string, projectId: string | null): Promise<NextResponse> {
  let query = supabaseAdmin
    .from("social_connections")
    .select("platform_user_id, access_token_encrypted")
    .eq("user_id", userId)
    .eq("platform", "facebook");

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data: conn, error: connError } = await query.maybeSingle();

  if (connError || !conn?.access_token_encrypted) {
    return NextResponse.json(
      { error: "Aucune page Facebook connectée. Connecte ta page Facebook dans les paramètres d'abord." },
      { status: 404 }
    );
  }

  const pageId = conn.platform_user_id;
  const pageAccessToken = decrypt(conn.access_token_encrypted);

  console.log(`[subscribe] Subscribing Facebook page ${pageId} to webhooks...`);
  const result = await subscribePageToWebhooks(pageId, pageAccessToken);
  console.log(`[subscribe] Result: appOk=${result.appOk}, pageOk=${result.pageOk}, errors=${JSON.stringify(result.errors)}`);

  if (!result.pageOk) {
    return NextResponse.json({
      ok: false,
      error: "La souscription aux webhooks a échoué. Reconnecte ta page Facebook dans les paramètres.",
      details: result.errors,
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    platform: "facebook",
    appOk: result.appOk,
    pageOk: result.pageOk,
    errors: result.errors.length > 0 ? result.errors : undefined,
  });
}

/* ─── Instagram subscription ─── */
async function subscribeInstagram(userId: string, projectId: string | null): Promise<NextResponse> {
  const errors: string[] = [];

  // Vérifier que l'utilisateur a une connexion Instagram
  let query = supabaseAdmin
    .from("social_connections")
    .select("platform_user_id, access_token_encrypted")
    .eq("user_id", userId)
    .eq("platform", "instagram");

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data: conn } = await query.maybeSingle();

  if (!conn?.access_token_encrypted) {
    return NextResponse.json(
      { error: "Aucun compte Instagram connecté. Connecte ton compte Instagram dans les paramètres d'abord." },
      { status: 404 }
    );
  }

  // Abonner l'app parente au webhook Instagram (object: "instagram", fields: "comments,messages")
  // Les webhooks se souscrivent via l'app parente "Tipote ter", pas la sub-app Instagram.
  const appId = process.env.INSTAGRAM_META_APP_ID ?? process.env.INSTAGRAM_APP_ID ?? process.env.META_APP_ID;
  const appSecret = process.env.INSTAGRAM_META_APP_SECRET ?? process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET;
  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? process.env.META_WEBHOOK_VERIFY_TOKEN;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  // Utilise le endpoint dédié Instagram pour les webhooks
  const webhookCallbackUrl = `${appUrl}/api/auth/instagram/callback`;

  let appOk = false;
  if (appId && appSecret && verifyToken) {
    try {
      const subParams = new URLSearchParams({
        object: "instagram",
        callback_url: webhookCallbackUrl,
        fields: "comments,messages",
        verify_token: verifyToken,
        access_token: `${appId}|${appSecret}`,
      });
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${appId}/subscriptions`,
        { method: "POST", body: subParams }
      );
      const json = await res.json();
      appOk = json.success === true;
      if (!appOk) {
        errors.push(`App subscription: ${JSON.stringify(json.error ?? json)}`);
      }
      console.log(`[subscribe/instagram] App webhook subscription: ${appOk ? "OK" : "FAILED"}`, JSON.stringify(json));
    } catch (err) {
      errors.push(`App subscription error: ${String(err)}`);
    }
  } else {
    errors.push("Missing INSTAGRAM/META env vars for webhook subscription");
  }

  return NextResponse.json({
    ok: appOk,
    platform: "instagram",
    appOk,
    webhookUrl: webhookCallbackUrl,
    errors: errors.length > 0 ? errors : undefined,
    note: "Instagram webhooks are subscribed at app level. Polling via /api/automations/instagram-comments is also available as fallback.",
  });
}
