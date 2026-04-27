// app/api/quiz/route.ts
// CRUD for quizzes (authenticated). GET list, POST create.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const dynamic = "force-dynamic";

// GET — list user's quizzes
export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, user.id);

    let query = supabase
      .from("quizzes")
      .select("*")
      .eq("user_id", user.id);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query.order("created_at", { ascending: false });

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

// POST — create a quiz with questions and results
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, user.id);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const title = String(body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
    }

    // Fetch profile for privacy_url and address_form
    let bpQuery = supabase
      .from("business_profiles")
      .select("privacy_url, address_form")
      .eq("user_id", user.id);
    if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
    const { data: bpProfile } = await bpQuery.maybeSingle();

    let privacyUrl = String(body.privacy_url ?? "").trim();
    if (!privacyUrl) {
      privacyUrl = (bpProfile as any)?.privacy_url ?? "";
    }

    const addressForm = ((bpProfile as any)?.address_form ?? "tu") === "vous" ? "vous" : "tu";
    const defaultConsent = addressForm === "vous"
      ? "En renseignant votre email, vous acceptez notre politique de confidentialité."
      : "En renseignant ton email, tu acceptes notre politique de confidentialité.";

    // Surveys reuse the quizzes table (mode='survey') so the existing
    // creation API + permission cascade keep working unchanged. Surveys
    // force virality_enabled = false because the public renderer doesn't
    // gate sharing behind a bonus for them ("no viral but share at end").
    const mode = body.mode === "survey" ? "survey" : "quiz";
    const isSurvey = mode === "survey";

    // Insert quiz
    const { data: quiz, error: quizError } = await supabase
      .from("quizzes")
      .insert({
        user_id: user.id,
        ...(projectId ? { project_id: projectId } : {}),
        mode,
        title,
        introduction: body.introduction ?? null,
        cta_text: body.cta_text ?? null,
        cta_url: body.cta_url ?? null,
        privacy_url: privacyUrl || null,
        consent_text: body.consent_text ?? defaultConsent,
        virality_enabled: isSurvey ? false : Boolean(body.virality_enabled),
        bonus_description: isSurvey ? null : (body.bonus_description ?? null),
        share_message: body.share_message ?? null,
        locale: body.locale ?? "fr",
        sio_share_tag_name: body.sio_share_tag_name ?? null,
        capture_heading: body.capture_heading ?? null,
        capture_subtitle: body.capture_subtitle ?? null,
        // Lead-capture field toggles (email is always captured)
        capture_first_name: body.capture_first_name === true ? true : false,
        capture_last_name: body.capture_last_name === true ? true : false,
        capture_phone: body.capture_phone === true ? true : false,
        capture_country: body.capture_country === true ? true : false,
        // Personalization flags (show the "Personalize" screen before Q1)
        ask_first_name: body.ask_first_name === true ? true : false,
        ask_gender: body.ask_gender === true ? true : false,
        // Formality (tu / vous) — falls back to profile default when null
        address_form: body.address_form === "tu" || body.address_form === "vous" ? body.address_form : null,
        status: body.status === "active" ? "active" : "draft",
        config_objective: body.config_objective ?? null,
        config_target: body.config_target ?? null,
        config_tone: body.config_tone ?? null,
        config_cta: body.config_cta ?? null,
        config_bonus: body.config_bonus ?? null,
      })
      .select("id")
      .single();

    if (quizError || !quiz) {
      return NextResponse.json(
        { ok: false, error: quizError?.message ?? "Failed to create quiz" },
        { status: 400 },
      );
    }

    // Insert questions. question_type + config let surveys carry their
    // shape (rating / star / free_text / image / yes_no / multiple_choice).
    // Quiz inserts that omit those fields fall through to the column
    // defaults, so legacy callers still work.
    const ALLOWED_TYPES = new Set([
      "multiple_choice",
      "rating_scale",
      "star_rating",
      "free_text",
      "image_choice",
      "yes_no",
    ]);
    const questions = Array.isArray(body.questions) ? body.questions : [];
    if (questions.length > 0) {
      const { error: qErr } = await supabase.from("quiz_questions").insert(
        questions.map((q: any, i: number) => {
          const rawType = typeof q.question_type === "string" ? q.question_type : "multiple_choice";
          const question_type = ALLOWED_TYPES.has(rawType) ? rawType : "multiple_choice";
          return {
            quiz_id: quiz.id,
            question_text: String(q.question_text ?? ""),
            options: Array.isArray(q.options) ? q.options : [],
            sort_order: i,
            question_type,
            config: q.config && typeof q.config === "object" && !Array.isArray(q.config) ? q.config : {},
          };
        }),
      );
      if (qErr) console.error("[POST /api/quiz] Questions insert error:", qErr.message);
    }

    // Insert results — surveys never have result profiles, so we skip the
    // entire block when mode='survey'. The renderer handles a survey row
    // with zero quiz_results without ever trying to compute one.
    const results = !isSurvey && Array.isArray(body.results) ? body.results : [];
    if (results.length > 0) {
      const { error: rErr } = await supabase.from("quiz_results").insert(
        results.map((r: any, i: number) => ({
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
      if (rErr) console.error("[POST /api/quiz] Results insert error:", rErr.message);
    }

    return NextResponse.json({ ok: true, quizId: quiz.id });
  } catch (e) {
    console.error("[POST /api/quiz] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
