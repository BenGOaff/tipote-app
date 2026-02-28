// POST /api/social/facebook-subscribe
// Deux étapes en une, via Tipote ter (qui a le produit Webhooks) :
//   1. Enregistre l'URL callback au niveau de l'app Tipote ter : POST /{APP_ID}/subscriptions
//   2. Abonne la Page aux events via MESSENGER_PAGE_ACCESS_TOKEN : POST /{PAGE_ID}/subscribed_apps
// Sans l'étape 1, Meta ne sait pas où envoyer les events même si la page est abonnée.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  // Utiliser Tipote ter (qui a le produit Webhooks)
  const appId = process.env.INSTAGRAM_APP_ID ?? process.env.META_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET;
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  if (!appId || !appSecret || !verifyToken) {
    return NextResponse.json({ error: "Env vars INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET / META_WEBHOOK_VERIFY_TOKEN manquants" }, { status: 500 });
  }

  const callbackUrl = `${appUrl}/api/automations/webhook`;

  // ── Étape 1 : Enregistrer l'URL webhook au niveau de Tipote ter ──
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

  // ── Étape 2 : Abonner la Page ──
  // Utiliser MESSENGER_PAGE_ACCESS_TOKEN (token Page via Tipote ter) en priorité
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

  // Préférer le token Messenger (Tipote ter) pour la subscription Page
  let pageToken: string;
  if (process.env.MESSENGER_PAGE_ACCESS_TOKEN) {
    pageToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  } else {
    try {
      pageToken = decrypt(conn.access_token_encrypted);
    } catch {
      return NextResponse.json({ error: "Token illisible" }, { status: 500 });
    }
  }

  let pageSubOk = false;
  let pageSubError: string | null = null;
  try {
    const params = new URLSearchParams({
      access_token: pageToken,
      subscribed_fields: "feed",
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
    webhook_app: appId === process.env.INSTAGRAM_APP_ID ? "Tipote ter" : "Tipote",
    using_messenger_token: !!process.env.MESSENGER_PAGE_ACCESS_TOKEN,
  }, { status: allOk ? 200 : 502 });
}
