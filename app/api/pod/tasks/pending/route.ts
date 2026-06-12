// GET /api/pod/tasks/pending
// L'extension polle ce endpoint (en attendant Supabase Realtime, Phase 4)
// pour récupérer les tâches d'engagement assignées au user courant et
// non encore traitées. On retourne aussi les infos minimales du post
// sous-jacent (URN + URL + excerpt) pour que l'extension puisse afficher
// la badge UI sans aller chercher d'autres endpoints.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // pending OR liked — l'extension a besoin des liked aussi parce que
  // c'est l'état "j'ai liké mais pas encore commenté", l'utilisateur
  // pourra valider le commentaire plus tard quand il rescrolle son fil.
  const { data, error } = await supabaseAdmin
    .from("pod_engagement_tasks")
    .select(
      "id, status, auto_like, ai_comment_suggestions, created_at, " +
      "pod_posts!inner(id, linkedin_post_urn, post_url, content_excerpt, language, eligible_until, author_user_id)"
    )
    .eq("assigned_user_id", user.id)
    .in("status", ["pending", "liked"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[pod/tasks/pending] query failed", error);
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  // Filtre côté API les tâches dont le post est expiré (au-delà de 6h
  // post-publication) pour éviter que l'extension ne tente d'engager
  // un vieux post (signal algo LinkedIn négatif).
  const now = Date.now();
  const tasks = (data ?? []).filter((t) => {
    const eu = (t as unknown as { pod_posts: { eligible_until: string } }).pod_posts?.eligible_until;
    return !eu || new Date(eu).getTime() > now;
  });

  return NextResponse.json({ ok: true, tasks });
}
