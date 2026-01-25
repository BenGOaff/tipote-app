// app/api/credits/balance/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureUserCredits } from "@/lib/credits";

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const snapshot = await ensureUserCredits(session.user.id);

    // ✅ Compat UI (AiCreditsPanel) + compat backend (ancien shape "credits")
    const totalPurchased =
      Number(snapshot.monthly_credits_total || 0) + Number(snapshot.bonus_credits_total || 0);
    const totalConsumed =
      Number(snapshot.monthly_credits_used || 0) + Number(snapshot.bonus_credits_used || 0);

    return NextResponse.json(
      {
        ok: true,
        // Nouveau shape attendu par l'UI Settings/AiCreditsPanel
        balance: {
          total_remaining: Number(snapshot.total_remaining || 0),
          total_purchased: totalPurchased,
          total_consumed: totalConsumed,
        },
        // Ancien shape conservé pour éviter toute régression ailleurs
        credits: snapshot,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("GET /api/credits/balance error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
