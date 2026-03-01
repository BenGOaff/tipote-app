// app/api/social/pinterest-boards/route.ts
// GET  : retourne la liste des tableaux Pinterest de l'utilisateur connecté.
// POST : crée un nouveau tableau Pinterest (nécessite boards:write).
// Utilisé par le sélecteur de tableau dans l'éditeur de contenu.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { decrypt } from "@/lib/crypto";
import { refreshSocialToken } from "@/lib/refreshSocialToken";
import { getUserBoards, createBoard } from "@/lib/pinterest";

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

  // Récupérer la connexion Pinterest
  let connQuery = supabase
    .from("social_connections")
    .select(
      "id, access_token_encrypted, refresh_token_encrypted, token_expires_at"
    )
    .eq("user_id", user.id)
    .eq("platform", "pinterest");

  if (projectId) connQuery = connQuery.eq("project_id", projectId);

  const { data: conn1 } = await connQuery.single();
  let connection = conn1;

  // Fallback admin si besoin
  if (!connection?.access_token_encrypted) {
    let adminQuery = supabaseAdmin
      .from("social_connections")
      .select(
        "id, access_token_encrypted, refresh_token_encrypted, token_expires_at"
      )
      .eq("user_id", user.id)
      .eq("platform", "pinterest");
    if (projectId) adminQuery = adminQuery.eq("project_id", projectId);
    const { data: conn2 } = await adminQuery.single();
    connection = conn2;
  }

  if (!connection?.access_token_encrypted) {
    return NextResponse.json(
      { error: "Pinterest non connecté." },
      { status: 400 }
    );
  }

  // Rafraîchir le token si expiré (buffer 5 min)
  let accessToken: string;
  const REFRESH_BUFFER_MS = 5 * 60 * 1000;
  if (
    connection.token_expires_at &&
    new Date(connection.token_expires_at) < new Date(Date.now() + REFRESH_BUFFER_MS)
  ) {
    const refreshResult = await refreshSocialToken(
      connection.id,
      "pinterest",
      connection.refresh_token_encrypted
    );
    if (!refreshResult.ok || !refreshResult.accessToken) {
      return NextResponse.json(
        {
          error:
            "Token Pinterest expiré. Reconnecte ton compte dans les Paramètres.",
        },
        { status: 401 }
      );
    }
    accessToken = refreshResult.accessToken;
  } else {
    try {
      accessToken = decrypt(connection.access_token_encrypted);
    } catch {
      return NextResponse.json(
        { error: "Erreur de déchiffrement du token Pinterest." },
        { status: 500 }
      );
    }
  }

  // Récupérer les tableaux
  try {
    const boards = await getUserBoards(accessToken);
    return NextResponse.json({ ok: true, boards });
  } catch (err: any) {
    console.error("[pinterest-boards] getUserBoards error:", err.message);
    return NextResponse.json(
      { error: `Impossible de récupérer les tableaux : ${err.message}` },
      { status: 500 }
    );
  }
}

/**
 * POST : crée un nouveau tableau Pinterest.
 * Body : { name: string, description?: string, privacy?: "PUBLIC" | "SECRET" }
 */
export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const boardName = (body?.name as string | undefined)?.trim();
  if (!boardName) {
    return NextResponse.json(
      { error: "Le nom du tableau est requis." },
      { status: 400 }
    );
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  // Récupérer la connexion Pinterest
  let connQuery = supabase
    .from("social_connections")
    .select(
      "id, access_token_encrypted, refresh_token_encrypted, token_expires_at"
    )
    .eq("user_id", user.id)
    .eq("platform", "pinterest");
  if (projectId) connQuery = connQuery.eq("project_id", projectId);
  const { data: conn1 } = await connQuery.single();
  let connection = conn1;

  if (!connection?.access_token_encrypted) {
    let adminQuery = supabaseAdmin
      .from("social_connections")
      .select(
        "id, access_token_encrypted, refresh_token_encrypted, token_expires_at"
      )
      .eq("user_id", user.id)
      .eq("platform", "pinterest");
    if (projectId) adminQuery = adminQuery.eq("project_id", projectId);
    const { data: conn2 } = await adminQuery.single();
    connection = conn2;
  }

  if (!connection?.access_token_encrypted) {
    return NextResponse.json(
      { error: "Pinterest non connecté." },
      { status: 400 }
    );
  }

  // Résoudre le token (rafraîchir si expiré)
  let accessToken: string;
  const REFRESH_BUFFER_MS = 5 * 60 * 1000;
  if (
    connection.token_expires_at &&
    new Date(connection.token_expires_at) <
      new Date(Date.now() + REFRESH_BUFFER_MS)
  ) {
    const refreshResult = await refreshSocialToken(
      connection.id,
      "pinterest",
      connection.refresh_token_encrypted
    );
    if (!refreshResult.ok || !refreshResult.accessToken) {
      return NextResponse.json(
        { error: "Token Pinterest expiré. Reconnecte ton compte." },
        { status: 401 }
      );
    }
    accessToken = refreshResult.accessToken;
  } else {
    try {
      accessToken = decrypt(connection.access_token_encrypted);
    } catch {
      return NextResponse.json(
        { error: "Erreur de déchiffrement du token Pinterest." },
        { status: 500 }
      );
    }
  }

  // Créer le tableau
  try {
    const result = await createBoard(
      accessToken,
      boardName,
      body?.description,
      body?.privacy ?? "PUBLIC"
    );
    if (!result.ok) {
      console.error("[pinterest-boards] createBoard error:", result.error);
      return NextResponse.json(
        { error: result.error ?? "Impossible de créer le tableau." },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, board: result.board });
  } catch (err: any) {
    console.error("[pinterest-boards] createBoard error:", err.message);
    return NextResponse.json(
      { error: `Impossible de créer le tableau : ${err.message}` },
      { status: 500 }
    );
  }
}
