// app/api/auth/meta/callback/route.ts
// Callback OAuth Facebook : échange le code, récupère les Pages + IG,
// stocke les tokens chiffrés pour Facebook et Instagram.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getUserPages,
} from "@/lib/meta";
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

    // 2. Vérifier le state CSRF
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
        `${settingsUrl}&meta_error=${encodeURIComponent("State CSRF invalide. Réessaie.")}`
      );
    }

    // 3. Échanger le code contre un short-lived token
    const shortLived = await exchangeCodeForToken(code);

    // 4. Échanger contre un long-lived token (~60 jours)
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);

    // 5. Récupérer les Pages Facebook + comptes IG liés
    const pages = await getUserPages(longLived.access_token);

    if (pages.length === 0) {
      return NextResponse.redirect(
        `${settingsUrl}&meta_error=${encodeURIComponent(
          "Aucune Page Facebook trouvée. Assure-toi d'avoir une Page Facebook et d'avoir accordé les permissions."
        )}`
      );
    }

    // 6. Prendre la première page (v1 : sélection automatique)
    const page = pages[0];

    const projectId = await getActiveProjectId(supabase, user.id);
    const tokenExpiresAt = new Date(
      Date.now() + longLived.expires_in * 1000
    ).toISOString();

    // 7. Stocker la connexion Facebook (Page)
    // Le Page Access Token hérité d'un long-lived user token est lui-même long-lived
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

    // 8. Si un compte Instagram Business est lié, stocker aussi cette connexion
    let igConnected = false;
    if (page.instagram_business_account?.id) {
      const igUserId = page.instagram_business_account.id;

      // Récupérer le username IG
      let igUsername = page.name; // fallback : nom de la page
      try {
        const igInfoRes = await fetch(
          `https://graph.facebook.com/v21.0/${igUserId}?fields=username,name&access_token=${page.access_token}`
        );
        if (igInfoRes.ok) {
          const igInfo = await igInfoRes.json();
          igUsername = igInfo.username ?? igInfo.name ?? page.name;
        }
      } catch {
        // fallback au nom de la page
      }

      const { error: igError } = await supabase
        .from("social_connections")
        .upsert(
          {
            user_id: user.id,
            project_id: projectId ?? null,
            platform: "instagram",
            platform_user_id: igUserId, // IG Business Account ID
            platform_username: igUsername,
            access_token_encrypted: pageTokenEncrypted, // Même token que la Page
            refresh_token_encrypted: null,
            token_expires_at: tokenExpiresAt,
            scopes: "instagram_basic,instagram_content_publish",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,project_id,platform" }
        );

      if (igError) {
        console.error("Instagram social_connections upsert error:", igError);
      } else {
        igConnected = true;
      }
    }

    // 9. Rediriger vers les settings avec succès
    const successParam = igConnected
      ? "meta_connected=facebook,instagram"
      : "meta_connected=facebook";

    return NextResponse.redirect(`${settingsUrl}&${successParam}`);
  } catch (err) {
    console.error("Meta OAuth callback error:", err);
    return NextResponse.redirect(
      `${settingsUrl}&meta_error=${encodeURIComponent(
        "Erreur de connexion Facebook/Instagram. Réessaie."
      )}`
    );
  }
}
