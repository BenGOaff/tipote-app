// app/api/quiz/generate/route.ts
// AI-powered quiz generation. Costs 4 credits.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai } from "@/lib/openaiClient";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { buildQuizGenerationPrompt } from "@/lib/prompts/quiz/system";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

    const ai = openai;
    if (!ai) {
      return NextResponse.json({ ok: false, error: "AI client not configured" }, { status: 500 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const objective = String(body.objective ?? "").trim();
    const target = String(body.target ?? "").trim();

    if (!objective || !target) {
      return NextResponse.json(
        { ok: false, error: "objective and target are required" },
        { status: 400 },
      );
    }

    // Check credits
    await ensureUserCredits(user.id);
    const creditsResult = await consumeCredits(user.id, 4, { feature: "quiz_generate" });
    if (creditsResult && typeof creditsResult === "object") {
      const ok = (creditsResult as any).success;
      const err = String((creditsResult as any).error ?? "").toUpperCase();
      if (ok === false && err.includes("NO_CREDITS")) {
        return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
      }
    }

    // Get user context for better generation
    let bpQuery = supabase
      .from("business_profiles")
      .select("niche, mission")
      .eq("user_id", user.id);
    if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
    const { data: profile } = await bpQuery.maybeSingle();

    const { system, user: userPrompt } = buildQuizGenerationPrompt({
      objective,
      target,
      tone: String(body.tone ?? "inspirant"),
      cta: String(body.cta ?? ""),
      bonus: String(body.bonus ?? ""),
      questionCount: Math.min(10, Math.max(3, Number(body.questionCount) || 7)),
      resultCount: Math.min(5, Math.max(2, Number(body.resultCount) || 3)),
      niche: profile?.niche ?? "",
      mission: profile?.mission ?? "",
      locale: String(body.locale ?? "fr"),
    });

    const resp = await ai.chat.completions.create({
      model: "gpt-5.1",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const raw = resp.choices?.[0]?.message?.content ?? "{}";
    let quiz: any;
    try {
      quiz = JSON.parse(raw);
    } catch {
      return NextResponse.json({ ok: false, error: "AI returned invalid JSON" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, quiz });
  } catch (e: any) {
    const msg = String(e?.message ?? "").toUpperCase();
    if (msg.includes("NO_CREDITS")) {
      return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
    }
    console.error("[POST /api/quiz/generate] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
