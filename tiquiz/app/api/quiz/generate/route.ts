// app/api/quiz/generate/route.ts
// AI-powered quiz generation using Claude. Costs 4 credits.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { buildQuizGenerationPrompt } from "@/lib/prompts/quiz/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

function getClaudeApiKey(): string {
  return (
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.CLAUDE_API_KEY?.trim() ||
    ""
  );
}

function getClaudeModel(): string {
  return (
    process.env.TIQUIZ_CLAUDE_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-sonnet-4-5-20250929"
  );
}

export async function POST(req: NextRequest) {
  let supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  let userId: string;
  let system: string;
  let userPrompt: string;

  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Cle API Claude manquante cote serveur." },
      { status: 500 },
    );
  }

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

    // Get user context
    const { data: profile } = await supabase
      .from("profiles")
      .select("niche, mission, address_form")
      .eq("id", userId)
      .maybeSingle();

    const addressForm = ((profile as any)?.address_form ?? "tu") === "vous" ? "vous" as const : "tu" as const;

    const prompts = buildQuizGenerationPrompt({
      objective,
      target,
      tone: String(body.tone ?? "inspirant"),
      cta: String(body.cta ?? ""),
      bonus: String(body.bonus ?? ""),
      questionCount: Math.min(30, Math.max(3, Number(body.questionCount) || 7)),
      resultCount: Math.min(5, Math.max(2, Number(body.resultCount) || 3)),
      niche: (profile as any)?.niche ?? "",
      mission: (profile as any)?.mission ?? "",
      locale: String(body.locale ?? "fr"),
      addressForm,
    });
    system = prompts.system;
    userPrompt = prompts.user;
  } catch (e: any) {
    const msg = String(e?.message ?? "").toUpperCase();
    if (msg.includes("NO_CREDITS")) {
      return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendSSE(event: string, data: any) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      const heartbeat = setInterval(() => {
        try { sendSSE("heartbeat", { status: "generating" }); } catch {}
      }, 5000);

      try {
        sendSSE("progress", { step: "Generation du quiz en cours..." });

        const timeoutMs = 180_000;
        const abortCtrl = new AbortController();
        const timer = setTimeout(() => abortCtrl.abort(), timeoutMs);

        let res: Response;
        try {
          res = await fetch(CLAUDE_API_URL, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            signal: abortCtrl.signal,
            body: JSON.stringify({
              model: getClaudeModel(),
              max_tokens: 8000,
              temperature: 0.7,
              system,
              messages: [{ role: "user", content: userPrompt }],
            }),
          });
        } catch (fetchErr: any) {
          if (String(fetchErr?.name ?? "").includes("Abort")) {
            sendSSE("error", { ok: false, error: `Timeout Claude API apres ${timeoutMs / 1000}s` });
            return;
          }
          throw fetchErr;
        } finally {
          clearTimeout(timer);
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          sendSSE("error", { ok: false, error: `Erreur Claude API (${res.status}).` });
          return;
        }

        const json = (await res.json()) as any;
        const parts = Array.isArray(json?.content) ? json.content : [];
        const raw = parts
          .map((p: any) => (p?.type === "text" ? String(p?.text ?? "") : ""))
          .filter(Boolean)
          .join("")
          .trim();

        if (json?.stop_reason === "max_tokens") {
          sendSSE("error", { ok: false, error: "Reponse tronquee. Essaie avec moins de questions." });
          return;
        }

        let quiz: any;
        try {
          const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (codeBlockMatch) {
            quiz = JSON.parse(codeBlockMatch[1].trim());
          } else {
            const start = raw.indexOf("{");
            const end = raw.lastIndexOf("}");
            if (start !== -1 && end !== -1 && end > start) {
              quiz = JSON.parse(raw.slice(start, end + 1));
            } else {
              quiz = JSON.parse(raw);
            }
          }
        } catch {
          sendSSE("error", { ok: false, error: "L'IA a retourne un JSON invalide. Reessaie." });
          return;
        }

        sendSSE("result", { ok: true, quiz });
      } catch (e: any) {
        const msg = String(e?.message ?? "").toUpperCase();
        if (msg.includes("NO_CREDITS")) {
          sendSSE("error", { ok: false, error: "NO_CREDITS" });
        } else {
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
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
