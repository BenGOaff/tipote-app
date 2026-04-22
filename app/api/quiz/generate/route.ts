// app/api/quiz/generate/route.ts
// AI-powered quiz generation using Claude (Anthropic). Costs 6 credits.
// Supports two modes: "generate" (default, form-driven) and "import" (raw content → structured).
// Returns SSE stream with heartbeats to prevent proxy/hosting 504 timeouts.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { buildQuizGenerationPrompt, buildQuizImportPrompt } from "@/lib/prompts/quiz/system";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

function getClaudeApiKey(): string {
  return (
    process.env.CLAUDE_API_KEY_OWNER?.trim() ||
    process.env.ANTHROPIC_API_KEY_OWNER?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim() ||
    ""
  );
}

function getClaudeModel(): string {
  return (
    process.env.TIPOTE_CLAUDE_MODEL?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-sonnet-4-5-20250929"
  );
}

export async function POST(req: NextRequest) {
  // ── Pre-validate synchronously before starting the stream ──────────
  let supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  let userId: string;
  let projectId: string | null;
  let system: string;
  let userPrompt: string;

  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Clé API Claude manquante côté serveur." },
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
    projectId = await getActiveProjectId(supabase, userId);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const mode = String(body.mode ?? "generate").trim();
    const isImport = mode === "import";

    // Check credits (same cost for both modes)
    await ensureUserCredits(userId);
    const creditsResult = await consumeCredits(userId, 6, { feature: "quiz_generate" });
    if (creditsResult && typeof creditsResult === "object") {
      const ok = (creditsResult as any).success;
      const err = String((creditsResult as any).error ?? "").toUpperCase();
      if (ok === false && err.includes("NO_CREDITS")) {
        return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
      }
    }

    // User context from business_profiles (niche / mission / address_form)
    let bpQuery = supabase
      .from("business_profiles")
      .select("niche, mission, address_form")
      .eq("user_id", userId);
    if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
    const { data: profile } = await bpQuery.maybeSingle();

    const profileAddressForm = (profile as any)?.address_form;
    const resolvedAddressForm: "tu" | "vous" =
      body.addressForm === "vous" || body.addressForm === "tu"
        ? body.addressForm
        : profileAddressForm === "vous"
          ? "vous"
          : "tu";

    const tone = String(body.tone ?? "inspirant").trim() || "inspirant";

    if (isImport) {
      const content = String(body.content ?? "").trim();
      if (!content) {
        return NextResponse.json(
          { ok: false, error: "content is required for import mode" },
          { status: 400 },
        );
      }
      if (content.length > 50_000) {
        return NextResponse.json(
          { ok: false, error: "content exceeds 50000 characters" },
          { status: 400 },
        );
      }
      const prompts = buildQuizImportPrompt({
        content,
        locale: String(body.locale ?? "fr"),
        addressForm: resolvedAddressForm,
        tone,
      });
      system = prompts.system;
      userPrompt = prompts.user;
    } else {
      const objective = String(body.objective ?? "").trim();
      const target = String(body.target ?? "").trim();

      if (!objective || !target) {
        return NextResponse.json(
          { ok: false, error: "objective and target are required" },
          { status: 400 },
        );
      }

      const format = body.format === "short" ? "short" : body.format === "long" ? "long" : "short";
      const segmentation = body.segmentation === "level" ? "level" : "profile";
      const defaultQuestionCount = format === "short" ? 5 : 8;

      const prompts = buildQuizGenerationPrompt({
        objective,
        target,
        tone,
        cta: String(body.cta ?? ""),
        bonus: String(body.bonus ?? ""),
        intention: String(body.intention ?? ""),
        questionCount: Math.min(12, Math.max(3, Number(body.questionCount) || defaultQuestionCount)),
        resultCount: Math.min(5, Math.max(2, Number(body.resultCount) || 3)),
        niche: (profile as any)?.niche ?? "",
        mission: (profile as any)?.mission ?? "",
        locale: String(body.locale ?? "fr"),
        addressForm: resolvedAddressForm,
        format,
        segmentation,
        askFirstName: Boolean(body.askFirstName),
        askGender: Boolean(body.askGender),
      });
      system = prompts.system;
      userPrompt = prompts.user;
    }
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
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendSSE(event: string, data: any) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      const heartbeat = setInterval(() => {
        try {
          sendSSE("heartbeat", { status: "generating" });
        } catch { /* stream closed */ }
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
        } catch (fetchErr: any) {
          const name = String(fetchErr?.name ?? "");
          const msg = String(fetchErr?.message ?? "");
          if (name === "AbortError" || /aborted|abort/i.test(msg)) {
            sendSSE("error", { ok: false, error: `Timeout Claude API après ${timeoutMs / 1000}s` });
            return;
          }
          throw fetchErr;
        } finally {
          clearTimeout(timer);
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.error("[quiz/generate] Claude API error:", res.status, errText.slice(0, 500));
          if (res.status === 401) {
            sendSSE("error", { ok: false, error: "Clé API Anthropic invalide ou expirée." });
          } else if (res.status === 429) {
            sendSSE("error", { ok: false, error: "Trop de requêtes vers Claude. Réessaie dans quelques secondes." });
          } else {
            sendSSE("error", { ok: false, error: `Erreur Claude API (${res.status}). Réessaie.` });
          }
          return;
        }

        let json: any;
        try {
          json = await res.json();
        } catch (parseErr) {
          console.error("[quiz/generate] Failed to parse Claude response as JSON:", parseErr);
          sendSSE("error", { ok: false, error: "Réponse Claude invalide. Réessaie." });
          return;
        }

        const parts = Array.isArray(json?.content) ? json.content : [];
        const raw = parts
          .map((p: any) => (p?.type === "text" ? String(p?.text ?? "") : ""))
          .filter(Boolean)
          .join("")
          .trim();

        if (!raw) {
          console.error("[quiz/generate] Empty response from Claude. stop_reason:", json?.stop_reason);
          sendSSE("error", { ok: false, error: "L'IA a retourné une réponse vide. Réessaie." });
          return;
        }

        if (json?.stop_reason === "max_tokens") {
          console.error("[quiz/generate] Output truncated (stop_reason=max_tokens). Tokens used:",
            json?.usage?.output_tokens, "/ 8000");
          sendSSE("error", {
            ok: false,
            error: "La génération du quiz a été tronquée (réponse trop longue). Essaie avec moins de questions.",
          });
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
          console.error("[quiz/generate] JSON parse failed. Raw length:", raw.length,
            "stop_reason:", json?.stop_reason, "raw preview:", raw.slice(0, 200));
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
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
