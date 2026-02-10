// app/api/quiz/[quizId]/public/route.ts
// Public endpoints for quiz visitors (no auth required).
// GET: fetch active quiz data
// POST: submit lead (email capture)
// PATCH: mark share

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ quizId: string }> };

// GET — public quiz data (only active quizzes)
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const admin = supabaseAdmin;

    const [quizRes, questionsRes, resultsRes] = await Promise.all([
      admin.from("quizzes").select("id,title,introduction,cta_text,cta_url,privacy_url,consent_text,virality_enabled,bonus_description,share_message,views_count").eq("id", quizId).eq("status", "active").maybeSingle(),
      admin.from("quiz_questions").select("id,question_text,options,sort_order").eq("quiz_id", quizId).order("sort_order"),
      admin.from("quiz_results").select("id,title,description,insight,projection,cta_text,sort_order").eq("quiz_id", quizId).order("sort_order"),
    ]);

    if (!quizRes.data) {
      return NextResponse.json({ ok: false, error: "Quiz not found or inactive" }, { status: 404 });
    }

    // Increment view count (non-blocking)
    admin.from("quizzes").update({ views_count: (quizRes.data.views_count ?? 0) + 1 }).eq("id", quizId).then(() => {});

    return NextResponse.json({
      ok: true,
      quiz: quizRes.data,
      questions: (questionsRes.data ?? []).map((q: any) => ({
        ...q,
        options: q.options as { text: string; result_index: number }[],
      })),
      results: resultsRes.data ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// POST — submit lead (email capture after quiz completion)
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const admin = supabaseAdmin;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Valid email required" }, { status: 400 });
    }

    // Verify quiz is active
    const { data: quiz } = await admin
      .from("quizzes")
      .select("id, user_id")
      .eq("id", quizId)
      .eq("status", "active")
      .maybeSingle();

    if (!quiz) {
      return NextResponse.json({ ok: false, error: "Quiz not found or inactive" }, { status: 404 });
    }

    const resultId = body.result_id ?? null;

    // Upsert lead (unique on quiz_id + email)
    const { data: lead, error } = await admin
      .from("quiz_leads")
      .upsert(
        {
          quiz_id: quizId,
          email,
          result_id: resultId,
          consent_given: Boolean(body.consent_given),
        },
        { onConflict: "quiz_id,email" },
      )
      .select("id")
      .single();

    if (error) {
      console.error("[POST /api/quiz/[quizId]/public] Lead insert error:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, leadId: lead?.id });
  } catch (e) {
    console.error("[POST /api/quiz/[quizId]/public] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// PATCH — mark lead as shared (bonus unlocked)
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const admin = supabaseAdmin;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ ok: false, error: "Email required" }, { status: 400 });
    }

    const { error } = await admin
      .from("quiz_leads")
      .update({ has_shared: true, bonus_unlocked: true })
      .eq("quiz_id", quizId)
      .eq("email", email);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // Increment share count on quiz
    const { data: quiz } = await admin
      .from("quizzes")
      .select("shares_count")
      .eq("id", quizId)
      .maybeSingle();

    if (quiz) {
      await admin
        .from("quizzes")
        .update({ shares_count: (quiz.shares_count ?? 0) + 1 })
        .eq("id", quizId);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
