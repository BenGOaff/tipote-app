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

const GRAPH = "https://graph.facebook.com/v22.0";

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
  // Use user's OAuth token for page-level subscription (per-user, auto-refreshed)
  const messengerPageToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  const pageToken = oauthToken || messengerPageToken;

  const result: Record<string, unknown> = {
    pageId,
    webhookAppId: webhookAppId,
    webhookAppName: (webhookAppId === process.env.INSTAGRAM_META_APP_ID || webhookAppId === process.env.INSTAGRAM_APP_ID) ? "Tipote ter" : "Tipote",
    webhookCallbackUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/automations/webhook`,
    hasVerifyToken: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
    hasMessengerToken: !!messengerPageToken,
    usingMessengerTokenForPageSub: !!messengerPageToken,
  };

  // 0. Check MESSENGER_PAGE_ACCESS_TOKEN type (Page vs User)
  if (messengerPageToken) {
    try {
      const tokenCheckRes = await fetch(
        `${GRAPH}/me?fields=id,name,category,access_type&access_token=${messengerPageToken}`,
        { cache: "no-store" }
      );
      const tokenCheckData = await tokenCheckRes.json();
      if (tokenCheckData.error) {
        result.messengerTokenCheck = {
          status: "ERROR",
          error: tokenCheckData.error.message,
          code: tokenCheckData.error.code,
        };
      } else if (tokenCheckData.category) {
        result.messengerTokenCheck = {
          status: "OK - PAGE TOKEN ✅",
          resolvedId: tokenCheckData.id,
          resolvedName: tokenCheckData.name,
          category: tokenCheckData.category,
          matchesPageId: tokenCheckData.id === pageId,
        };
      } else {
        result.messengerTokenCheck = {
          status: "⚠️ USER TOKEN (WRONG!) - Needs to be a PAGE token",
          resolvedId: tokenCheckData.id,
          resolvedName: tokenCheckData.name,
          fix: "In Graph API Explorer, select the PAGE (not User) from the token dropdown, then copy that token as MESSENGER_PAGE_ACCESS_TOKEN",
        };
      }
    } catch (err) {
      result.messengerTokenCheck = { status: "CHECK_FAILED", error: String(err) };
    }

    // Also check permissions on the token
    try {
      const permRes = await fetch(
        `${GRAPH}/me/permissions?access_token=${messengerPageToken}`,
        { cache: "no-store" }
      );
      const permData = await permRes.json();
      if (permData.data) {
        const perms = permData.data as Array<{ permission: string; status: string }>;
        const hasMessaging = perms.some(p => p.permission === "pages_messaging" && p.status === "granted");
        result.messengerTokenPermissions = {
          pages_messaging: hasMessaging ? "✅ granted" : "❌ MISSING - required for DMs",
          all: perms.filter(p => p.status === "granted").map(p => p.permission),
        };
      } else {
        result.messengerTokenPermissions = permData;
      }
    } catch (err) {
      result.messengerTokenPermissionsError = String(err);
    }
  }

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

    // Re-subscribe page-level
    try {
      const params = new URLSearchParams({
        access_token: pageToken ?? "",
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
