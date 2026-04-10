// app/api/quiz/[quizId]/route.ts
// Single quiz operations: GET detail, PATCH update, DELETE
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ quizId: string }> };

// GET — quiz with questions, results, and leads
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const [quizRes, questionsRes, resultsRes, leadsRes] = await Promise.all([
      supabase.from("quizzes").select("*").eq("id", quizId).eq("user_id", user.id).maybeSingle(),
      supabase.from("quiz_questions").select("*").eq("quiz_id", quizId).order("sort_order"),
      supabase.from("quiz_results").select("*").eq("quiz_id", quizId).order("sort_order"),
      supabase.from("quiz_leads").select("*").eq("quiz_id", quizId).order("created_at", { ascending: false }),
    ]);

    if (!quizRes.data) {
      return NextResponse.json({ ok: false, error: "Quiz not found" }, { status: 404 });
    }

    // Build result title lookup
    const resultTitleMap = new Map<string, string>();
    for (const r of resultsRes.data ?? []) {
      resultTitleMap.set(r.id, r.title);
    }

    const leads = (leadsRes.data ?? []).map((l: Record<string, unknown>) => ({
      ...l,
      result_title: resultTitleMap.get(l.result_id as string) ?? null,
    }));

    return NextResponse.json({
      ok: true,
      quiz: {
        ...quizRes.data,
        questions: (questionsRes.data ?? []).map((q: Record<string, unknown>) => ({
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

// PATCH — update quiz fields, questions, results
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: Record<string, unknown>;
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
      "share_message", "status", "sio_share_tag_name", "locale",
      "og_image_url", "capture_heading", "capture_subtitle", "capture_first_name",
      "capture_last_name", "capture_phone", "capture_country",
    ];

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowedFields) {
      if (key in body) patch[key] = body[key];
    }

    const { error } = await supabase.from("quizzes").update(patch).eq("id", quizId);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // Update questions if provided
    if (Array.isArray(body.questions)) {
      await supabase.from("quiz_questions").delete().eq("quiz_id", quizId);
      if ((body.questions as unknown[]).length > 0) {
        await supabase.from("quiz_questions").insert(
          (body.questions as Record<string, unknown>[]).map((q, i) => ({
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
      if ((body.results as unknown[]).length > 0) {
        await supabase.from("quiz_results").insert(
          (body.results as Record<string, unknown>[]).map((r, i) => ({
            quiz_id: quizId,
            title: String(r.title ?? ""),
            description: r.description ?? null,
            insight: r.insight ?? null,
            projection: r.projection ?? null,
            cta_text: r.cta_text ?? null,
            cta_url: r.cta_url ?? null,
            sio_tag_name: r.sio_tag_name ?? null,
            sio_course_id: r.sio_course_id ?? null,
            sio_community_id: r.sio_community_id ?? null,
            sort_order: i,
          })),
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
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
    const { data: { user }, error: userError } = await supabase.auth.getUser();
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
