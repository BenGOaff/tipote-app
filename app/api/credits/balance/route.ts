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

    return NextResponse.json(
      {
        ok: true,
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
