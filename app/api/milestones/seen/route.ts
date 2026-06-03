// app/api/milestones/seen/route.ts
//
// POST { ids: string[] } : marque les milestones comme vus (seen_at = now())
// pour l'user connecté. Appelé par <MilestoneToastListener /> après
// affichage des toasts dans le dashboard.
//
// RLS : la policy UPDATE sur user_milestones force auth.uid() = user_id,
// donc même si un user envoie des IDs qui ne lui appartiennent pas, ils
// ne seront pas updated (silencieusement filtrés par RLS).

import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]) : [];
  const validIds = ids.filter((id): id is string => typeof id === "string" && id.length > 0);

  if (validIds.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const now = new Date();
  const { error, count } = await supabase
    .from("user_milestones")
    .update({ seen_at: now.toISOString() }, { count: "exact" })
    .eq("user_id", user.id)
    .is("seen_at", null)
    .in("id", validIds);

  if (error) {
    console.error("[milestones/seen] update failed", error.message);
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  // Rate-limit serveur (Béné 3 juin 2026) : programme le prochain batch
  // de toasts dans 7 jours. La route /unseen filtre dessus et retourne
  // vide tant que cette date n'est pas dépassée. Donc max 1×/semaine.
  const nextAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  await supabase
    .from("profiles")
    .update({ next_milestone_toast_at: nextAt.toISOString() })
    .eq("id", user.id);

  return NextResponse.json({ ok: true, updated: count ?? 0 });
}
