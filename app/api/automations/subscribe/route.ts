// app/api/automations/subscribe/route.ts
// Abonne la page Facebook/Instagram de l'utilisateur aux webhooks Meta.
// Appelé quand une automation comment-to-DM est créée ou activée.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { decrypt } from "@/lib/crypto";
import { subscribePageToWebhooks } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function POST() {
  // 1. Vérifier auth
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  // 2. Chercher la connexion Facebook (on prend la page connectée)
  let query = supabaseAdmin
    .from("social_connections")
    .select("platform_user_id, access_token_encrypted")
    .eq("user_id", user.id)
    .eq("platform", "facebook");

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data: conn, error: connError } = await query.maybeSingle();

  if (connError || !conn?.access_token_encrypted) {
    return NextResponse.json(
      { error: "Aucune page Facebook connectée. Connecte ta page Facebook dans les paramètres d'abord." },
      { status: 404 }
    );
  }

  const pageId = conn.platform_user_id;
  const pageAccessToken = decrypt(conn.access_token_encrypted);

  // 3. Abonner la page aux webhooks
  console.log(`[subscribe] Subscribing page ${pageId} to webhooks...`);
  const result = await subscribePageToWebhooks(pageId, pageAccessToken);
  console.log(`[subscribe] Result: appOk=${result.appOk}, pageOk=${result.pageOk}, errors=${JSON.stringify(result.errors)}`);

  if (!result.pageOk) {
    return NextResponse.json({
      ok: false,
      error: "La souscription aux webhooks a échoué. Reconnecte ta page Facebook dans les paramètres.",
      details: result.errors,
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    appOk: result.appOk,
    pageOk: result.pageOk,
    errors: result.errors.length > 0 ? result.errors : undefined,
  });
}
