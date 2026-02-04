// app/api/onboarding/chat/route.ts
// Onboarding conversationnel v2 (agent de clarification)
// - Chat naturel (pas un questionnaire)
// - Collecte des facts exploitables (onboarding_facts) via upsert_onboarding_fact()
// - Log complet (onboarding_sessions + onboarding_messages)
// IMPORTANT: ne casse pas l'onboarding existant (routes /answers et /complete restent inchangées)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai } from "@/lib/openaiClient";
import { buildOnboardingClarifierSystemPrompt } from "@/lib/prompts/onboarding/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z
  .object({
    message: z.string().trim().min(1).max(4000),
    sessionId: z.string().uuid().optional(),
  })
  .strict();

const AiResponseSchema = z
  .object({
    message: z.string().trim().min(1).max(4000),
    facts: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(80),
          value: z.unknown(),
          confidence: z.enum(["high", "medium", "low"]).optional().default("high"),
          source: z.string().optional().default("onboarding_chat"),
        }),
      )
      .optional()
      .default([]),
    done: z.boolean().optional().default(false),
  })
  .strict();

type Locale = "fr" | "en";

function pickLocale(req: NextRequest): Locale {
  const h = req.headers.get("accept-language") || "";
  return h.toLowerCase().includes("fr") ? "fr" : "en";
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = BodySchema.parse(await req.json());

    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1) récupérer/initialiser une session
    let sessionId = body.sessionId;

    if (sessionId) {
      const { data: existing, error } = await supabase
        .from("onboarding_sessions")
        .select("id,user_id,status")
        .eq("id", sessionId)
        .single();

      if (error || !existing || existing.user_id !== user.id) {
        sessionId = undefined;
      } else if (existing.status !== "in_progress") {
        // si session terminée, on en crée une nouvelle (évite les incohérences)
        sessionId = undefined;
      }
    }

    if (!sessionId) {
      const { data: created, error } = await supabase
        .from("onboarding_sessions")
        .insert({
          user_id: user.id,
          status: "in_progress",
          onboarding_version: "v2_chat",
        })
        .select("id")
        .single();

      if (error || !created?.id) {
        return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
      }
      sessionId = created.id;
    }

    // 2) log message user
    await supabase.from("onboarding_messages").insert({
      session_id: sessionId,
      role: "user",
      content: body.message,
    });

    // 3) context : facts + business profile + last messages
    const [{ data: facts }, { data: bp }, { data: history }] = await Promise.all([
      supabase
        .from("onboarding_facts")
        .select("key,value,confidence,source,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("business_profiles")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("onboarding_messages")
        .select("role,content,created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(24),
    ]);

    const locale = pickLocale(req);
    const firstName = (bp as any)?.first_name ?? (bp as any)?.firstName ?? null;
    const country = (bp as any)?.country ?? null;

    const system = buildOnboardingClarifierSystemPrompt({
      locale,
      userFirstName: typeof firstName === "string" ? firstName : null,
      userCountry: typeof country === "string" ? country : null,
    });

    const knownFacts: Record<string, unknown> = {};
    for (const f of facts ?? []) {
      if (!f?.key) continue;
      knownFacts[String((f as any).key)] = (f as any).value;
    }

    const userPrompt = JSON.stringify(
      {
        goal: "Collect missing onboarding facts with minimal friction. Ask only one short question.",
        known_facts: knownFacts,
        business_profile_snapshot: bp ?? null,
        conversation_history: (history ?? []).map((m: any) => ({
          role: m.role,
          content: m.content,
        })),
      },
      null,
      2,
    );

    if (!openai) {
      return NextResponse.json(
        { error: "Missing OpenAI key (OPENAI_API_KEY_OWNER)" },
        { status: 500 },
      );
    }

    const model = process.env.TIPOTE_ONBOARDING_MODEL?.trim() || "gpt-4.1";

    const ai = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 900,
    });

    const raw = ai.choices?.[0]?.message?.content ?? "";
    const parsed = safeJsonParse(raw);
    const out = AiResponseSchema.parse(parsed);

    // 4) upsert facts extraits
    const applied: Array<{ key: string; confidence: string }> = [];
    for (const f of out.facts ?? []) {
      const key = (f.key ?? "").trim();
      if (!key || key.length > 80) continue;

      await supabase.rpc("upsert_onboarding_fact", {
        p_user_id: user.id,
        p_key: key,
        p_value: f.value as any,
        p_confidence: f.confidence,
        p_source: f.source || "onboarding_chat",
      });

      applied.push({ key, confidence: f.confidence });
    }

    // 5) log assistant message
    await supabase.from("onboarding_messages").insert({
      session_id: sessionId,
      role: "assistant",
      content: out.message,
      extracted: { applied },
    });

    // 6) mark session completed if done
    if (out.done) {
      await supabase
        .from("onboarding_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", sessionId)
        .eq("user_id", user.id);
    }

    return NextResponse.json({
      sessionId,
      message: out.message,
      appliedFacts: applied,
      done: out.done,
    });
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
