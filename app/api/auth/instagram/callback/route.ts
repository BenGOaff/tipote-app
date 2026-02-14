// app/api/auth/instagram/callback/route.ts
// Callback OAuth Instagram : echange le code, recupere la Page Facebook,
// decouvre le compte Instagram Business/Creator lie a la Page,
// stocke le token chiffre (Page token, car l'API IG utilise le Page token).

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import {
  exchangeCodeForInstagramToken,
  exchangeForLongLivedToken,
  getUserPages,
  getInstagramBusinessAccount,
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

    // 3. Echanger le code contre un short-lived token
    console.log("[Instagram callback] Exchanging code for token...");
    const shortLived = await exchangeCodeForInstagramToken(code);
    console.log("[Instagram callback] Short-lived token OK");

    // 4. Echanger contre un long-lived token (~60 jours)
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    console.log("[Instagram callback] Long-lived token OK, expires_in:", longLived.expires_in);

    // 5. Recuperer les Pages Facebook (necessaire pour trouver le compte IG)
    console.log("[Instagram callback] Fetching user pages...");
    let pages = await getUserPages(longLived.access_token);
    console.log("[Instagram callback] Pages found:", pages.length);

    // Fallback granular_scopes si /me/accounts est vide (meme bug que Facebook)
    if (pages.length === 0) {
      console.log("[Instagram callback] Trying granular_scopes fallback...");
      try {
        const appId = process.env.META_APP_ID!;
        const appSecret = process.env.META_APP_SECRET!;
        const debugRes = await fetch(
          `https://graph.facebook.com/v21.0/debug_token?input_token=${shortLived.access_token}&access_token=${appId}|${appSecret}`
        );
        const debugJson = await debugRes.json();
        const d = debugJson.data ?? {};
        if (d.granular_scopes) {
          const pageIds = new Set<string>();
          for (const s of d.granular_scopes) {
            if (s.target_ids) {
              for (const id of s.target_ids) pageIds.add(id);
            }
          }
          for (const pid of pageIds) {
            try {
              const pageRes = await fetch(
                `https://graph.facebook.com/v21.0/${pid}?fields=id,name,access_token,category&access_token=${longLived.access_token}`
              );
              const pageJson = await pageRes.json();
              if (pageJson.id && pageJson.access_token) {
                pages.push(pageJson);
                console.log(`[Instagram callback] Recovered page via granular_scopes: ${pageJson.name}`);
              }
            } catch {
              // skip
            }
          }
        }
      } catch (e) {
        console.error("[Instagram callback] granular_scopes fallback error:", e);
      }
    }

    if (pages.length === 0) {
      return NextResponse.redirect(
        `${settingsUrl}&instagram_error=${encodeURIComponent(
          "Aucune Page Facebook trouvee. Instagram necessite une Page Facebook liee a un compte Instagram Business/Creator."
        )}`
      );
    }

    // 6. Chercher le compte Instagram Business lie a chaque Page
    let igAccount: { id: string; username?: string; name?: string } | null = null;
    let igPageToken: string | null = null;

    for (const page of pages) {
      console.log(`[Instagram callback] Checking page ${page.name} (${page.id}) for IG account...`);
      const ig = await getInstagramBusinessAccount(page.access_token, page.id);
      if (ig) {
        igAccount = ig;
        igPageToken = page.access_token;
        console.log(`[Instagram callback] Found IG account: ${ig.username ?? ig.name} (${ig.id})`);
        break;
      }
    }

    if (!igAccount || !igPageToken) {
      const pageNames = pages.map((p) => p.name).join(", ");
      return NextResponse.redirect(
        `${settingsUrl}&instagram_error=${encodeURIComponent(
          `Aucun compte Instagram Business/Creator trouve lie a tes Pages (${pageNames}). Assure-toi que ton compte Instagram est bien lie a ta Page Facebook en mode Business ou Creator.`
        )}`
      );
    }

    // 7. Stocker la connexion Instagram
    const projectId = await getActiveProjectId(supabase, user.id);
    console.log("[Instagram callback] projectId:", projectId, "userId:", user.id);

    const tokenExpiresAt = new Date(
      Date.now() + (longLived.expires_in ?? 5184000) * 1000
    ).toISOString();

    // On stocke le PAGE token (pas le user token) car l'API IG utilise le Page token
    const tokenEncrypted = encrypt(igPageToken);

    const connectionData = {
      user_id: user.id,
      project_id: projectId ?? null,
      platform: "instagram" as const,
      platform_user_id: igAccount.id,
      platform_username: igAccount.username ?? igAccount.name ?? "Instagram",
      access_token_encrypted: tokenEncrypted,
      refresh_token_encrypted: null,
      token_expires_at: tokenExpiresAt,
      scopes: "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement",
      updated_at: new Date().toISOString(),
    };

    // Chercher si une connexion Instagram existe deja
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
          `Erreur de sauvegarde Instagram: ${dbError.message ?? dbError.code ?? "inconnu"}. Reessaie.`
        )}`
      );
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
