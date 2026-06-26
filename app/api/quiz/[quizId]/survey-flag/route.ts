// app/api/quiz/[quizId]/survey-flag/route.ts (Tipote)
//
// POST { leadId, flagged } — marque/démarque un répondant de sondage.
// Owner-scoped : le quiz doit appartenir au user, et le lead doit
// appartenir au quiz. Retourne { ok, flagged }.

import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ quizId: string }> },
) {
  const { quizId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { leadId?: string; flagged?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const leadId = typeof body.leadId === "string" ? body.leadId : "";
  const flagged = Boolean(body.flagged);
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  // Ownership : on vérifie que le quiz appartient au user.
  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("id, user_id")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz || quiz.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("quiz_leads")
    .update({ flagged })
    .eq("id", leadId)
    .eq("quiz_id", quizId);
  if (error) {
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, flagged });
}
