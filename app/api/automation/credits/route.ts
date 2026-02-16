// app/api/automation/credits/route.ts
// GET: fetch automation credit balance
// Used by the UI to display automation credits separately from AI credits

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureAutomationCredits } from "@/lib/automationCredits";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const snapshot = await ensureAutomationCredits(session.user.id);

    return NextResponse.json({
      ok: true,
      balance: {
        credits_total: snapshot.credits_total,
        credits_used: snapshot.credits_used,
        credits_remaining: snapshot.credits_remaining,
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
