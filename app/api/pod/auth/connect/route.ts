// POST /api/pod/auth/connect
// Appelé par l'extension Chrome après que le user s'est connecté à
// Tipote ET a chargé sa page LinkedIn. L'extension lit son URN LinkedIn
// depuis la page (window.__lipi || appel Voyager `/me`) et l'envoie ici.
//
// On enregistre le mapping Tipote user → LinkedIn URN, auto-join le pod
// FR seed si la langue est 'fr', et on renvoie l'état pour que l'exten-
// sion sache à quoi s'attendre.
//
// L'auth se fait par cookie Supabase (l'extension fait son fetch avec
// `credentials: 'include'`, le cookie Tipote suit). Pas de token séparé
// en v1 pour rester simple.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autoJoinSeedPod } from "@/lib/podBoostService";

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    linkedin_urn?: string;
    full_name?: string;
    headline?: string;
    profile_url?: string;
    language_detected?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const urn = (body.linkedin_urn ?? "").trim();
  // Format URN LinkedIn : `urn:li:person:<id>` ou `urn:li:member:<id>`.
  // Garde-fou minimal pour ne pas stocker n'importe quoi.
  if (!/^urn:li:(person|member):[A-Za-z0-9_-]+$/.test(urn)) {
    return NextResponse.json({ ok: false, error: "invalid_linkedin_urn" }, { status: 400 });
  }

  // Conflit possible si un autre user Tipote a déjà ce URN (compte par-
  // tagé, switch d'account…). Dans ce cas on refuse — un LinkedIn ne
  // peut être lié qu'à un seul Tipote.
  const { data: existing } = await supabaseAdmin
    .from("pod_linkedin_profiles")
    .select("user_id")
    .eq("linkedin_urn", urn)
    .maybeSingle();

  if (existing && existing.user_id !== user.id) {
    return NextResponse.json(
      { ok: false, error: "linkedin_already_linked_to_other_account" },
      { status: 409 },
    );
  }

  const { error: upsertErr } = await supabaseAdmin
    .from("pod_linkedin_profiles")
    .upsert({
      user_id: user.id,
      linkedin_urn: urn,
      full_name: body.full_name ?? null,
      headline: body.headline ?? null,
      profile_url: body.profile_url ?? null,
      language_detected: body.language_detected ?? null,
      last_active_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (upsertErr) {
    console.error("[pod/auth/connect] upsert failed", upsertErr);
    return NextResponse.json({ ok: false, error: "upsert_failed" }, { status: 500 });
  }

  const joinResult = await autoJoinSeedPod(user.id, body.language_detected ?? null);

  return NextResponse.json({
    ok: true,
    user_id: user.id,
    linkedin_urn: urn,
    auto_joined: joinResult,
  });
}
