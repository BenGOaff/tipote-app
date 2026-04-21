// app/api/quiz/idea-chat/route.ts
// Conversational brainstorming for the "Pas d'idée ?" chat.
// Uses Haiku (cheap + fast), guides the user in 4-5 turns, emits a structured
// brief the main generator consumes. Hard-capped at 6 user turns.
// Each message costs 0.5 credits (Tipote credits system).

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { buildQuizChatSystemPrompt } from "@/lib/prompts/quiz/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const MAX_USER_TURNS = 6;
const CHAT_CREDIT_COST = 0.5;

type ChatMessage = { role: "user" | "assistant"; content: string };

function getClaudeApiKey(): string {
  return (
    process.env.CLAUDE_API_KEY_OWNER?.trim() ||
    process.env.ANTHROPIC_API_KEY_OWNER?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim() ||
    ""
  );
}

function getChatModel(): string {
  return (
    process.env.TIPOTE_CHAT_MODEL?.trim() ||
    process.env.ANTHROPIC_CHAT_MODEL?.trim() ||
    "claude-haiku-4-5-20251001"
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
  let messages: ChatMessage[];

  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;
    const projectId = await getActiveProjectId(supabase, userId);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    messages = rawMessages
      .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? "").slice(0, 2000),
      }))
      .filter((m) => m.content.trim().length > 0) as ChatMessage[];

    const userTurnCount = messages.filter((m) => m.role === "user").length;
    if (userTurnCount > MAX_USER_TURNS) {
      return NextResponse.json(
        { ok: false, error: "Trop d'échanges. Relance la discussion ou utilise le formulaire direct." },
        { status: 400 },
      );
    }

    // 0.5 credits per user message (only charge on new user turn).
    if (userTurnCount > 0) {
      await ensureUserCredits(userId);
      const creditsResult = await consumeCredits(userId, CHAT_CREDIT_COST, {
        feature: "quiz_idea_chat",
      });
      if (creditsResult && typeof creditsResult === "object") {
        const ok = (creditsResult as any).success;
        const err = String((creditsResult as any).error ?? "").toUpperCase();
        if (ok === false && err.includes("NO_CREDITS")) {
          return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
        }
      }
    }

    // Pull niche/mission/addressForm from business_profiles for context
    let bpQuery = supabase
      .from("business_profiles")
      .select("niche, mission, address_form")
      .eq("user_id", userId);
    if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
    const { data: profile } = await bpQuery.maybeSingle();

    const addressForm = (profile as any)?.address_form === "vous" ? "vous" : "tu";
    const targetAudience = String((profile as any)?.mission ?? "").trim();
    const locale = String(body.locale ?? "fr");

    system = buildQuizChatSystemPrompt({ locale, addressForm, targetAudience });
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

  // SSE stream of assistant deltas
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendSSE(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const timeoutMs = 45_000;
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
              model: getChatModel(),
              max_tokens: 800,
              temperature: 0.6,
              system,
              messages,
              stream: true,
            }),
          });
        } catch (fetchErr) {
          const name = String((fetchErr as Error)?.name ?? "");
          if (name === "AbortError") {
            sendSSE("error", { ok: false, error: "Timeout Claude API." });
            return;
          }
          throw fetchErr;
        } finally {
          clearTimeout(timer);
        }

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => "");
          console.error("[idea-chat] Claude API error:", res.status, errText.slice(0, 500));
          sendSSE("error", { ok: false, error: `Erreur Claude API (${res.status}).` });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let full = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;

            try {
              const parsed = JSON.parse(payload) as Record<string, unknown>;
              if (parsed.type === "content_block_delta") {
                const delta = parsed.delta as Record<string, unknown> | undefined;
                if (delta?.type === "text_delta") {
                  const text = String(delta.text ?? "");
                  if (text) {
                    full += text;
                    sendSSE("delta", { text });
                  }
                }
              }
            } catch {
              // skip unparseable chunks
            }
          }
        }

        let brief: Record<string, unknown> | null = null;
        const match = full.match(/```json\s*([\s\S]*?)```/);
        if (match) {
          try {
            brief = JSON.parse(match[1].trim()) as Record<string, unknown>;
          } catch {
            // Malformed JSON — ignore, the user will continue chatting
          }
        }

        sendSSE("done", { full, brief });
      } catch (e) {
        console.error("[idea-chat] SSE stream error:", e);
        sendSSE("error", { ok: false, error: e instanceof Error ? e.message : "Unknown error" });
      } finally {
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
