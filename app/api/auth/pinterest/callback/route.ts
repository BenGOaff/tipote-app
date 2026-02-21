// app/api/auth/pinterest/callback/route.ts
// Callback OAuth Pinterest : échange le code, stocke les tokens chiffrés.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { exchangeCodeForTokens, getUserInfo } from "@/lib/pinterest";
import { encrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const settingsUrl = `${appUrl}/settings?tab=connections`;

  try {
    // 1. Vérifier l'authentification Tipote
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${appUrl}/login`);
    }

    // 2. Lire les paramètres de retour
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      const desc =
        error === "access_denied"
          ? "Accès refusé par l'utilisateur."
          : error;
      return NextResponse.redirect(
        `${settingsUrl}&pinterest_error=${encodeURIComponent(desc)}`
      );
    }

    // 3. Vérifier le state CSRF
    const cookieStore = await cookies();
    const savedState = cookieStore.get("pinterest_oauth_state")?.value;
    cookieStore.delete("pinterest_oauth_state");

    if (!code || !state || state !== savedState) {
      return NextResponse.redirect(
        `${settingsUrl}&pinterest_error=${encodeURIComponent(
          "State CSRF invalide. Réessaie."
        )}`
      );
    }

    // 4. Échanger le code contre des tokens
    const tokens = await exchangeCodeForTokens(code);

    // 5. Récupérer les infos du profil Pinterest
    const userInfo = await getUserInfo(tokens.access_token);

    // 6. Chiffrer les tokens
    const accessTokenEncrypted = encrypt(tokens.access_token);
    const refreshTokenEncrypted = tokens.refresh_token
      ? encrypt(tokens.refresh_token)
      : null;

    // 7. Calculer l'expiration de l'access token (30 jours typiquement)
    const tokenExpiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString();

    // 8. Upsert dans social_connections
    const projectId = await getActiveProjectId(supabase, user.id);

    const { error: dbError } = await supabase
      .from("social_connections")
      .upsert(
        {
          user_id: user.id,
          project_id: projectId ?? null,
          platform: "pinterest",
          platform_user_id: userInfo.id,
          platform_username: userInfo.username,
          access_token_encrypted: accessTokenEncrypted,
          refresh_token_encrypted: refreshTokenEncrypted,
          token_expires_at: tokenExpiresAt,
          scopes: tokens.scope ?? "boards:read,pins:write,user_accounts:read",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,project_id,platform" }
      );

    if (dbError) {
      console.error("social_connections upsert error (pinterest):", dbError);
      return NextResponse.redirect(
        `${settingsUrl}&pinterest_error=${encodeURIComponent(
          "Erreur de sauvegarde. Réessaie."
        )}`
      );
    }

    // 9. Rediriger vers les settings avec succès
    return NextResponse.redirect(`${settingsUrl}&pinterest_connected=1`);
  } catch (err) {
    console.error("Pinterest OAuth callback error:", err);
    return NextResponse.redirect(
      `${settingsUrl}&pinterest_error=${encodeURIComponent(
        "Erreur de connexion Pinterest. Réessaie."
      )}`
    );
  }
}
