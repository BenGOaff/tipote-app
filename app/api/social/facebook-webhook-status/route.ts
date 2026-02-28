// app/api/social/facebook-webhook-status/route.ts
// Diagnostic : vérifie l'état des abonnements webhook pour la Page Facebook.
// Utilise les credentials de Tipote ter (qui a le produit Webhooks).
// GET → retourne l'état de la subscription app-level + page-level.
// GET ?fix=1 → re-souscrit les webhooks via Tipote ter.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: connection } = await supabase
    .from("social_connections")
    .select("platform_user_id, access_token_encrypted")
    .eq("user_id", user.id)
    .eq("platform", "facebook")
    .maybeSingle();

  if (!connection?.access_token_encrypted) {
    return NextResponse.json({ error: "Facebook not connected" }, { status: 404 });
  }

  let oauthToken: string;
  try {
    oauthToken = decrypt(connection.access_token_encrypted);
  } catch {
    return NextResponse.json({ error: "Token decryption failed" }, { status: 500 });
  }

  const pageId = connection.platform_user_id;

  // Credentials Tipote ter (app parente avec produit Webhooks)
  // INSTAGRAM_META_APP_ID = Tipote ter parent (2408789919563484)
  const webhookAppId = process.env.INSTAGRAM_META_APP_ID ?? process.env.INSTAGRAM_APP_ID ?? process.env.META_APP_ID;
  const webhookAppSecret = process.env.INSTAGRAM_META_APP_SECRET ?? process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET;
  // Token Page via Tipote ter (pour page-level subscription)
  const messengerPageToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  const pageToken = messengerPageToken ?? oauthToken;

  const result: Record<string, unknown> = {
    pageId,
    webhookAppId: webhookAppId,
    webhookAppName: (webhookAppId === process.env.INSTAGRAM_META_APP_ID || webhookAppId === process.env.INSTAGRAM_APP_ID) ? "Tipote ter" : "Tipote",
    webhookCallbackUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/automations/webhook`,
    hasVerifyToken: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
    hasMessengerToken: !!messengerPageToken,
    usingMessengerTokenForPageSub: !!messengerPageToken,
  };

  // 1. Check app-level subscriptions (Tipote ter)
  if (webhookAppId && webhookAppSecret) {
    try {
      const res = await fetch(
        `${GRAPH}/${webhookAppId}/subscriptions?access_token=${webhookAppId}|${webhookAppSecret}`,
        { cache: "no-store" }
      );
      result.appSubscriptions = await res.json();
    } catch (err) {
      result.appSubscriptionsError = String(err);
    }
  }

  // 2. Check page-level subscribed apps
  try {
    const res = await fetch(
      `${GRAPH}/${pageId}/subscribed_apps?access_token=${pageToken}`,
      { cache: "no-store" }
    );
    result.pageSubscribedApps = await res.json();
  } catch (err) {
    result.pageSubscribedAppsError = String(err);
  }

  // 3. Try to re-subscribe now (fix it live)
  const action = req.nextUrl.searchParams.get("fix");
  if (action === "1") {
    // Re-subscribe app-level (via Tipote ter)
    if (webhookAppId && webhookAppSecret && process.env.META_WEBHOOK_VERIFY_TOKEN) {
      try {
        const params = new URLSearchParams({
          object: "page",
          callback_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/automations/webhook`,
          fields: "feed,messages",
          verify_token: process.env.META_WEBHOOK_VERIFY_TOKEN,
          access_token: `${webhookAppId}|${webhookAppSecret}`,
        });
        const res = await fetch(`${GRAPH}/${webhookAppId}/subscriptions`, {
          method: "POST",
          body: params,
        });
        result.fixAppSubscription = await res.json();
      } catch (err) {
        result.fixAppSubscriptionError = String(err);
      }
    }

    // Re-subscribe page-level (via MESSENGER_PAGE_ACCESS_TOKEN)
    try {
      const params = new URLSearchParams({
        access_token: pageToken,
        subscribed_fields: "feed,messages",
      });
      const res = await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
        method: "POST",
        body: params,
      });
      result.fixPageSubscription = await res.json();
    } catch (err) {
      result.fixPageSubscriptionError = String(err);
    }
  }

  return NextResponse.json(result);
}
