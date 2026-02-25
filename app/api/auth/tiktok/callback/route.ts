// app/api/auth/tiktok/callback/route.ts
// Callback OAuth TikTok : echange le code, stocke les tokens chiffres.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { exchangeCodeForTokens, getUserInfo } from "@/lib/tiktok";
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
      const desc = error === "access_denied"
        ? "Acces refuse par l'utilisateur."
        : error;
      return NextResponse.redirect(
        `${settingsUrl}&tiktok_error=${encodeURIComponent(desc)}`
      );
    }

    const cookieStore = await cookies();
    const savedState = cookieStore.get("tiktok_oauth_state")?.value;
    cookieStore.delete("tiktok_oauth_state");

    if (!code || !state || state !== savedState) {
      return NextResponse.redirect(
        `${settingsUrl}&tiktok_error=${encodeURIComponent("State CSRF invalide. Reessaie.")}`
      );
    }

    // 3. Echanger le code contre des tokens
    const tokens = await exchangeCodeForTokens(code);
    console.log("[TikTok] Token exchange OK, open_id:", tokens.open_id, "scope:", tokens.scope);

    // 4. Recuperer les infos du profil TikTok (fallback si scope non autorise)
    let platformUserId = tokens.open_id;
    let platformUsername = "TikTok";
    try {
      const userInfo = await getUserInfo(tokens.access_token);
      platformUserId = userInfo.open_id || platformUserId;
      platformUsername = userInfo.display_name || userInfo.username || platformUsername;
      console.log("[TikTok] User info OK:", platformUsername, platformUserId);
    } catch (infoErr) {
      console.warn("[TikTok] getUserInfo failed (scope missing?), using open_id from token:", infoErr);
    }

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
          platform: "tiktok",
          platform_user_id: platformUserId,
          platform_username: platformUsername,
          access_token_encrypted: accessTokenEncrypted,
          refresh_token_encrypted: refreshTokenEncrypted,
          token_expires_at: tokenExpiresAt,
          scopes: tokens.scope ?? SCOPES_STR,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,project_id,platform" }
      );

    if (dbError) {
      console.error("[TikTok] social_connections upsert error:", dbError);
      return NextResponse.redirect(
        `${settingsUrl}&tiktok_error=${encodeURIComponent("Erreur sauvegarde: " + (dbError.message ?? "inconnue"))}`
      );
    }

    console.log("[TikTok] Connection saved, project_id:", projectId, "platform_user_id:", platformUserId);

    // 8. Rediriger vers les settings avec succes
    return NextResponse.redirect(
      `${settingsUrl}&tiktok_connected=1`
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[TikTok] OAuth callback error:", errMsg);
    return NextResponse.redirect(
      `${settingsUrl}&tiktok_error=${encodeURIComponent(errMsg.slice(0, 200))}`
    );
  }
}

const SCOPES_STR = "user.info.basic,video.publish,video.upload,video.list";
