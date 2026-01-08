// app/api/onboarding/complete/route.ts
// Mark onboarding as completed (business_profiles.onboarding_completed)

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("business_profiles")
      .upsert(
        {
          user_id: user.id,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // Non-bloquant : on déclenche la génération stratégie + sync tâches.
    // (Le client le fait déjà, mais on double-sécurise si jamais l’utilisateur ferme l’onglet.)
    try {
      const origin = new URL(req.url).origin;
      const cookie = req.headers.get("cookie") ?? "";

      void fetch(`${origin}/api/strategy`, {
        method: "POST",
        headers: cookie ? { cookie } : undefined,
      });

      void fetch(`${origin}/api/tasks/sync`, {
        method: "POST",
        headers: cookie ? { cookie } : undefined,
      });
    } catch (e) {
      // On ne bloque jamais la complétion onboarding
      console.error("Non-blocking post-onboarding triggers failed:", e);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
