// app/api/quiz/[quizId]/route.ts
// Single quiz operations: GET detail, PATCH update, DELETE

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ quizId: string }> };

// GET — quiz with questions, results, and leads count
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const [quizRes, questionsRes, resultsRes, leadsRes] = await Promise.all([
      supabase.from("quizzes").select("*").eq("id", quizId).eq("user_id", user.id).maybeSingle(),
      supabase.from("quiz_questions").select("*").eq("quiz_id", quizId).order("sort_order"),
      supabase.from("quiz_results").select("*").eq("quiz_id", quizId).order("sort_order"),
      supabase.from("quiz_leads").select("*, quiz_results(title)").eq("quiz_id", quizId).order("created_at", { ascending: false }),
    ]);

    if (!quizRes.data) {
      return NextResponse.json({ ok: false, error: "Quiz not found" }, { status: 404 });
    }

    const leads = (leadsRes.data ?? []).map((l: any) => ({
      ...l,
      result_title: l.quiz_results?.title ?? null,
      quiz_results: undefined,
    }));

    return NextResponse.json({
      ok: true,
      quiz: {
        ...quizRes.data,
        questions: (questionsRes.data ?? []).map((q: any) => ({
          ...q,
          options: q.options as { text: string; result_index: number }[],
        })),
        results: resultsRes.data ?? [],
      },
      leads,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// PATCH — update quiz fields and/or status
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from("quizzes")
      .select("id")
      .eq("id", quizId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Quiz not found" }, { status: 404 });
    }

    // Build patch
    const allowedFields = [
      "title", "introduction", "cta_text", "cta_url", "privacy_url",
      "consent_text", "virality_enabled", "bonus_description",
      "share_message", "status", "sio_share_tag_name",
    ];

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowedFields) {
      if (key in body) patch[key] = body[key];
    }

    const { error } = await supabase.from("quizzes").update(patch).eq("id", quizId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // Update questions if provided
    if (Array.isArray(body.questions)) {
      // Delete old questions and re-insert
      await supabase.from("quiz_questions").delete().eq("quiz_id", quizId);
      if (body.questions.length > 0) {
        await supabase.from("quiz_questions").insert(
          body.questions.map((q: any, i: number) => ({
            quiz_id: quizId,
            question_text: String(q.question_text ?? ""),
            options: Array.isArray(q.options) ? q.options : [],
            sort_order: i,
          })),
        );
      }
    }

    // Update results if provided
    if (Array.isArray(body.results)) {
      await supabase.from("quiz_results").delete().eq("quiz_id", quizId);
      if (body.results.length > 0) {
        await supabase.from("quiz_results").insert(
          body.results.map((r: any, i: number) => ({
            quiz_id: quizId,
            title: String(r.title ?? ""),
            description: r.description ?? null,
            insight: r.insight ?? null,
            projection: r.projection ?? null,
            cta_text: r.cta_text ?? null,
            sio_tag_name: r.sio_tag_name ?? null,
            sort_order: i,
          })),
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /api/quiz/[quizId]] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// DELETE — delete quiz (cascades to questions, results, leads)
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("quizzes")
      .delete()
      .eq("id", quizId)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
