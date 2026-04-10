// app/api/quiz/route.ts
// CRUD for quizzes (authenticated). GET list, POST create.
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

// GET — list user's quizzes
export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("quizzes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, quizzes: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// POST — create quiz with questions and results
export async function POST(req: NextRequest) {
  try {
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

    const title = String(body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
    }

    // Check quiz limit for free plan (1 quiz max)
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile || (profile as Record<string, unknown>).plan === "free") {
      const { count } = await supabase
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      if ((count ?? 0) >= 1) {
        return NextResponse.json(
          { ok: false, error: "FREE_PLAN_QUIZ_LIMIT", message: "Le plan gratuit est limité à 1 quiz. Passe à un plan payant pour créer plus de quiz." },
          { status: 403 },
        );
      }
    }

    // Insert quiz
    const { data: quiz, error: quizError } = await supabase
      .from("quizzes")
      .insert({
        user_id: user.id,
        title,
        introduction: body.introduction ?? null,
        cta_text: body.cta_text ?? null,
        cta_url: body.cta_url ?? null,
        privacy_url: body.privacy_url ?? null,
        consent_text: body.consent_text ?? null,
        virality_enabled: Boolean(body.virality_enabled),
        bonus_description: body.bonus_description ?? null,
        share_message: body.share_message ?? null,
        locale: body.locale ?? "fr",
        sio_share_tag_name: body.sio_share_tag_name ?? null,
        capture_heading: body.capture_heading ?? null,
        capture_subtitle: body.capture_subtitle ?? null,
        capture_first_name: Boolean(body.capture_first_name),
        capture_last_name: Boolean(body.capture_last_name),
        capture_phone: Boolean(body.capture_phone),
        capture_country: Boolean(body.capture_country),
        status: body.status === "active" ? "active" : "draft",
      })
      .select("id")
      .single();

    if (quizError || !quiz) {
      return NextResponse.json(
        { ok: false, error: quizError?.message ?? "Failed to create quiz" },
        { status: 400 },
      );
    }

    // Insert questions
    const questions = Array.isArray(body.questions) ? body.questions : [];
    if (questions.length > 0) {
      await supabase.from("quiz_questions").insert(
        questions.map((q: Record<string, unknown>, i: number) => ({
          quiz_id: quiz.id,
          question_text: String(q.question_text ?? ""),
          options: Array.isArray(q.options) ? q.options : [],
          sort_order: i,
        })),
      );
    }

    // Insert results
    const results = Array.isArray(body.results) ? body.results : [];
    if (results.length > 0) {
      await supabase.from("quiz_results").insert(
        results.map((r: Record<string, unknown>, i: number) => ({
          quiz_id: quiz.id,
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

    return NextResponse.json({ ok: true, quizId: quiz.id });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
