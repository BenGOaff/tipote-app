// app/api/social/facebook-webhook-status/route.ts
// Diagnostic : vérifie l'état des abonnements webhook pour la Page Facebook.
// GET → retourne l'état de la subscription app-level + page-level.

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

  let token: string;
  try {
    token = decrypt(connection.access_token_encrypted);
  } catch {
    return NextResponse.json({ error: "Token decryption failed" }, { status: 500 });
  }

  const pageId = connection.platform_user_id;
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  const result: Record<string, unknown> = {
    pageId,
    appId,
    webhookCallbackUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/automations/webhook`,
    hasVerifyToken: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
    hasMessengerToken: !!process.env.MESSENGER_PAGE_ACCESS_TOKEN,
  };

  // 1. Check app-level subscriptions
  if (appId && appSecret) {
    try {
      const res = await fetch(
        `${GRAPH}/${appId}/subscriptions?access_token=${appId}|${appSecret}`,
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
      `${GRAPH}/${pageId}/subscribed_apps?access_token=${token}`,
      { cache: "no-store" }
    );
    result.pageSubscribedApps = await res.json();
  } catch (err) {
    result.pageSubscribedAppsError = String(err);
  }

  // 3. Try to re-subscribe now (fix it live)
  const action = req.nextUrl.searchParams.get("fix");
  if (action === "1") {
    // Re-subscribe app-level
    if (appId && appSecret && process.env.META_WEBHOOK_VERIFY_TOKEN) {
      try {
        const params = new URLSearchParams({
          object: "page",
          callback_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/automations/webhook`,
          fields: "feed",
          verify_token: process.env.META_WEBHOOK_VERIFY_TOKEN,
          access_token: `${appId}|${appSecret}`,
        });
        const res = await fetch(`${GRAPH}/${appId}/subscriptions`, {
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
        access_token: token,
        subscribed_fields: "feed",
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
