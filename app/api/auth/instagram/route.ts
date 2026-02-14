// app/api/auth/instagram/route.ts
// Decouvre le compte Instagram Business/Creator depuis la connexion Facebook existante.
// Pas d'OAuth separe : on reutilise le Page token Facebook deja stocke.
// POST (pas GET) car c'est une action qui cree une connexion.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { getInstagramBusinessAccount } from "@/lib/meta";
import { decrypt, encrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  // 1. Chercher la connexion Facebook existante
  let fbQuery = supabase
    .from("social_connections")
    .select("id, platform_user_id, access_token_encrypted, token_expires_at")
    .eq("user_id", user.id)
    .eq("platform", "facebook");

  if (projectId) {
    fbQuery = fbQuery.eq("project_id", projectId);
  } else {
    fbQuery = fbQuery.is("project_id", null);
  }

  const { data: fbConnection } = await fbQuery.maybeSingle();

  if (!fbConnection) {
    return NextResponse.json(
      { error: "Connecte d'abord ta Page Facebook, puis clique sur Connecter Instagram." },
      { status: 400 }
    );
  }

  // 2. Verifier que le token Facebook n'est pas expire
  if (fbConnection.token_expires_at && new Date(fbConnection.token_expires_at) < new Date()) {
    return NextResponse.json(
      { error: "Ton token Facebook est expire. Reconnecte Facebook d'abord, puis Instagram." },
      { status: 401 }
    );
  }

  // 3. Dechiffrer le Page token Facebook
  let pageToken: string;
  try {
    pageToken = decrypt(fbConnection.access_token_encrypted);
  } catch {
    return NextResponse.json(
      { error: "Erreur de dechiffrement du token Facebook. Reconnecte Facebook." },
      { status: 500 }
    );
  }

  const pageId = fbConnection.platform_user_id;
  if (!pageId) {
    return NextResponse.json(
      { error: "ID de Page Facebook manquant. Reconnecte Facebook." },
      { status: 500 }
    );
  }

  // 4. Decouvrir le compte Instagram Business lie a la Page
  console.log(`[Instagram discover] Looking for IG account on page ${pageId}...`);
  const igAccount = await getInstagramBusinessAccount(pageToken, pageId);

  if (!igAccount) {
    return NextResponse.json(
      {
        error:
          "Aucun compte Instagram Business/Creator trouve lie a ta Page Facebook. " +
          "Assure-toi que ton compte Instagram est en mode Business ou Creator " +
          "et qu'il est lie a ta Page Facebook (Parametres Instagram > Compte > Pages liees).",
      },
      { status: 404 }
    );
  }

  console.log(`[Instagram discover] Found: @${igAccount.username ?? igAccount.name} (${igAccount.id})`);

  // 5. Stocker la connexion Instagram (meme Page token, meme expiration)
  const connectionData = {
    user_id: user.id,
    project_id: projectId ?? null,
    platform: "instagram" as const,
    platform_user_id: igAccount.id,
    platform_username: igAccount.username ?? igAccount.name ?? "Instagram",
    access_token_encrypted: encrypt(pageToken), // meme token que Facebook (Page token)
    refresh_token_encrypted: null,
    token_expires_at: fbConnection.token_expires_at,
    scopes: "instagram_basic,instagram_content_publish",
    updated_at: new Date().toISOString(),
  };

  // Upsert : chercher si une connexion Instagram existe deja
  let findQuery = supabase
    .from("social_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("platform", "instagram");

  if (projectId) {
    findQuery = findQuery.eq("project_id", projectId);
  } else {
    findQuery = findQuery.is("project_id", null);
  }

  const { data: existing } = await findQuery.maybeSingle();

  let dbError;
  if (existing) {
    const result = await supabase
      .from("social_connections")
      .update(connectionData)
      .eq("id", existing.id);
    dbError = result.error;
  } else {
    const result = await supabase
      .from("social_connections")
      .insert(connectionData);
    dbError = result.error;
  }

  if (dbError) {
    console.error("[Instagram discover] DB error:", JSON.stringify(dbError));
    return NextResponse.json(
      { error: `Erreur de sauvegarde: ${dbError.message ?? "inconnue"}` },
      { status: 500 }
    );
  }

  console.log("[Instagram discover] Connection saved!");
  return NextResponse.json({
    ok: true,
    username: igAccount.username ?? igAccount.name,
    igUserId: igAccount.id,
  });
}
