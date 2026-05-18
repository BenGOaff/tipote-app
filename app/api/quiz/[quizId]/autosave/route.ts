// app/api/quiz/[quizId]/autosave/route.ts
//
// Draft autosave endpoint for the quiz / survey editor. Keeps the
// canonical quiz columns untouched — we only stamp `draft_state` +
// `draft_updated_at`, which the editor reads on next open to offer a
// restore. The visitor-facing /public route never reads draft_state,
// so a pending autosave can NEVER leak to respondents.
//
// PUT  : upsert draft (body: { state: any })
// DELETE: clear draft (after a successful explicit save, or after the
//         user dismisses the restore offer)

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cap the snapshot size to avoid pathological clients filling the DB
// with megabytes of JSON. 256 KB is generous (typical quiz state is
// ~10 KB) but keeps the row size bounded.
const MAX_DRAFT_BYTES = 256 * 1024;

type RouteContext = { params: Promise<{ quizId: string }> };

async function resolveQuizAndOwner(quizId: string, userId: string) {
  const { data: quiz, error } = await supabaseAdmin
    .from("quizzes")
    .select("id, user_id")
    .eq("id", quizId)
    .maybeSingle();
  if (error || !quiz) return { error: "NOT_FOUND", status: 404 as const };
  if (quiz.user_id !== userId) return { error: "FORBIDDEN", status: 403 as const };
  return { ok: true as const };
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    if (!UUID_RE.test(quizId)) {
      return NextResponse.json({ ok: false, error: "INVALID_ID" }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const gate = await resolveQuizAndOwner(quizId, user.id);
    if (!gate.ok) {
      return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
    }

    let body: { state?: unknown } = {};
    try { body = await req.json(); } catch { /* keep empty */ }
    const state = body?.state;
    if (state === undefined) {
      return NextResponse.json({ ok: false, error: "MISSING_STATE" }, { status: 400 });
    }

    let serialized: string;
    try {
      serialized = JSON.stringify(state);
    } catch {
      return NextResponse.json({ ok: false, error: "INVALID_STATE" }, { status: 400 });
    }
    if (serialized.length > MAX_DRAFT_BYTES) {
      return NextResponse.json(
        { ok: false, error: "DRAFT_TOO_LARGE", limit: MAX_DRAFT_BYTES, size: serialized.length },
        { status: 413 },
      );
    }

    const now = new Date().toISOString();
    const { error: updErr } = await supabaseAdmin
      .from("quizzes")
      .update({ draft_state: state, draft_updated_at: now })
      .eq("id", quizId);
    if (updErr) {
      // Log server-side pour qu'on puisse diagnostiquer les 500
      // qu'Adeline a remontés (18 mai 2026) — sinon on a juste
      // `Failed to load resource: 500` côté client sans détail.
      console.error(
        "[autosave PUT] supabase update failed",
        { quizId, code: updErr.code, message: updErr.message, details: updErr.details },
      );
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, draft_updated_at: now });
  } catch (e) {
    console.error("[autosave PUT] unhandled exception", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    if (!UUID_RE.test(quizId)) {
      return NextResponse.json({ ok: false, error: "INVALID_ID" }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const gate = await resolveQuizAndOwner(quizId, user.id);
    if (!gate.ok) {
      return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
    }

    const { error: updErr } = await supabaseAdmin
      .from("quizzes")
      .update({ draft_state: null, draft_updated_at: null })
      .eq("id", quizId);
    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
