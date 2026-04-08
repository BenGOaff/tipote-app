// app/api/auth/facebook-messenger/callback/route.ts
// Callback OAuth for Facebook Messenger via Tipote ter app.
// Exchanges code for a long-lived Page token with pages_messaging.
// Stores as platform "facebook_messenger" in social_connections.
// Also subscribes the page to webhooks (feed + messages).

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import {
  exchangeMessengerCodeForToken,
  exchangeForLongLivedToken,
  getUserPages,
  subscribePageToWebhooks,
  getInstagramMetaAppId,
  getInstagramMetaAppSecret,
} from "@/lib/meta";
import { encrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const settingsUrl = `${appUrl}/settings?tab=connections`;

  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${appUrl}/login`);
    }

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      const desc = url.searchParams.get("error_description") ?? error;
      return NextResponse.redirect(
        `${settingsUrl}&messenger_error=${encodeURIComponent(desc)}`
      );
    }

    const cookieStore = await cookies();
    const savedState = cookieStore.get("messenger_oauth_state")?.value;
    cookieStore.delete("messenger_oauth_state");

    if (!code || !state || state !== savedState) {
      return NextResponse.redirect(
        `${settingsUrl}&messenger_error=${encodeURIComponent("State CSRF invalide. Réessaie.")}`
      );
    }

    // Exchange code for token (via Tipote ter credentials)
    console.log("[Messenger callback] Exchanging code for token...");
    const shortLived = await exchangeMessengerCodeForToken(code);
    console.log("[Messenger callback] Short-lived token OK");

    // Exchange for long-lived token using Tipote ter credentials
    const appId = getInstagramMetaAppId();
    const appSecret = getInstagramMetaAppSecret();
    let longLivedToken = shortLived.access_token;
    let longLivedExpiresIn = 5184000; // 60 days default
    try {
      const params = new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLived.access_token,
      });
      const llRes = await fetch(
        `https://graph.facebook.com/v22.0/oauth/access_token?${params}`
      );
      if (llRes.ok) {
        const llData = await llRes.json();
        longLivedToken = llData.access_token;
        longLivedExpiresIn = llData.expires_in ?? 5184000;
        console.log("[Messenger callback] Long-lived token OK, expires_in:", longLivedExpiresIn);
      }
    } catch (e) {
      console.warn("[Messenger callback] Long-lived exchange failed, using short-lived:", e);
    }

    // Get user's Pages — try me/accounts first, then fallback to direct page ID lookup
    let pages: Array<{ id: string; name: string; access_token: string }> = [];
    try {
      const pagesRes = await fetch(
        `https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token&access_token=${longLivedToken}`
      );
      const pagesData = await pagesRes.json();
      pages = pagesData.data ?? [];
      console.log("[Messenger callback] Pages from me/accounts:", pages.length);
    } catch (e) {
      console.error("[Messenger callback] me/accounts failed:", e);
    }

    // Fallback: if me/accounts is empty, look up the user's existing Facebook
    // connection to get the page ID, then fetch the page token directly
    if (pages.length === 0) {
      console.log("[Messenger callback] me/accounts empty, trying direct page lookup...");
      try {
        const { data: fbConn } = await supabaseAdmin
          .from("social_connections")
          .select("platform_user_id, platform_username")
          .eq("user_id", user.id)
          .eq("platform", "facebook")
          .maybeSingle();

        if (fbConn?.platform_user_id) {
          const pageId = fbConn.platform_user_id;
          console.log("[Messenger callback] Found existing FB page:", pageId);

          const pageRes = await fetch(
            `https://graph.facebook.com/v22.0/${pageId}?fields=id,name,access_token&access_token=${longLivedToken}`
          );
          const pageData = await pageRes.json();

          if (pageData.access_token) {
            pages = [{
              id: pageData.id,
              name: pageData.name || fbConn.platform_username || "Page",
              access_token: pageData.access_token,
            }];
            console.log("[Messenger callback] Direct page lookup OK:", pageData.name);
          } else {
            console.warn("[Messenger callback] Direct page lookup failed:", JSON.stringify(pageData));
          }
        }
      } catch (e) {
        console.error("[Messenger callback] Direct page lookup error:", e);
      }
    }

    if (pages.length === 0) {
      return NextResponse.redirect(
        `${settingsUrl}&messenger_error=${encodeURIComponent(
          "Aucune Page Facebook trouvée. Connecte d'abord Facebook, puis Messenger."
        )}`
      );
    }

    // Use the first page (most users have one page)
    const page = pages[0];
    const pageToken = page.access_token;
    const pageId = page.id;
    const pageName = page.name;

    console.log("[Messenger callback] Using page:", pageName, pageId);

    // Store in social_connections as "facebook_messenger"
    const projectId = await getActiveProjectId(supabase, user.id);
    const tokenExpiresAt = new Date(
      Date.now() + longLivedExpiresIn * 1000
    ).toISOString();

    const connectionData = {
      user_id: user.id,
      project_id: projectId ?? null,
      platform: "facebook_messenger" as const,
      platform_user_id: pageId,
      platform_username: pageName,
      access_token_encrypted: encrypt(pageToken),
      refresh_token_encrypted: null,
      token_expires_at: tokenExpiresAt,
      scopes: "pages_messaging,pages_manage_metadata,pages_read_engagement,pages_show_list",
      updated_at: new Date().toISOString(),
    };

    // Upsert: find existing messenger connection for this user
    const { data: existing } = await supabaseAdmin
      .from("social_connections")
      .select("id")
      .eq("user_id", user.id)
      .eq("platform", "facebook_messenger")
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("social_connections")
        .update(connectionData)
        .eq("id", existing.id);
    } else {
      await supabaseAdmin
        .from("social_connections")
        .insert(connectionData);
    }

    // Subscribe page to webhooks (feed + messages) using the new Page token
    try {
      const subResult = await subscribePageToWebhooks(pageId, pageToken);
      console.log(`[Messenger callback] Webhook subscription: appOk=${subResult.appOk}, pageOk=${subResult.pageOk}`);
      if (subResult.errors.length > 0) {
        console.warn("[Messenger callback] Webhook subscription issues:", subResult.errors);
      }
    } catch (err) {
      console.error("[Messenger callback] Webhook subscription error:", err);
    }

    console.log("[Messenger callback] Connection saved successfully!");
    return NextResponse.redirect(`${settingsUrl}&messenger_connected=1`);
  } catch (err) {
    console.error("[Messenger callback] Error:", err);
    return NextResponse.redirect(
      `${settingsUrl}&messenger_error=${encodeURIComponent(
        `Erreur de connexion Messenger: ${err instanceof Error ? err.message : "inconnue"}. Réessaie.`
      )}`
    );
  }
}
