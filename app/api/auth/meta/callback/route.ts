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

    // 4. Echanger contre un long-lived token (~60 jours)
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    console.log("[Facebook callback] Long-lived token OK, expires_in:", longLived.expires_in);

    // 5. Recuperer les Pages Facebook
    console.log("[Facebook callback] Fetching user pages...");
    const pages = await getUserPages(longLived.access_token);
    console.log("[Facebook callback] Pages found:", pages.length, JSON.stringify(pages.map(p => ({ id: p.id, name: p.name }))));

    if (pages.length === 0) {
      return NextResponse.redirect(
        `${settingsUrl}&meta_error=${encodeURIComponent(
          "Aucune Page Facebook trouvee. Assure-toi d'avoir une Page Facebook et d'avoir accorde les permissions pour cette Page pendant l'autorisation."
        )}`
      );
    }

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
      scopes: "pages_show_list,pages_manage_posts,pages_read_engagement",
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
