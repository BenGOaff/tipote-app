// app/api/popquiz/[popquizId]/autosave/route.ts
//
// Draft autosave for the popquiz editor — mirror of
// app/api/quiz/[quizId]/autosave/route.ts.
//
// PUT  : upsert draft (body: { state: any })
// DELETE: clear draft

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DRAFT_BYTES = 256 * 1024;

type RouteContext = { params: Promise<{ popquizId: string }> };

async function resolvePopquizAndOwner(popquizId: string, userId: string) {
  const { data: row, error } = await supabaseAdmin
    .from("popquizzes")
    .select("id, user_id")
    .eq("id", popquizId)
    .maybeSingle();
  if (error || !row) return { error: "NOT_FOUND", status: 404 as const };
  if (row.user_id !== userId) return { error: "FORBIDDEN", status: 403 as const };
  return { ok: true as const };
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const { popquizId } = await context.params;
    if (!UUID_RE.test(popquizId)) {
      return NextResponse.json({ ok: false, error: "INVALID_ID" }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const gate = await resolvePopquizAndOwner(popquizId, user.id);
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
      .from("popquizzes")
      .update({ draft_state: state, draft_updated_at: now })
      .eq("id", popquizId);
    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, draft_updated_at: now });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const { popquizId } = await context.params;
    if (!UUID_RE.test(popquizId)) {
      return NextResponse.json({ ok: false, error: "INVALID_ID" }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const gate = await resolvePopquizAndOwner(popquizId, user.id);
    if (!gate.ok) {
      return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
    }

    const { error: updErr } = await supabaseAdmin
      .from("popquizzes")
      .update({ draft_state: null, draft_updated_at: null })
      .eq("id", popquizId);
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
