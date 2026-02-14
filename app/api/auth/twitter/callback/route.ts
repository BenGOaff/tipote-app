// app/api/auth/twitter/callback/route.ts
// Callback OAuth X (Twitter) : echange le code avec PKCE, stocke les tokens chiffres.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { exchangeCodeForTokens, getUserInfo } from "@/lib/twitter";
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
        `${settingsUrl}&twitter_error=${encodeURIComponent(desc)}`
      );
    }

    const cookieStore = await cookies();
    const savedState = cookieStore.get("twitter_oauth_state")?.value;
    const codeVerifier = cookieStore.get("twitter_code_verifier")?.value;
    cookieStore.delete("twitter_oauth_state");
    cookieStore.delete("twitter_code_verifier");

    if (!code || !state || state !== savedState) {
      return NextResponse.redirect(
        `${settingsUrl}&twitter_error=${encodeURIComponent("State CSRF invalide. Reessaie.")}`
      );
    }

    if (!codeVerifier) {
      return NextResponse.redirect(
        `${settingsUrl}&twitter_error=${encodeURIComponent("Code verifier manquant. Reessaie.")}`
      );
    }

    // 3. Echanger le code contre des tokens (avec PKCE)
    const tokens = await exchangeCodeForTokens(code, codeVerifier);

    // 4. Recuperer les infos du profil X
    const userInfo = await getUserInfo(tokens.access_token);

    // 5. Chiffrer les tokens
    const accessTokenEncrypted = encrypt(tokens.access_token);
    const refreshTokenEncrypted = tokens.refresh_token
      ? encrypt(tokens.refresh_token)
      : null;

    // 6. Calculer l'expiration
    const tokenExpiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString();

    // 7. Upsert dans social_connections
    const projectId = await getActiveProjectId(supabase, user.id);

    const { error: dbError } = await supabase
      .from("social_connections")
      .upsert(
        {
          user_id: user.id,
          project_id: projectId ?? null,
          platform: "twitter",
          platform_user_id: userInfo.id,
          platform_username: `@${userInfo.username}`,
          access_token_encrypted: accessTokenEncrypted,
          refresh_token_encrypted: refreshTokenEncrypted,
          token_expires_at: tokenExpiresAt,
          scopes: tokens.scope ?? "tweet.read tweet.write users.read offline.access",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,project_id,platform" }
      );

    if (dbError) {
      console.error("social_connections upsert error:", dbError);
      return NextResponse.redirect(
        `${settingsUrl}&twitter_error=${encodeURIComponent("Erreur sauvegarde. Reessaie.")}`
      );
    }

    // 8. Rediriger vers les settings avec succes
    return NextResponse.redirect(
      `${settingsUrl}&twitter_connected=1`
    );
  } catch (err) {
    console.error("X OAuth callback error:", err);
    return NextResponse.redirect(
      `${settingsUrl}&twitter_error=${encodeURIComponent("Erreur de connexion X. Reessaie.")}`
    );
  }
}
