// app/api/auth/meta/callback/route.ts
// Callback OAuth Facebook : echange le code, recupere les Pages + Threads,
// stocke les tokens chiffres pour Facebook et Threads.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getUserPages,
  getThreadsUser,
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
    const shortLived = await exchangeCodeForToken(code);

    // 4. Echanger contre un long-lived token (~60 jours)
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);

    // 5. Recuperer les Pages Facebook
    const pages = await getUserPages(longLived.access_token);

    if (pages.length === 0) {
      return NextResponse.redirect(
        `${settingsUrl}&meta_error=${encodeURIComponent(
          "Aucune Page Facebook trouvee. Assure-toi d'avoir une Page Facebook et d'avoir accorde les permissions."
        )}`
      );
    }

    // 6. Prendre la premiere page (v1 : selection automatique)
    const page = pages[0];

    const projectId = await getActiveProjectId(supabase, user.id);
    const tokenExpiresAt = new Date(
      Date.now() + longLived.expires_in * 1000
    ).toISOString();

    // 7. Stocker la connexion Facebook (Page)
    // Le Page Access Token herite d'un long-lived user token est lui-meme long-lived
    const pageTokenEncrypted = encrypt(page.access_token);

    const { error: fbError } = await supabase
      .from("social_connections")
      .upsert(
        {
          user_id: user.id,
          project_id: projectId ?? null,
          platform: "facebook",
          platform_user_id: page.id, // Page ID
          platform_username: page.name, // Nom de la Page
          access_token_encrypted: pageTokenEncrypted,
          refresh_token_encrypted: null, // Pas de refresh token pour les Page tokens
          token_expires_at: tokenExpiresAt,
          scopes: "pages_show_list,pages_manage_posts,pages_read_engagement",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,project_id,platform" }
      );

    if (fbError) {
      console.error("Facebook social_connections upsert error:", fbError);
    }

    // 8. Detecter le compte Threads et stocker la connexion
    // Threads utilise le USER access token (pas le page token)
    let threadsConnected = false;
    const threadsUser = await getThreadsUser(longLived.access_token);

    if (threadsUser) {
      const userTokenEncrypted = encrypt(longLived.access_token);

      const { error: threadsError } = await supabase
        .from("social_connections")
        .upsert(
          {
            user_id: user.id,
            project_id: projectId ?? null,
            platform: "threads",
            platform_user_id: threadsUser.id, // Threads User ID
            platform_username: threadsUser.username ?? threadsUser.name ?? page.name,
            access_token_encrypted: userTokenEncrypted, // User token, pas page token
            refresh_token_encrypted: null,
            token_expires_at: tokenExpiresAt,
            scopes: "threads_basic,threads_content_publish",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,project_id,platform" }
        );

      if (threadsError) {
        console.error("Threads social_connections upsert error:", threadsError);
      } else {
        threadsConnected = true;
      }
    }

    // 9. Rediriger vers les settings avec succes
    const successParam = threadsConnected
      ? "meta_connected=facebook,threads"
      : "meta_connected=facebook";

    return NextResponse.redirect(`${settingsUrl}&${successParam}`);
  } catch (err) {
    console.error("Meta OAuth callback error:", err);
    return NextResponse.redirect(
      `${settingsUrl}&meta_error=${encodeURIComponent(
        "Erreur de connexion Facebook/Threads. Reessaie."
      )}`
    );
  }
}
