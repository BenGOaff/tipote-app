// app/api/social/tiktok-videos/route.ts
// GET : liste les vidéos TikTok récentes du user connecté.
// Utilisé par le PostPickerModal pour sélectionner un post cible.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { decrypt } from "@/lib/crypto";
import { refreshSocialToken } from "@/lib/refreshSocialToken";
import { listVideos } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  // Récupérer la connexion TikTok
  let connQuery = supabase
    .from("social_connections")
    .select("id, platform_user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("user_id", user.id)
    .eq("platform", "tiktok");

  if (projectId) connQuery = connQuery.eq("project_id", projectId);

  const { data: conn } = await connQuery.maybeSingle();

  if (!conn?.access_token_encrypted) {
    return NextResponse.json(
      { error: "TikTok non connecté. Va dans Paramètres pour connecter ton compte." },
      { status: 400 }
    );
  }

  // Vérifier / rafraîchir le token
  let accessToken: string;
  const REFRESH_BUFFER_MS = 5 * 60 * 1000;
  const isExpired = conn.token_expires_at &&
    new Date(conn.token_expires_at) < new Date(Date.now() + REFRESH_BUFFER_MS);

  if (isExpired) {
    const refreshResult = await refreshSocialToken(conn.id, "tiktok", conn.refresh_token_encrypted ?? null);
    if (!refreshResult.ok || !refreshResult.accessToken) {
      return NextResponse.json(
        { error: "Token TikTok expiré. Reconnecte ton compte dans les Paramètres." },
        { status: 401 }
      );
    }
    accessToken = refreshResult.accessToken;
  } else {
    try {
      accessToken = decrypt(conn.access_token_encrypted);
    } catch {
      return NextResponse.json(
        { error: "Erreur de déchiffrement du token TikTok." },
        { status: 500 }
      );
    }
  }

  // Lister les vidéos
  const { videos } = await listVideos(accessToken, 20);

  return NextResponse.json({ ok: true, videos });
}
