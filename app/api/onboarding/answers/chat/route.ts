// app/api/onboarding/chat/route.ts
// Onboarding conversationnel v2 (agent Clarifier)
// - N'écrase pas l'onboarding existant (answers/complete restent en place)
// - Stocke la conversation (onboarding_sessions/onboarding_messages)
// - Stocke des facts propres (onboarding_facts) via RPC upsert_onboarding_fact
// - Synchronise quelques champs clés vers business_profiles (source de vérité UI) sans écraser par des vides
//
// PATCH (A2) :
// - Compat "done" (prompt) + "should_finish" (backend) => pas de blocage finish
// - Fail-safe serveur : si activities_list >= 2 et primary_activity absent => on force la question + finish=false

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getUserContextBundle, userContextToPromptText } from "@/lib/onboarding/userContext";
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
          value: z.any().optional(),
          confidence: z.number().min(0).max(1).optional(),
        }),
      )
      .default([]),
    // compat: prompt renvoie "done", backend historique "should_finish"
    should_finish: z.boolean().optional(),
    done: z.boolean().optional(),
  })
  .strict();

function safeJsonParse(input: string): any {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function pickLocaleFromHeaders(req: NextRequest) {
  const h = req.headers.get("accept-language") || "";
  const fr = h.toLowerCase().includes("fr");
  return fr ? "fr" : "en";
}

function normalizeKey(k: string) {
  return k.trim().toLowerCase();
}

function factValueIsEmpty(v: unknown) {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === "object" && v && Object.keys(v as any).length === 0) return true;
  return false;
}

function normalizeStringArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x.trim() : String(x ?? "").trim()))
      .filter((s) => s.length > 0);
  }
  if (typeof v === "string") {
    return v
      .split(/\r?\n|,|;|•|\|/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

function buildPrimaryActivityQuestion(locale: "fr" | "en", activities: string[]) {
  const clean = activities.map((a) => a.trim()).filter((a) => a.length > 0);
  const shown = clean.slice(0, 3);
  const list = shown.map((a) => `- ${a}`).join("\n");
  if (locale === "en") {
    const intro = clean.length > 0 ? `You mentioned several activities:\n${list}\n\n` : "";
    return (
      intro +
      "Which ONE do you want to prioritize with Tipote for now? (just answer with the name of the activity)"
    );
  }
  const intro = clean.length > 0 ? `Tu m’as parlé de plusieurs activités :\n${list}\n\n` : "";
  return intro + "Parmi celles-ci, laquelle veux-tu développer en priorité avec Tipote pour l’instant ?";
}

function mergeBusinessProfilePatchFromFacts(facts: Array<{ key: string; value: unknown }>) {
  // Patch minimal & safe : on n'écrase jamais avec du vide
  const patch: Record<string, any> = {};
  for (const f of facts) {
    const k = normalizeKey(f.key);
    const v = (f as any).value;

    if (factValueIsEmpty(v)) continue;

    // mapping clair vers business_profiles
    if (k === "first_name" || k === "firstname" || k === "prenom") patch.first_name = String(v);
    if (k === "country" || k === "pays") patch.country = String(v);
    if (k === "niche") patch.niche = String(v);
    if (k === "mission") patch.mission = String(v);

    if (k === "business_maturity" || k === "maturity" || k === "niveau") patch.business_maturity = String(v);

    if (k === "audience_social" || k === "social_audience") {
      const n = Number(String(v).replace(",", "."));
      if (Number.isFinite(n)) patch.audience_social = Math.max(0, Math.round(n));
    }

    if (k === "audience_email" || k === "email_list" || k === "liste_email") {
      const n = Number(String(v).replace(",", "."));
      if (Number.isFinite(n)) patch.audience_email = Math.max(0, Math.round(n));
    }

    if (k === "time_available" || k === "temps_dispo") patch.time_available = String(v);

    if (k === "main_goal" || k === "objectif_principal") patch.main_goal = String(v);
    if (k === "revenue_goal_monthly" || k === "objectif_revenu_mensuel") patch.revenue_goal_monthly = String(v);

    if (k === "preferred_tone" || k === "tone" || k === "ton") patch.preferred_tone = String(v);
    if (k === "content_preference" || k === "content_style") patch.content_preference = String(v);

    if (k === "social_links") patch.social_links = String(v);

    if (k === "has_offers") {
      if (typeof v === "boolean") patch.has_offers = v;
      else {
        const s = String(v).toLowerCase().trim();
        if (["yes", "oui", "true", "1"].includes(s)) patch.has_offers = true;
        if (["no", "non", "false", "0"].includes(s)) patch.has_offers = false;
      }
    }

    // offres existantes (si user en parle) : stock JSONB "offers"
    if (k === "offers" && v && typeof v === "object") patch.offers = v;
  }
  return patch;
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();

  try {
    const body = BodySchema.parse(await req.json());
    const locale = pickLocaleFromHeaders(req);

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 1) find or create session
    let sessionId = body.sessionId ?? null;

    if (!sessionId) {
      const { data: created, error } = await supabase
        .from("onboarding_sessions")
        .insert({
          user_id: userId,
          status: "active",
        })
        .select("id")
        .single();

      if (error || !created?.id) {
        return NextResponse.json({ error: error?.message ?? "Create session error" }, { status: 400 });
      }
      sessionId = String(created.id);
    } else {
      // validate session belongs to user
      const { data: s, error } = await supabase
        .from("onboarding_sessions")
        .select("id,user_id,status")
        .eq("id", sessionId)
        .maybeSingle();

      if (error || !s?.id) {
        return NextResponse.json({ error: "Invalid session" }, { status: 400 });
      }
      if (String(s.user_id) !== String(userId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // 2) store user message
    const { error: insertMsgErr } = await supabase.from("onboarding_messages").insert({
      session_id: sessionId,
      user_id: userId,
      role: "user",
      content: body.message,
    });
    if (insertMsgErr) {
      return NextResponse.json({ error: insertMsgErr.message }, { status: 400 });
    }

    // 3) fetch existing context
    const [{ data: bp }, { data: facts }, { data: history }] = await Promise.all([
      supabase.from("business_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("onboarding_facts").select("key,value,confidence,updated_at").eq("user_id", userId),
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

    // Contexte unifié (facts + profil) pour mieux guider le clarifier (fail-open)
    let userContextText = "";
    try {
      const bundle = await getUserContextBundle(supabase, userId);
      userContextText = userContextToPromptText(bundle);
    } catch {
      userContextText = "";
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
        user_context_text: userContextText || null,
      },
      null,
      2,
    );

    if (!openai) {
      return NextResponse.json({ error: "Missing OpenAI key (OPENAI_API_KEY_OWNER)" }, { status: 500 });
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

    // ✅ Compat finish flag
    let shouldFinish = Boolean(out.should_finish ?? out.done ?? false);

    // 4) apply facts (upsert) + build patch for business_profiles
    const appliedFacts: Array<{ key: string; confidence: string }> = [];

    const toUpsert = (out.facts || [])
      .map((f) => ({
        key: f.key,
        value: (f as any).value ?? null,
        confidence: typeof f.confidence === "number" ? f.confidence : 0.7,
      }))
      .filter((f) => isNonEmptyString(f.key));

    if (toUpsert.length) {
      for (const f of toUpsert) {
        try {
          const { error } = await supabase.rpc("upsert_onboarding_fact", {
            p_user_id: userId,
            p_key: f.key,
            p_value: f.value,
            p_confidence: f.confidence,
            p_source: "onboarding_chat",
          });
          if (!error) appliedFacts.push({ key: f.key, confidence: String(f.confidence) });
        } catch {
          // fail-open
        }
      }
    }

    const patch = mergeBusinessProfilePatchFromFacts(toUpsert as any);
    if (Object.keys(patch).length) {
      // patch safe : on ne remplace pas avec du vide grâce au filtre ci-dessus
      await supabase.from("business_profiles").update(patch).eq("user_id", userId);
    }

    // 4.b) ✅ Fail-safe serveur pour activité prioritaire
    // Si activities_list >= 2 ET primary_activity absent => on force la question, et on interdit finish
    try {
      const mergedFacts: Record<string, unknown> = { ...knownFacts };
      for (const f of toUpsert as any[]) mergedFacts[String(f.key)] = f.value;

      const activities = normalizeStringArray((mergedFacts as any)["activities_list"]);
      const primary = (mergedFacts as any)["primary_activity"];
      const hasPrimary = typeof primary === "string" && primary.trim().length > 0;

      if (activities.length >= 2 && !hasPrimary) {
        // on force la question (et on bloque finish)
        (out as any).message = buildPrimaryActivityQuestion(locale, activities);
        shouldFinish = false;
      }
    } catch {
      // fail-open
    }

    // 5) store assistant message
    const assistantMsg = out.message;
    await supabase.from("onboarding_messages").insert({
      session_id: sessionId,
      user_id: userId,
      role: "assistant",
      content: assistantMsg,
    });

    // 6) optionally finish onboarding
    if (shouldFinish) {
      // marque BP onboarding_completed = true
      await supabase
        .from("business_profiles")
        .update({ onboarding_completed: true, onboarding_version: "v2" })
        .eq("user_id", userId);

      await supabase.from("onboarding_sessions").update({ status: "completed" }).eq("id", sessionId);
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      message: assistantMsg,
      appliedFacts,
      // compat front : on renvoie les deux clés
      shouldFinish,
      done: shouldFinish,
    });
  } catch (err: any) {
    const message = err?.message ?? "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
