// app/api/quiz/generate/route.ts
// AI-powered quiz generation using Claude (Anthropic).
// Returns SSE stream with heartbeats to prevent proxy timeouts.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { buildQuizGenerationPrompt } from "@/lib/prompts/quiz/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

function getClaudeApiKey(): string {
  return (
    process.env.ANTHROPIC_API_KEY?.trim() || ""
  );
}

function getClaudeModel(): string {
  return (
    process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514"
  );
}

export async function POST(req: NextRequest) {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Clé API Claude manquante côté serveur." },
      { status: 500 },
    );
  }

  let system: string;
  let userPrompt: string;

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

    const objective = String(body.objective ?? "").trim();
    const target = String(body.target ?? "").trim();
    if (!objective || !target) {
      return NextResponse.json(
        { ok: false, error: "objective and target are required" },
        { status: 400 },
      );
    }

    const prompts = buildQuizGenerationPrompt({
      objective,
      target,
      tone: String(body.tone ?? "inspirant"),
      cta: String(body.cta ?? ""),
      bonus: String(body.bonus ?? ""),
      questionCount: Math.min(10, Math.max(3, Number(body.questionCount) || 7)),
      resultCount: Math.min(5, Math.max(2, Number(body.resultCount) || 3)),
      locale: String(body.locale ?? "fr"),
      addressForm: body.addressForm === "vous" ? "vous" : "tu",
    });
    system = prompts.system;
    userPrompt = prompts.user;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }

  // SSE stream with heartbeats
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendSSE(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      const heartbeat = setInterval(() => {
        try { sendSSE("heartbeat", { status: "generating" }); } catch { /* stream closed */ }
      }, 5000);

      try {
        sendSSE("progress", { step: "Génération du quiz en cours..." });

        const timeoutMs = 180_000;
        const abortController = new AbortController();
        const timer = setTimeout(() => abortController.abort(), timeoutMs);

        let res: Response;
        try {
          res = await fetch(CLAUDE_API_URL, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            signal: abortController.signal,
            body: JSON.stringify({
              model: getClaudeModel(),
              max_tokens: 8000,
              temperature: 0.7,
              system,
              messages: [{ role: "user", content: userPrompt }],
            }),
          });
        } catch (fetchErr) {
          const name = String((fetchErr as Error)?.name ?? "");
          if (name === "AbortError") {
            sendSSE("error", { ok: false, error: `Timeout Claude API après ${timeoutMs / 1000}s` });
            return;
          }
          throw fetchErr;
        } finally {
          clearTimeout(timer);
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.error("[quiz/generate] Claude API error:", res.status, errText.slice(0, 300));
          sendSSE("error", { ok: false, error: `Erreur Claude API (${res.status}). Réessaie.` });
          return;
        }

        const json = await res.json() as Record<string, unknown>;
        const parts = Array.isArray(json?.content) ? json.content : [];
        const raw = (parts as Record<string, unknown>[])
          .map((p) => (p?.type === "text" ? String(p?.text ?? "") : ""))
          .filter(Boolean)
          .join("")
          .trim();

        if (json?.stop_reason === "max_tokens") {
          sendSSE("error", { ok: false, error: "La génération a été tronquée. Essaie avec moins de questions." });
          return;
        }

        // Robust JSON extraction
        let quiz: unknown;
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
          sendSSE("error", { ok: false, error: "L'IA a retourné un JSON invalide. Réessaie." });
          return;
        }

        sendSSE("result", { ok: true, quiz });
      } catch (e) {
        console.error("[quiz/generate] SSE stream error:", e);
        sendSSE("error", { ok: false, error: e instanceof Error ? e.message : "Unknown error" });
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
