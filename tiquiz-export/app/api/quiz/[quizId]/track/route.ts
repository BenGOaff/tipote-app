// app/api/quiz/[quizId]/track/route.ts
// Lightweight funnel event tracking (no auth)
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ quizId: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const { event } = await req.json();

    if (event === "start") {
      await supabaseAdmin.rpc("increment_quiz_counter", { quiz_id_input: quizId, counter_name: "starts_count" });
    } else if (event === "complete") {
      await supabaseAdmin.rpc("increment_quiz_counter", { quiz_id_input: quizId, counter_name: "completions_count" });
    }

    return NextResponse.json({ ok: true });
  } catch {
    // Never fail user experience
    return NextResponse.json({ ok: true });
  }
}
