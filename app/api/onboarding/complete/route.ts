// app/api/onboarding/complete/route.ts
// Mark onboarding as completed (business_profiles.onboarding_completed)
// V2: can also set diagnostic_completed=true

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

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const now = new Date().toISOString();

    const patch: Record<string, unknown> = {
      onboarding_completed: true,
      updated_at: now,
    };

    // ✅ V2: si fourni, on le persiste (sinon on ne touche pas)
    if (typeof body?.diagnostic_completed === "boolean") {
      patch.diagnostic_completed = body.diagnostic_completed;
    }

    const { error: updateError } = await supabase.from("business_profiles").update(patch).eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 400 });
    }

    // Triggers non bloquants : on ne change rien ici (sécurité prod).
    // La génération stratégie est gérée ailleurs (/api/strategy) et doit rester robuste.
    try {
      // no-op volontaire (garde le comportement safe existant)
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
