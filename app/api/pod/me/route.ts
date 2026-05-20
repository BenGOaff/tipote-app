// GET /api/pod/me
// État du user Tipote Boost : profil LinkedIn connecté ?, pods auxquels
// il appartient, karma. Appelé par l'extension au démarrage pour savoir
// si elle doit afficher l'onboarding ou la queue de tâches, et par la
// page /boost de Tipote pour afficher le dashboard.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [profileRes, membershipsRes, karmaRes] = await Promise.all([
    supabaseAdmin
      .from("pod_linkedin_profiles")
      .select("linkedin_urn, full_name, headline, profile_url, language_detected, connected_at, last_active_at")
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
