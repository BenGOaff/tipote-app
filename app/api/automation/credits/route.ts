// app/api/automation/credits/route.ts
// GET: fetch AI credit balance for auto-comments
// Returns the same credits as the rest of the app (user_credits table)

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureUserCredits } from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const snapshot = await ensureUserCredits(session.user.id);

    return NextResponse.json({
      ok: true,
      balance: {
        credits_total: snapshot.monthly_remaining + snapshot.bonus_remaining,
        credits_used: snapshot.monthly_credits_used + snapshot.bonus_credits_used,
        credits_remaining: snapshot.total_remaining,
      },
    });
  } catch (err) {
    console.error("GET /api/automation/credits error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
