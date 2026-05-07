// app/api/quiz/[quizId]/track/route.ts
// Lightweight public endpoint to track quiz funnel events (no auth required).
//
// Aggregate counters (views_count / starts_count / completions_count)
// stay on the quizzes table for the headline KPIs. Per-question
// events go into quiz_question_events for drop-off analysis.
//
// Events:
//   - "start"          → user clicked Start, increments starts_count
//   - "complete"       → user reached email step, increments completions_count
//   - "question_view"  → user just landed on question N (one row in events)
//   - "question_answer"→ user answered question N (one row in events)
//
// All writes are best-effort: a failed analytics call must never
// break the visitor's path through the quiz.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ quizId: string }> };

const COUNTER_EVENTS = ["start", "complete"] as const;
const QUESTION_EVENTS = ["question_view", "question_answer"] as const;
type CounterEvent = (typeof COUNTER_EVENTS)[number];
type QuestionEvent = (typeof QUESTION_EVENTS)[number];

const COLUMN_MAP: Record<CounterEvent, string> = {
  start: "starts_count",
  complete: "completions_count",
};

const QUESTION_EVENT_DB: Record<QuestionEvent, "view" | "answer"> = {
  question_view: "view",
  question_answer: "answer",
};

const SESSION_ID_RE = /^[a-z0-9-]{8,64}$/i;

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const event = String(body.event ?? "").trim();

    if ((QUESTION_EVENTS as readonly string[]).includes(event)) {
      const qIdx = Number(body.questionIndex);
      const sessionId = String(body.sessionId ?? "").trim();
      if (!Number.isInteger(qIdx) || qIdx < 0 || qIdx >= 200) {
        return NextResponse.json({ ok: false }, { status: 400 });
      }
      if (!SESSION_ID_RE.test(sessionId)) {
        return NextResponse.json({ ok: false }, { status: 400 });
      }
      // Ownership check is implicit: a visitor can only have a
      // session_id we don't validate. But quiz_id must exist and be
      // active to accept events at all (avoid spam on deleted quizzes).
      const { data: quiz } = await supabaseAdmin
        .from("quizzes")
        .select("id")
        .eq("id", quizId)
        .eq("status", "active")
        .maybeSingle();
      if (!quiz) {
        return NextResponse.json({ ok: false }, { status: 404 });
      }
      await supabaseAdmin.from("quiz_question_events").insert({
        quiz_id: quizId,
        question_index: qIdx,
        session_id: sessionId,
        event: QUESTION_EVENT_DB[event as QuestionEvent],
      });
      return NextResponse.json({ ok: true });
    }

    if ((COUNTER_EVENTS as readonly string[]).includes(event)) {
      const column = COLUMN_MAP[event as CounterEvent];
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
    }

    return NextResponse.json(
      { ok: false, error: "Invalid event" },
      { status: 400 },
    );
  } catch {
    // Non-blocking analytics — never fail the visitor experience
    return NextResponse.json({ ok: true });
  }
}
