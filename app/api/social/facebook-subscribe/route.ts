// POST /api/social/facebook-subscribe
// Deux étapes en une :
//   1. Enregistre l'URL callback au niveau de l'app : POST /{APP_ID}/subscriptions
//      (access_token = APP_ID|APP_SECRET — token d'app, pas user)
//   2. Abonne la Page connectée aux events : POST /{PAGE_ID}/subscribed_apps
// Sans l'étape 1, Meta ne sait pas où envoyer les events même si la page est abonnée.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  if (!appId || !appSecret || !verifyToken) {
    return NextResponse.json({ error: "Env vars META_APP_ID / META_APP_SECRET / META_WEBHOOK_VERIFY_TOKEN manquants" }, { status: 500 });
  }

  const callbackUrl = `${appUrl}/api/automations/webhook`;

  // ── Étape 1 : Enregistrer l'URL webhook au niveau de l'App ──
  // Le token d'app est simplement APP_ID|APP_SECRET (pas besoin d'OAuth user)
  const appToken = `${appId}|${appSecret}`;
  let appSubOk = false;
  let appSubError: string | null = null;
  try {
    const params = new URLSearchParams({
      object: "page",
      callback_url: callbackUrl,
      fields: "feed",
      verify_token: verifyToken,
      access_token: appToken,
    });
    const appRes = await fetch(
      `https://graph.facebook.com/v21.0/${appId}/subscriptions`,
      { method: "POST", body: params }
    );
    const appJson = await appRes.json();

    if (appJson.success) {
      appSubOk = true;
    } else {
      appSubError = appJson.error?.message ?? JSON.stringify(appJson);
      console.error("[facebook-subscribe] App subscription failed:", appSubError);
    }
  } catch (err) {
    appSubError = String(err);
    console.error("[facebook-subscribe] App subscription error:", err);
  }

  // ── Étape 2 : Abonner la Page de l'user connecté ──
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: conn } = await supabase
    .from("social_connections")
    .select("platform_user_id, access_token_encrypted")
    .eq("user_id", user.id)
    .eq("platform", "facebook")
    .maybeSingle();

  if (!conn) {
    return NextResponse.json({
      app_subscription: appSubOk,
      app_error: appSubError,
      page_subscription: false,
      error: "Aucune connexion Facebook — reconnecte ton compte.",
    }, { status: appSubOk ? 200 : 502 });
  }

  let pageToken: string;
  try {
    pageToken = decrypt(conn.access_token_encrypted);
  } catch {
    return NextResponse.json({ error: "Token illisible" }, { status: 500 });
  }

  let pageSubOk = false;
  let pageSubError: string | null = null;
  try {
    const params = new URLSearchParams({
      access_token: pageToken,
      subscribed_fields: "feed,messages",
    });
    const pageRes = await fetch(
      `https://graph.facebook.com/v21.0/${conn.platform_user_id}/subscribed_apps`,
      { method: "POST", body: params }
    );
    const pageJson = await pageRes.json();

    if (pageJson.success) {
      pageSubOk = true;
    } else {
      pageSubError = pageJson.error?.message ?? JSON.stringify(pageJson);
      console.error("[facebook-subscribe] Page subscription failed:", pageSubError);
    }
  } catch (err) {
    pageSubError = String(err);
    console.error("[facebook-subscribe] Page subscription error:", err);
  }

  const allOk = appSubOk && pageSubOk;

  return NextResponse.json({
    ok: allOk,
    app_subscription: appSubOk,
    app_error: appSubError,
    page_subscription: pageSubOk,
    page_error: pageSubError,
    page_id: conn.platform_user_id,
    callback_url: callbackUrl,
  }, { status: allOk ? 200 : 502 });
}
