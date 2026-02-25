// app/api/social/linkedin-posts/route.ts
// GET : retourne les posts LinkedIn récents de l'utilisateur connecté.
// Utilisé par le PostPicker dans les automatisations.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/crypto";
import { refreshSocialToken } from "@/lib/refreshSocialToken";
import { getMyPosts } from "@/lib/linkedin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Récupérer la connexion LinkedIn
  const { data: conn } = await supabaseAdmin
    .from("social_connections")
    .select("id, platform_user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("user_id", userId)
    .eq("platform", "linkedin")
    .maybeSingle();

  if (!conn?.access_token_encrypted) {
    return NextResponse.json(
      { error: "Aucun compte LinkedIn connecté. Connecte-le dans Paramètres > Connexions." },
      { status: 404 },
    );
  }

  // Vérifier / rafraîchir le token
  let accessToken: string;
  const REFRESH_BUFFER_MS = 5 * 60 * 1000;
  const isExpired =
    conn.token_expires_at &&
    new Date(conn.token_expires_at) < new Date(Date.now() + REFRESH_BUFFER_MS);

  if (isExpired) {
    const refreshResult = await refreshSocialToken(conn.id, "linkedin", conn.refresh_token_encrypted ?? null);
    if (!refreshResult.ok || !refreshResult.accessToken) {
      return NextResponse.json(
        { error: "Token LinkedIn expiré. Reconnecte ton compte LinkedIn." },
        { status: 401 },
      );
    }
    accessToken = refreshResult.accessToken;
  } else {
    try {
      accessToken = decrypt(conn.access_token_encrypted);
    } catch {
      return NextResponse.json(
        { error: "Impossible de déchiffrer le token LinkedIn." },
        { status: 500 },
      );
    }
  }

  try {
    const posts = await getMyPosts(accessToken, conn.platform_user_id, 20);

    // Formater pour le PostPickerModal (même shape que facebook/instagram/tiktok)
    const formatted = posts.map((p) => ({
      id: p.urn,
      message: p.text || "(post sans texte)",
      created_time: p.created ? new Date(p.created).toISOString() : "",
      permalink_url: `https://www.linkedin.com/feed/update/${encodeURIComponent(p.urn)}/`,
    }));

    return NextResponse.json({ posts: formatted });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[linkedin-posts] Error:", errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
