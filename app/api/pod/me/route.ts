// GET /api/pod/me
// État du user Tipote Boost : profil LinkedIn connecté ?, pods auxquels
// il appartient, karma. Appelé par l'extension au démarrage pour savoir
// si elle doit afficher l'onboarding ou la queue de tâches, et par la
// page /boost de Tipote pour afficher le dashboard.
//
// PATCH { auto_like_enabled: boolean } : opt-in/out des likes
// automatiques du pod (Béné 12 juin 2026). Le flag est figé sur chaque
// tâche AU MOMENT du fan-out : changer le réglage n'affecte que les
// publications futures.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recordExtVersion } from "@/lib/extVersion";

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  recordExtVersion(req, user.id);

  const [profileRes, membershipsRes, karmaRes] = await Promise.all([
    supabaseAdmin
      .from("pod_linkedin_profiles")
      .select("linkedin_urn, full_name, headline, profile_url, language_detected, connected_at, last_active_at, auto_like_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabaseAdmin
      .from("pod_memberships")
      .select("pod_id, role, status, joined_at, pods!inner(id, slug, name, language, domain_tags, member_count)")
      .eq("user_id", user.id),
    supabaseAdmin
      .from("pod_karma")
      .select("boosts_given, boosts_received, weekly_quota, current_week_given, current_week_received, week_start")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    ok: true,
    linkedin_profile: profileRes.data ?? null,
    memberships: membershipsRes.data ?? [],
    karma: karmaRes.data ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body?.auto_like_enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("pod_linkedin_profiles")
    .update({ auto_like_enabled: body.auto_like_enabled })
    .eq("user_id", user.id);

  if (error) {
    console.error("[pod/me] auto_like_enabled update failed", error.message);
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, auto_like_enabled: body.auto_like_enabled });
}
