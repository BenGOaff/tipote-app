// app/api/quiz/generate/route.ts
// AI-powered quiz generation. Costs 4 credits.
// Returns SSE stream with heartbeats to prevent proxy/hosting 504 timeouts.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { buildQuizGenerationPrompt } from "@/lib/prompts/quiz/system";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // ── Pre-validate synchronously before starting the stream ──────────
  let supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  let userId: string;
  let projectId: string | null;
  let system: string;
  let userPrompt: string;

  try {
    supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
    projectId = await getActiveProjectId(supabase, userId);

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
    await ensureUserCredits(userId);
    const creditsResult = await consumeCredits(userId, 4, { feature: "quiz_generate" });
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
      .eq("user_id", userId);
    if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
    const { data: profile } = await bpQuery.maybeSingle();

    const prompts = buildQuizGenerationPrompt({
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
    system = prompts.system;
    userPrompt = prompts.user;
  } catch (e: any) {
    const msg = String(e?.message ?? "").toUpperCase();
    if (msg.includes("NO_CREDITS")) {
      return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
    }
    console.error("[POST /api/quiz/generate] Pre-validation error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }

  // ── Start SSE stream — heartbeats keep the connection alive ────────
  const ai = openai!;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendSSE(event: string, data: any) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      // Send heartbeat every 5 seconds to prevent proxy timeout
      const heartbeat = setInterval(() => {
        try {
          sendSSE("heartbeat", { status: "generating" });
        } catch { /* stream closed */ }
      }, 5000);

      try {
        sendSSE("progress", { step: "Génération du quiz en cours..." });

        const resp = await ai.chat.completions.create({
          ...cachingParams("quiz"),
          model: OPENAI_MODEL,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: userPrompt },
          ],
          max_completion_tokens: 8000,
        } as any);

        const choice = resp.choices?.[0];
        const raw = choice?.message?.content ?? "{}";

        // Detect truncated output (model hit token limit before finishing JSON)
        if (choice?.finish_reason === "length") {
          console.error("[quiz/generate] Output truncated (finish_reason=length). Tokens used:",
            resp.usage?.completion_tokens, "/ 8000");
          sendSSE("error", {
            ok: false,
            error: "La génération du quiz a été tronquée (réponse trop longue). Essaie avec moins de questions.",
          });
          return;
        }

        let quiz: any;
        try {
          quiz = JSON.parse(raw);
        } catch {
          console.error("[quiz/generate] JSON parse failed. Raw length:", raw.length,
            "finish_reason:", choice?.finish_reason, "raw preview:", raw.slice(0, 200));
          sendSSE("error", {
            ok: false,
            error: "L'IA a retourné un JSON invalide. Réessaie.",
          });
          return;
        }

        sendSSE("result", { ok: true, quiz });
      } catch (e: any) {
        const msg = String(e?.message ?? "").toUpperCase();
        if (msg.includes("NO_CREDITS")) {
          sendSSE("error", { ok: false, error: "NO_CREDITS" });
        } else {
          console.error("[quiz/generate] SSE stream error:", e);
          sendSSE("error", { ok: false, error: e instanceof Error ? e.message : "Unknown error" });
        }
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Prevent nginx proxy buffering
    },
  });
}
