// app/api/social/connections/route.ts
// GET  : liste les comptes sociaux connectés de l'user
// DELETE : déconnecte un compte (body: { id })

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { refreshSocialToken } from "@/lib/refreshSocialToken";

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

  // Récupérer les connexions (avec refresh_token pour pouvoir rafraîchir proactivement)
  let query = supabaseAdmin
    .from("social_connections")
    .select("id, platform, platform_user_id, platform_username, token_expires_at, refresh_token_encrypted, scopes, created_at, updated_at")
    .eq("user_id", user.id);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) {
    console.error("social_connections list error:", error);
    return NextResponse.json({ error: "Erreur DB" }, { status: 500 });
  }

  // Proactive token refresh: if a token is expired, try to refresh it automatically
  // before showing "expired" to the user. This prevents unnecessary manual reconnections.
  const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer
  const connections = await Promise.all(
    (data ?? []).map(async (c) => {
      const isExpired = c.token_expires_at
        ? new Date(c.token_expires_at) < new Date(Date.now() + REFRESH_BUFFER_MS)
        : false;

      if (isExpired && c.refresh_token_encrypted) {
        try {
          const result = await refreshSocialToken(c.id, c.platform, c.refresh_token_encrypted);
          if (result.ok) {
            // Token refreshed — fetch updated expiry from DB
            const { data: updated } = await supabaseAdmin
              .from("social_connections")
              .select("token_expires_at")
              .eq("id", c.id)
              .single();
            return {
              id: c.id,
              platform: c.platform,
              platform_user_id: c.platform_user_id,
              platform_username: c.platform_username,
              token_expires_at: updated?.token_expires_at ?? c.token_expires_at,
              scopes: c.scopes,
              created_at: c.created_at,
              updated_at: c.updated_at,
              expired: false,
            };
          }
        } catch (e) {
          console.error(`[connections] Proactive refresh failed for ${c.platform}:`, e);
        }
      }

      // Strip refresh_token_encrypted before sending to client
      return {
        id: c.id,
        platform: c.platform,
        platform_user_id: c.platform_user_id,
        platform_username: c.platform_username,
        token_expires_at: c.token_expires_at,
        scopes: c.scopes,
        created_at: c.created_at,
        updated_at: c.updated_at,
        expired: isExpired,
      };
    })
  );

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
