// app/api/quiz/[quizId]/track/route.ts
// Lightweight public endpoint to track quiz funnel events (no auth required).
// Increments atomic counters on the quizzes table.
// Events: "start" (clicked Start button), "complete" (reached email step)

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ quizId: string }> };

const VALID_EVENTS = ["start", "complete"] as const;
type TrackEvent = (typeof VALID_EVENTS)[number];

const COLUMN_MAP: Record<TrackEvent, string> = {
  start: "starts_count",
  complete: "completions_count",
};

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const event = String(body.event ?? "").trim() as TrackEvent;
    if (!VALID_EVENTS.includes(event)) {
      return NextResponse.json({ ok: false, error: "Invalid event" }, { status: 400 });
    }

    const column = COLUMN_MAP[event];

    // Atomic increment via RPC or raw query.
    // Since supabaseAdmin doesn't support .increment() natively,
    // we read-then-write (acceptable for analytics counters).
    const { data: quiz } = await supabaseAdmin
      .from("quizzes")
      .select(`id, ${column}`)
      .eq("id", quizId)
      .eq("status", "active")
      .maybeSingle();

    if (!quiz) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    await supabaseAdmin
      .from("quizzes")
      .update({ [column]: ((quiz as any)[column] ?? 0) + 1 })
      .eq("id", quizId);

    return NextResponse.json({ ok: true });
  } catch {
    // Non-blocking analytics — never fail the visitor experience
    return NextResponse.json({ ok: true });
  }
}
