// app/api/social/connections/route.ts
// GET  : liste les comptes sociaux connectés de l'user
// DELETE : déconnecte un compte (body: { id })

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

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

  // Récupérer les connexions (sans les tokens chiffrés !)
  let query = supabase
    .from("social_connections")
    .select("id, platform, platform_user_id, platform_username, token_expires_at, scopes, created_at, updated_at")
    .eq("user_id", user.id);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) {
    console.error("social_connections list error:", error);
    return NextResponse.json({ error: "Erreur DB" }, { status: 500 });
  }

  // Ajouter un flag "expired" pour l'UI
  const connections = (data ?? []).map((c) => ({
    ...c,
    expired: c.token_expires_at ? new Date(c.token_expires_at) < new Date() : false,
  }));

  return NextResponse.json({ ok: true, connections });
}

export async function DELETE(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const connectionId = body?.id as string | undefined;

  if (!connectionId) {
    return NextResponse.json({ error: "id manquant" }, { status: 400 });
  }

  const { error } = await supabase
    .from("social_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", user.id); // sécurité : ne supprime que ses propres connexions

  if (error) {
    console.error("social_connections delete error:", error);
    return NextResponse.json({ error: "Erreur DB" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
