// app/api/auth/threads/callback/route.ts
// Callback OAuth Threads : echange le code, recupere le profil Threads,
// stocke le token chiffre pour Threads.
// Endpoint Threads : https://graph.threads.net/oauth/access_token

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import {
  exchangeThreadsCodeForToken,
  exchangeThreadsForLongLivedToken,
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
        `${settingsUrl}&threads_error=${encodeURIComponent(desc)}`
      );
    }

    const cookieStore = await cookies();
    const savedState = cookieStore.get("threads_oauth_state")?.value;
    cookieStore.delete("threads_oauth_state");

    if (!code || !state || state !== savedState) {
      return NextResponse.redirect(
        `${settingsUrl}&threads_error=${encodeURIComponent("State CSRF invalide. Reessaie.")}`
      );
    }

    // 3. Echanger le code contre un short-lived Threads token
    const shortLived = await exchangeThreadsCodeForToken(code);

    // 4. Echanger contre un long-lived token (~60 jours)
    const longLived = await exchangeThreadsForLongLivedToken(shortLived.access_token);

    // 5. Recuperer le profil Threads
    const threadsUser = await getThreadsUser(longLived.access_token);

    if (!threadsUser) {
      return NextResponse.redirect(
        `${settingsUrl}&threads_error=${encodeURIComponent(
          "Impossible de recuperer ton profil Threads. Assure-toi d'avoir un compte Threads actif."
        )}`
      );
    }

    // 6. Stocker la connexion Threads
    const projectId = await getActiveProjectId(supabase, user.id);
    const tokenExpiresAt = new Date(
      Date.now() + longLived.expires_in * 1000
    ).toISOString();

    const tokenEncrypted = encrypt(longLived.access_token);

    const { error: dbError } = await supabase
      .from("social_connections")
      .upsert(
        {
          user_id: user.id,
          project_id: projectId ?? null,
          platform: "threads",
          platform_user_id: threadsUser.id,
          platform_username: threadsUser.username ?? threadsUser.name ?? "Threads",
          access_token_encrypted: tokenEncrypted,
          refresh_token_encrypted: null,
          token_expires_at: tokenExpiresAt,
          scopes: "threads_basic,threads_content_publish",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,project_id,platform" }
      );

    if (dbError) {
      console.error("Threads social_connections upsert error:", dbError);
      return NextResponse.redirect(
        `${settingsUrl}&threads_error=${encodeURIComponent("Erreur de sauvegarde. Reessaie.")}`
      );
    }

    return NextResponse.redirect(`${settingsUrl}&threads_connected=1`);
  } catch (err) {
    console.error("Threads OAuth callback error:", err);
    return NextResponse.redirect(
      `${settingsUrl}&threads_error=${encodeURIComponent(
        "Erreur de connexion Threads. Reessaie."
      )}`
    );
  }
}
