// app/api/onboarding/chat/route.ts
// Onboarding conversationnel v2 (agent Clarifier)
// - N'écrase pas l'onboarding existant (answers/complete restent en place)
// - Stocke la conversation (onboarding_sessions/onboarding_messages)
// - Stocke des facts propres (onboarding_facts) via RPC upsert_onboarding_fact
// - Synchronise quelques champs clés vers business_profiles (source de vérité UI) sans écraser par des vides

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function buildBusinessProfilePatchFromFacts(facts: Array<{ key: string; value: unknown }>) {
  const patch: Record<string, unknown> = {};
  const get = (k: string) => facts.find((f) => f.key === k)?.value;

  const mainTopic = get("main_topic");
  if (typeof mainTopic === "string" && mainTopic.trim()) patch.niche = mainTopic.trim();

  const mission = get("mission_statement");
  if (typeof mission === "string" && mission.trim()) patch.mission = mission.trim();

  const hasOffers = get("has_offers");
  if (typeof hasOffers === "boolean") patch.has_offers = hasOffers;

  const emailList = get("email_list_size");
  const emailN = toNumberOrNull(emailList);
  if (emailN !== null) patch.audience_email = Math.round(emailN);

  const socialPresence = get("social_presence");
  if (isRecord(socialPresence)) {
    const followers = toNumberOrNull(socialPresence.followers);
    if (followers !== null) patch.audience_social = Math.round(followers);
    const mainPlatform =
      typeof socialPresence.main_platform === "string" ? socialPresence.main_platform.trim() : "";
    if (mainPlatform) {
      patch.social_links = patch.social_links ?? null; // ne force pas
    }
  }

  const hours = toNumberOrNull(get("time_available_hours_week"));
  if (hours !== null) patch.time_available = `${Math.round(hours)}h/semaine`;

  const revenue = toNumberOrNull(get("revenue_goal_monthly"));
  if (revenue !== null) patch.revenue_goal_monthly = String(Math.round(revenue));

  const focus = get("primary_focus");
  if (typeof focus === "string" && focus.trim()) patch.main_goal = focus.trim();

  const contentChannels = get("content_channels_priority");
  if (Array.isArray(contentChannels)) {
    const chans = contentChannels.filter((x) => typeof x === "string" && x.trim()).slice(0, 6);
    if (chans.length) patch.content_preference = chans.join(", ");
  }

  const tone = get("tone_preference_hint");
  if (typeof tone === "string" && tone.trim()) patch.preferred_tone = tone.trim();

  // Onboarding v2 flag (utile pour routing)
  patch.onboarding_version = "v2_chat";

  return patch;
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

    // Load business profile (for name/country + patch later)
    const { data: bp } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const locale = pickLocale(req);

    // 1) retrieve or create session
    let sessionId = body.sessionId;

    if (sessionId) {
      const { data: existing, error } = await supabase
        .from("onboarding_sessions")
        .select("id,user_id,status")
        .eq("id", sessionId)
        .single();

      if (error || !existing || existing.user_id !== user.id || existing.status !== "in_progress") {
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

    // 2) log user message
    await supabase.from("onboarding_messages").insert({
      session_id: sessionId,
      role: "user",
      content: body.message,
    });

    // 3) load context: known facts + last messages
    const [{ data: facts }, { data: history }] = await Promise.all([
      supabase
        .from("onboarding_facts")
        .select("key,value,confidence,source,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("onboarding_messages")
        .select("role,content,created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(24),
    ]);

    const knownFacts: Record<string, unknown> = {};
    for (const f of facts ?? []) {
      if (!f?.key) continue;
      knownFacts[String((f as any).key)] = (f as any).value;
    }

    const system = buildOnboardingClarifierSystemPrompt({
      locale,
      userFirstName: typeof (bp as any)?.first_name === "string" ? (bp as any).first_name : null,
      userCountry: typeof (bp as any)?.country === "string" ? (bp as any).country : null,
    });

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
      temperature: 0.35,
      max_tokens: 900,
    });

    const raw = ai.choices?.[0]?.message?.content ?? "";
    const parsed = safeJsonParse(raw);
    const out = AiResponseSchema.parse(parsed);

    // 4) apply facts (upsert) + build patch for business_profiles
    const appliedFacts: Array<{ key: string; confidence: string }> = [];
    const factPairs: Array<{ key: string; value: unknown }> = [];

    for (const f of out.facts ?? []) {
      const key = (f.key ?? "").trim();
      if (!key) continue;

      await supabase.rpc("upsert_onboarding_fact", {
        p_user_id: user.id,
        p_key: key,
        p_value: f.value as any,
        p_confidence: f.confidence,
        p_source: f.source || "onboarding_chat",
      });

      appliedFacts.push({ key, confidence: f.confidence });
      factPairs.push({ key, value: f.value });
    }

    // Sync only if we have something to sync
    if (factPairs.length > 0) {
      const patch = buildBusinessProfilePatchFromFacts(factPairs);
      const keys = Object.keys(patch);
      if (keys.length > 0) {
        // ensure business_profile exists
        if (!bp?.id) {
          await supabase.from("business_profiles").insert({
            user_id: user.id,
            onboarding_completed: false,
            diagnostic_completed: false,
            onboarding_version: "v2_chat",
          });
        }
        // never overwrite with null/empty strings
        const safePatch: Record<string, unknown> = {};
        for (const k of keys) {
          const v = patch[k];
          if (v === null || v === undefined) continue;
          if (typeof v === "string" && !v.trim()) continue;
          safePatch[k] = v;
        }

        if (Object.keys(safePatch).length > 0) {
          await supabase.from("business_profiles").update(safePatch).eq("user_id", user.id);
        }
      }
    }

    // 5) log assistant message
    await supabase.from("onboarding_messages").insert({
      session_id: sessionId,
      role: "assistant",
      content: out.message,
      extracted: { appliedFacts },
    });

    // 6) mark done
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
      appliedFacts,
      done: out.done,
    });
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
