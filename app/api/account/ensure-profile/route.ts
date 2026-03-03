// app/api/account/ensure-profile/route.ts
// Ensures the authenticated user has a row in "profiles".
// Called from auth callback so every user — even if Systeme.io webhook missed — has a profile.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const userId = session.user.id;
    const email = (session.user.email ?? "").toLowerCase();

    // Check if profile row already exists
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id,email,plan")
      .eq("id", userId)
      .maybeSingle();

    if (existing?.id) {
      // Profile exists — if email is missing, update it
      if (!existing.email && email) {
        await supabaseAdmin
          .from("profiles")
          .update({ email, updated_at: new Date().toISOString() })
          .eq("id", userId);
      }
      return NextResponse.json({ ok: true, action: "exists", plan: existing.plan });
    }

    // Create profile row with default plan "free"
    // (webhook would set it to "beta" if it fires; if not, admin can fix it)
    const { error: insertErr } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      email: email || null,
      plan: "free",
      updated_at: new Date().toISOString(),
    });

    if (insertErr) {
      // Possible race condition: profile was created between SELECT and INSERT
      // Just ignore duplicate key errors
      if (!insertErr.message?.includes("duplicate")) {
        console.error("[ensure-profile] Insert error:", insertErr);
        return NextResponse.json({ ok: false, error: insertErr.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true, action: "created", plan: "free" });
  } catch (e) {
    console.error("[ensure-profile] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
