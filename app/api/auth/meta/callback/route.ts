// app/api/auth/meta/callback/route.ts
// Callback OAuth Facebook : echange le code, recupere les Pages,
// stocke le token chiffre pour Facebook (Pages uniquement).

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getUserPages,
  subscribePageToWebhooks,
} from "@/lib/meta";
import { encrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const settingsUrl = `${appUrl}/settings?tab=connections`;

  try {
    // 1. Verifier l'authentification Tipote
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${appUrl}/login`);
    }

    // 2. Verifier le state CSRF
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      const desc = url.searchParams.get("error_description") ?? error;
      return NextResponse.redirect(
        `${settingsUrl}&meta_error=${encodeURIComponent(desc)}`
      );
    }

    const cookieStore = await cookies();
    const savedState = cookieStore.get("meta_oauth_state")?.value;
    cookieStore.delete("meta_oauth_state");

    if (!code || !state || state !== savedState) {
      return NextResponse.redirect(
        `${settingsUrl}&meta_error=${encodeURIComponent("State CSRF invalide. Reessaie.")}`
      );
    }

    // 3. Echanger le code contre un short-lived token
    console.log("[Facebook callback] Exchanging code for token...");
    const shortLived = await exchangeCodeForToken(code);
    console.log("[Facebook callback] Short-lived token OK");

    // 4. Essayer /me/accounts avec le short-lived token D'ABORD
    //    (le long-lived exchange peut perdre l'association page dans certains cas)
    console.log("[Facebook callback] Trying /me/accounts with SHORT-LIVED token...");
    let pages = await getUserPages(shortLived.access_token);
    console.log("[Facebook callback] Pages (short-lived):", pages.length);

    // 5. Si vide, essayer avec le long-lived token
    let longLivedToken = shortLived.access_token;
    let longLivedExpiresIn = 5184000;
    if (pages.length === 0) {
      console.log("[Facebook callback] No pages with short-lived, trying long-lived...");
      const longLived = await exchangeForLongLivedToken(shortLived.access_token);
      longLivedToken = longLived.access_token;
      longLivedExpiresIn = longLived.expires_in ?? 5184000;
      console.log("[Facebook callback] Long-lived token OK, expires_in:", longLived.expires_in);

      pages = await getUserPages(longLivedToken);
      console.log("[Facebook callback] Pages (long-lived):", pages.length);
    } else {
      // On a les pages avec le short-lived, on fait quand meme le long-lived
      const longLived = await exchangeForLongLivedToken(shortLived.access_token);
      longLivedToken = longLived.access_token;
      longLivedExpiresIn = longLived.expires_in ?? 5184000;
      console.log("[Facebook callback] Long-lived token OK, expires_in:", longLived.expires_in);
      // Re-fetch pages with long-lived token to get long-lived page tokens
      const pagesLL = await getUserPages(longLivedToken);
      if (pagesLL.length > 0) {
        pages = pagesLL;
        console.log("[Facebook callback] Using long-lived page tokens");
      }
    }

    // 6. Debug approfondi si toujours vide
    if (pages.length === 0) {
      let debugParts: string[] = [];

      // a) Identite et permissions
      try {
        const [permRes, meRes] = await Promise.all([
          fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${longLivedToken}`),
          fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${longLivedToken}`),
        ]);
        const permJson = await permRes.json();
        const meJson = await meRes.json();
        const perms = (permJson.data ?? [])
          .filter((p: { status: string }) => p.status === "granted")
          .map((p: { permission: string }) => p.permission);
        debugParts.push(`User: ${meJson.name ?? "?"} (${meJson.id ?? "?"})`);
        debugParts.push(`Perms: ${perms.join(",") || "aucune"}`);
        console.log("[Facebook callback] Permissions:", JSON.stringify(permJson));
        console.log("[Facebook callback] Identity:", JSON.stringify(meJson));
      } catch (e) {
        debugParts.push("Erreur fetch identity/perms");
      }

      // b) Debug Token : inspecter le contenu du token
      try {
        const appId = process.env.META_APP_ID!;
        const appSecret = process.env.META_APP_SECRET!;
        const debugRes = await fetch(
          `https://graph.facebook.com/v21.0/debug_token?input_token=${shortLived.access_token}&access_token=${appId}|${appSecret}`
        );
        const debugJson = await debugRes.json();
        console.log("[Facebook callback] Debug Token (short-lived):", JSON.stringify(debugJson));
        const d = debugJson.data ?? {};
        debugParts.push(`Token type: ${d.type ?? "?"}`);
        debugParts.push(`Token scopes: ${(d.scopes ?? []).join(",")}`);
        if (d.granular_scopes) {
          const pageScopes = d.granular_scopes
            .filter((s: { scope: string; target_ids?: string[] }) => s.target_ids?.length)
            .map((s: { scope: string; target_ids?: string[] }) => `${s.scope}→[${s.target_ids!.join(",")}]`);
          debugParts.push(`Page scopes: ${pageScopes.join("; ") || "aucun target_ids"}`);

          // c) Si on trouve des page IDs dans granular_scopes, essayer de fetcher directement
          const pageIds = new Set<string>();
          for (const s of d.granular_scopes) {
            if (s.target_ids) {
              for (const id of s.target_ids) pageIds.add(id);
            }
          }
          if (pageIds.size > 0) {
            debugParts.push(`Page IDs trouves dans token: ${[...pageIds].join(",")}`);
            console.log("[Facebook callback] Found page IDs in granular_scopes:", [...pageIds]);
            // Tenter de recuperer le page token directement via /{page-id}?fields=access_token
            for (const pid of pageIds) {
              try {
                const pageRes = await fetch(
                  `https://graph.facebook.com/v21.0/${pid}?fields=id,name,access_token,category&access_token=${longLivedToken}`
                );
                const pageJson = await pageRes.json();
                console.log(`[Facebook callback] Direct page fetch ${pid}:`, JSON.stringify(pageJson));
                if (pageJson.id && pageJson.access_token) {
                  pages.push(pageJson);
                  debugParts.push(`Page recuperee directement: ${pageJson.name} (${pageJson.id})`);
                } else {
                  debugParts.push(`Page ${pid}: ${pageJson.error?.message ?? "pas de token"}`);
                }
              } catch (pageErr) {
                debugParts.push(`Erreur fetch page ${pid}`);
              }
            }
          }
        }
      } catch (e) {
        debugParts.push("Erreur debug_token");
        console.error("[Facebook callback] Debug token error:", e);
      }

      // Si on a trouve des pages via granular_scopes, continuer le flow normal
      if (pages.length > 0) {
        console.log("[Facebook callback] Recovered pages via granular_scopes!");
      } else {
        console.error("[Facebook callback] No pages found after all attempts. Debug:", debugParts.join(" | "));
        return NextResponse.redirect(
          `${settingsUrl}&meta_error=${encodeURIComponent(
            `Aucune Page trouvee. ${debugParts.join(" | ")}`
          )}`
        );
      }
    }

    const longLived = { access_token: longLivedToken, expires_in: longLivedExpiresIn };

    // 6. Prendre la premiere page (v1 : selection automatique)
    const page = pages[0];
    console.log("[Facebook callback] Using page:", page.id, page.name);

    const projectId = await getActiveProjectId(supabase, user.id);
    console.log("[Facebook callback] projectId:", projectId, "userId:", user.id);

    const tokenExpiresAt = new Date(
      Date.now() + (longLived.expires_in ?? 5184000) * 1000
    ).toISOString();

    // 7. Stocker la connexion Facebook (Page)
    const pageTokenEncrypted = encrypt(page.access_token);

    const connectionData = {
      user_id: user.id,
      project_id: projectId ?? null,
      platform: "facebook" as const,
      platform_user_id: page.id,
      platform_username: page.name,
      access_token_encrypted: pageTokenEncrypted,
      refresh_token_encrypted: null,
      token_expires_at: tokenExpiresAt,
      scopes: "pages_show_list,pages_manage_posts,pages_read_engagement,pages_read_user_content,pages_manage_metadata,pages_manage_engagement,pages_messaging",
      updated_at: new Date().toISOString(),
    };

    // Chercher si une connexion Facebook existe deja (gere le cas project_id NULL)
    let findQuery = supabase
      .from("social_connections")
      .select("id")
      .eq("user_id", user.id)
      .eq("platform", "facebook");

    if (projectId) {
      findQuery = findQuery.eq("project_id", projectId);
    } else {
      findQuery = findQuery.is("project_id", null);
    }

    const { data: existing } = await findQuery.maybeSingle();

    let dbError;
    if (existing) {
      console.log("[Facebook callback] Updating existing connection:", existing.id);
      const result = await supabase
        .from("social_connections")
        .update(connectionData)
        .eq("id", existing.id);
      dbError = result.error;
    } else {
      console.log("[Facebook callback] Inserting new connection");
      const result = await supabase
        .from("social_connections")
        .insert(connectionData);
      dbError = result.error;
    }

    if (dbError) {
      console.error("[Facebook callback] DB error:", JSON.stringify(dbError));
      return NextResponse.redirect(
        `${settingsUrl}&meta_error=${encodeURIComponent(
          `Erreur de sauvegarde Facebook: ${dbError.message ?? dbError.code ?? "inconnu"}. Reessaie.`
        )}`
      );
    }

    console.log("[Facebook callback] Connection saved successfully!");

    // 8. Configurer les webhooks Meta (non-bloquant)
    try {
      const subResult = await subscribePageToWebhooks(page.id, page.access_token);
      console.log(`[Facebook callback] Webhook subscription: appOk=${subResult.appOk}, pageOk=${subResult.pageOk}`);
      if (subResult.errors.length > 0) {
        console.warn("[Facebook callback] Webhook subscription issues:", subResult.errors);
      }
    } catch (err) {
      console.error("[Facebook callback] Webhook subscription error:", err);
    }

    return NextResponse.redirect(`${settingsUrl}&meta_connected=facebook`);
  } catch (err) {
    console.error("[Facebook callback] Error:", err);
    return NextResponse.redirect(
      `${settingsUrl}&meta_error=${encodeURIComponent(
        `Erreur de connexion Facebook: ${err instanceof Error ? err.message : "inconnue"}. Reessaie.`
      )}`
    );
  }
}
