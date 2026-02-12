// app/api/auth/linkedin/callback/route.ts
// Callback OAuth LinkedIn : échange le code, stocke les tokens chiffrés.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { exchangeCodeForTokens, getUserInfo } from "@/lib/linkedin";
import { encrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const settingsUrl = `${appUrl}/settings?tab=settings`;

  try {
    // 1. Vérifier l'authentification Tipote
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${appUrl}/login`);
    }

    // 2. Vérifier le state CSRF
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      const desc = url.searchParams.get("error_description") ?? error;
      return NextResponse.redirect(
        `${settingsUrl}&linkedin_error=${encodeURIComponent(desc)}`
      );
    }

    const cookieStore = await cookies();
    const savedState = cookieStore.get("linkedin_oauth_state")?.value;
    cookieStore.delete("linkedin_oauth_state");

    if (!code || !state || state !== savedState) {
      return NextResponse.redirect(
        `${settingsUrl}&linkedin_error=${encodeURIComponent("State CSRF invalide. Réessaie.")}`
      );
    }

    // 3. Échanger le code contre des tokens
    const tokens = await exchangeCodeForTokens(code);

    // 4. Récupérer les infos du profil LinkedIn
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
          platform: "linkedin",
          platform_user_id: userInfo.sub,
          platform_username: userInfo.name,
          access_token_encrypted: accessTokenEncrypted,
          refresh_token_encrypted: refreshTokenEncrypted,
          token_expires_at: tokenExpiresAt,
          scopes: tokens.scope ?? "openid profile email w_member_social",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,project_id,platform" }
      );

    if (dbError) {
      console.error("social_connections upsert error:", dbError);
      return NextResponse.redirect(
        `${settingsUrl}&linkedin_error=${encodeURIComponent("Erreur sauvegarde. Réessaie.")}`
      );
    }

    // 8. Rediriger vers les settings avec succès
    return NextResponse.redirect(
      `${settingsUrl}&linkedin_connected=1`
    );
  } catch (err) {
    console.error("LinkedIn OAuth callback error:", err);
    return NextResponse.redirect(
      `${settingsUrl}&linkedin_error=${encodeURIComponent("Erreur de connexion LinkedIn. Réessaie.")}`
    );
  }
}
