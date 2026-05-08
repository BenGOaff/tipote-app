// GET /api/compta/connections
//
// Liste les connexions PSP de l'user pour le projet actif. Utilisé
// par l'onglet Compta pour afficher l'état (synchronisé il y a X
// minutes, erreur, déconnecté, etc.). On ne renvoie JAMAIS la clé
// chiffrée — uniquement les métadonnées.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  let q = supabaseAdmin
    .from("payment_connections")
    .select(
      "id, provider, last_sync_at, initial_sync_done_at, last_sync_error, disabled_at, created_at",
    )
    .eq("user_id", user.id);
  if (projectId) q = q.eq("project_id", projectId);

  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, connections: data ?? [] });
}
