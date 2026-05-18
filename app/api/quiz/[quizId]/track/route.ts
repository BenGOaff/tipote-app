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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Adeline (18 mai 2026) : sur testetstes (slug, pas UUID) le tracker
// renvoyait 404 systématiquement. Les autres routes publiques résolvent
// déjà slug→id (public/route.ts:resolveQuizId), on duplique la logique
// minimale ici plutôt que d'extraire un helper (le tracker ne fait
// qu'un seul appel, et il doit rester *léger* — best-effort).
async function resolveQuizIdFromSlugOrId(slugOrId: string): Promise<string | null> {
  const needle = slugOrId.trim();
  if (!needle) return null;
  if (UUID_RE.test(needle)) {
    const { data } = await supabaseAdmin
      .from("quizzes")
      .select("id")
      .eq("id", needle)
      .eq("status", "active")
      .maybeSingle();
    return data?.id ?? null;
  }
  const { data } = await supabaseAdmin
    .from("quizzes")
    .select("id")
    .ilike("slug", needle)
    .eq("status", "active")
    .maybeSingle();
  return data?.id ?? null;
}

// Adeline (18 mai 2026) : un tracker d'analytics ne doit JAMAIS
// remonter de 4xx dans la console du visiteur — ça pollue le devtools
// du créateur quand il preview son quiz et donne l'impression que
// quelque chose est cassé alors que l'event a juste été ignoré (slug
// inconnu, body mal formé, sessionId périmé, etc.). On répond donc
// systématiquement en 200 avec `ok:false` + une raison dans le body
// pour le debug serveur. Le client ne lit pas le body (fire & forget),
// donc le comportement applicatif est identique.
function ok() { return NextResponse.json({ ok: true }); }
function silent(reason: string) { return NextResponse.json({ ok: false, reason }); }

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { quizId: slugOrId } = await context.params;
    const quizId = await resolveQuizIdFromSlugOrId(slugOrId);
    if (!quizId) return silent("quiz_not_found");

    let body: any;
    try {
      body = await req.json();
    } catch {
      return silent("bad_json");
    }

    const event = String(body.event ?? "").trim();

    if ((QUESTION_EVENTS as readonly string[]).includes(event)) {
      const qIdx = Number(body.questionIndex);
      const sessionId = String(body.sessionId ?? "").trim();
      if (!Number.isInteger(qIdx) || qIdx < 0 || qIdx >= 200) return silent("bad_question_index");
      if (!SESSION_ID_RE.test(sessionId)) return silent("bad_session_id");
      await supabaseAdmin.from("quiz_question_events").insert({
        quiz_id: quizId,
        question_index: qIdx,
        session_id: sessionId,
        event: QUESTION_EVENT_DB[event as QuestionEvent],
      });
      return ok();
    }

    if ((COUNTER_EVENTS as readonly string[]).includes(event)) {
      const column = COLUMN_MAP[event as CounterEvent];
      const { data: quiz } = await supabaseAdmin
        .from("quizzes")
        .select(`id, ${column}`)
        .eq("id", quizId)
        .maybeSingle();
      if (!quiz) return silent("quiz_lookup_failed");
      await supabaseAdmin
        .from("quizzes")
        .update({ [column]: ((quiz as any)[column] ?? 0) + 1 })
        .eq("id", quizId);
      return ok();
    }

    return silent("unknown_event");
  } catch {
    // Best-effort analytics — never fail the visitor experience
    return ok();
  }
}
