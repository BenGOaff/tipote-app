// app/api/onboarding/answers/chat/route.ts
// Onboarding conversationnel v2 (agent Clarifier)
// - N'écrase pas l'onboarding existant (answers/complete restent en place)
// - Stocke la conversation (onboarding_sessions/onboarding_messages)
// - Stocke des facts propres (onboarding_facts) via RPC upsert_onboarding_fact
// - Synchronise quelques champs clés vers business_profiles (source de vérité UI) sans écraser par des vides
//
// PATCH (A2) :
// - Compat "done" (prompt) + "should_finish" (backend) => pas de blocage finish
// - Fail-safe serveur : si activities_list >= 2 et primary_activity absent => on force la question + finish=false
//
// PATCH (DB ALIGNMENT) :
// - onboarding_sessions: onboarding_version, started_at, meta sont NOT NULL
// - onboarding_messages: pas de user_id, extracted JSONB NOT NULL
// - onboarding_facts: confidence TEXT (high|medium|low) + fallback upsert si RPC absente
//
// PATCH (A2+ lock activité prioritaire) :
// - Normalise les keys (lowercase) + normalise les valeurs pour activities_list (array)
// - Capture directement primary_activity quand l'assistant vient de demander de choisir UNE activité
//   => évite la dépendance totale à l'extraction IA
//
// ✅ PATCH (A2 anti-boucle “tu m’as déjà répondu”) :
// - Heuristique serveur (ventes) : si l’assistant demande “as-tu déjà vendu / ventes / clients payants”
//   et que l’utilisateur répond, on infère conversion_status et on l’upsert AVANT appel IA => pas de question répétée.
//
// ✅ PATCH (A2 anti-boucle acquisition / trafic) :
// - Heuristique serveur : si l’assistant demande “d’où vient ton trafic / comment tes clients entendent parler”
//   et que l’utilisateur répond, on infère acquisition_channels + traffic_source_today AVANT appel IA => pas de question répétée.

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

const AiResponseSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  facts: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(80),
        value: z.any().optional(),
        confidence: z.union([z.enum(["high", "medium", "low"]), z.number().min(0).max(1)]).optional(),
        source: z.string().trim().max(80).optional(),
      }),
    )
    .default([]),
  done: z.boolean().optional(),
  should_finish: z.boolean().optional(),
});

function pickLocaleFromHeaders(req: NextRequest): "fr" | "en" {
  const h = (req.headers.get("accept-language") || "").toLowerCase();
  if (h.includes("fr")) return "fr";
  return "en";
}

function safeJsonParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizeKey(key: string) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeConfidence(c: unknown): "high" | "medium" | "low" {
  if (typeof c === "string") {
    const v = c.trim().toLowerCase();
    if (v === "high" || v === "medium" || v === "low") return v;
  }
  if (typeof c === "number") {
    if (c >= 0.75) return "high";
    if (c >= 0.4) return "medium";
    return "low";
  }
  return "medium";
}

function normalizeFactValue(key: string, value: unknown): any {
  const k = normalizeKey(key);

  if (k === "activities_list") {
    if (Array.isArray(value)) {
      const arr = value
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean)
        .slice(0, 8);
      return arr;
    }
    if (typeof value === "string") {
      const parts = value
        .split(/\r?\n|,|;|\||•|\u2022/g)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8);
      return parts;
    }
  }

  return value;
}

function isSalesQuestion(text: string) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("déjà commencé") ||
    t.includes("as-tu déjà") ||
    t.includes("réalisé des ventes") ||
    t.includes("des ventes") ||
    t.includes("clients payants") ||
    t.includes("commencé à vendre") ||
    t.includes("selling") ||
    t.includes("have you sold")
  );
}

function looksFrustrated(text: string) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("je viens de te répondre") ||
    t.includes("tu m'as déjà") ||
    t.includes("ça tourne") ||
    t.includes("passe à la suite") ||
    t.includes("mec") ||
    t.includes("putain") ||
    t.includes("bordel")
  );
}

function inferConversionStatusFromAnswer(answer: string): "selling_well" | "inconsistent" | "not_selling" | "unknown" {
  const t = (answer || "").toLowerCase();

  // not selling
  if (
    t.includes("pas encore") ||
    t.includes("pas vendu") ||
    t.includes("aucun client") ||
    t.includes("aucune vente") ||
    t.includes("0 vente") ||
    t.includes("zéro") ||
    t.includes("zero") ||
    (t.includes("je n'ai pas") && (t.includes("vendu") || t.includes("clients payants")))
  ) {
    return "not_selling";
  }

  // selling well signals
  if (
    t.includes("régulier") ||
    t.includes("régulièrement") ||
    t.includes("ça vend bien") ||
    t.includes("beaucoup") ||
    t.includes("plein de") ||
    /(\b)([2-9]\d{3,}|\d{1,3}\s?k)(\b)/i.test(answer) || // 2000 / 50k / etc
    /(\b)\d+\s?(€|eur|euros)(\b)/i.test(answer)
  ) {
    return "selling_well";
  }

  // a few / test sales => inconsistent
  if (
    t.includes("quelques") ||
    t.includes("1") ||
    t.includes("un seul") ||
    t.includes("une vente") ||
    t.includes("deux ventes") ||
    t.includes("beta") ||
    t.includes("test") ||
    t.includes("en préparation") ||
    t.includes("je commence") ||
    t.includes("pas régulier")
  ) {
    return "inconsistent";
  }

  return "unknown";
}

function isAcquisitionQuestion(text: string) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("d'où vient") ||
    t.includes("d’où vient") ||
    t.includes("vient principalement ton trafic") ||
    t.includes("tes premiers clients") ||
    t.includes("entendent parler") ||
    t.includes("comment tes premiers clients") ||
    t.includes("source de trafic") ||
    t.includes("trafic aujourd'hui") ||
    t.includes("trafic aujourd’hui") ||
    t.includes("traffic source") ||
    t.includes("where do your leads come")
  );
}

function extractAcquisitionChannels(answer: string): string[] {
  const t = (answer || "").toLowerCase();
  const out: string[] = [];

  const push = (v: string) => {
    if (!out.includes(v)) out.push(v);
  };

  if (t.includes("bouche") || t.includes("oreille") || t.includes("recommand") || t.includes("referr")) push("word_of_mouth");
  if (
    t.includes("réseaux") ||
    t.includes("reseaux") ||
    t.includes("social") ||
    t.includes("instagram") ||
    t.includes("tiktok") ||
    t.includes("linkedin") ||
    t.includes("facebook") ||
    t.includes("threads") ||
    t.includes("x ") ||
    t.includes("twitter")
  )
    push("social");
  if (t.includes("youtube")) push("youtube");
  if (t.includes("blog")) push("blog");
  if (t.includes("seo")) push("seo");
  if (t.includes("email") || t.includes("newsletter") || t.includes("liste")) push("email");
  if (t.includes("pub") || t.includes("ads") || t.includes("publicit")) push("ads");
  if (t.includes("parten") || t.includes("collab") || t.includes("affiliation") || t.includes("affiliate")) push("partnerships");

  return out.slice(0, 6);
}

function inferTrafficSourceTodayFromChannels(
  channels: string[],
): "organic_social" | "seo" | "ads" | "partnerships" | "affiliate_platforms" | "none" {
  const set = new Set(channels);
  if (set.has("ads")) return "ads";
  if (set.has("seo")) return "seo";
  if (set.has("partnerships")) return "partnerships";
  // bouche à oreille + social + youtube + blog => organic_social (au sens "organique")
  if (set.has("social") || set.has("word_of_mouth") || set.has("youtube") || set.has("blog") || set.has("email"))
    return "organic_social";
  return "none";
}

function buildBusinessProfilePatchFromFacts(facts: Array<{ key: string; value: any }>) {
  const patch: Record<string, any> = {};

  for (const f of facts) {
    const k = normalizeKey(f.key);
    const v = f.value;

    // Champs connus pour UI dashboard / récap
    if (k === "first_name" && typeof v === "string" && v.trim()) patch.first_name = v.trim().slice(0, 80);
    if (k === "country" && typeof v === "string" && v.trim()) patch.country = v.trim().slice(0, 80);
    if (k === "niche" && typeof v === "string" && v.trim()) patch.niche = v.trim().slice(0, 200);
    if (k === "primary_activity" && typeof v === "string" && v.trim()) patch.primary_activity = v.trim().slice(0, 200);

    // Align prompt key -> DB/UI
    if (k === "revenue_goal_monthly") {
      const num = typeof v === "number" ? v : typeof v === "string" ? Number(String(v).replace(/[^\d.]/g, "")) : NaN;
      if (Number.isFinite(num)) patch.revenue_goal_monthly = num;
    }

    if (k === "time_available_hours_week") {
      const num = typeof v === "number" ? v : typeof v === "string" ? Number(String(v).replace(/[^\d.]/g, "")) : NaN;
      if (Number.isFinite(num)) patch.weekly_hours = num;
    }

    if (k === "offers" && v && typeof v === "object") patch.offers = v;
  }

  return patch;
}

async function updateThenInsertBusinessProfile(supabase: any, userId: string, patch: Record<string, any>): Promise<void> {
  const row: Record<string, any> = {
    user_id: userId,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const upd = await supabase.from("business_profiles").update(row).eq("user_id", userId).select("id");
  if (!upd.error) {
    if (Array.isArray(upd.data) && upd.data.length > 0) return;
  }

  const ins = await supabase.from("business_profiles").insert(row).select("id");
  if (ins.error) {
    console.warn("[OnboardingChatV2] updateThenInsertBusinessProfile failed:", ins.error);
  }
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
          onboarding_version: "v2",
          status: "active",
          started_at: new Date().toISOString(),
          meta: {},
        })
        .select("id")
        .maybeSingle();

      if (error || !created?.id) {
        return NextResponse.json({ error: error?.message ?? "Failed to create session" }, { status: 400 });
      }
      sessionId = String(created.id);
    } else {
      const { data: s, error } = await supabase.from("onboarding_sessions").select("id,user_id,status").eq("id", sessionId).maybeSingle();

      if (error || !s?.id) return NextResponse.json({ error: "Invalid session" }, { status: 400 });
      if (String(s.user_id) !== String(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2) store user message
    const { error: insertMsgErr } = await supabase.from("onboarding_messages").insert({
      session_id: sessionId,
      role: "user",
      content: body.message,
      extracted: {},
      created_at: new Date().toISOString(),
    });
    if (insertMsgErr) return NextResponse.json({ error: insertMsgErr.message }, { status: 400 });

    // 3) fetch existing context
    const [{ data: bp }, { data: facts }, { data: history }] = await Promise.all([
      supabase.from("business_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("onboarding_facts").select("key,value,confidence,updated_at").eq("user_id", userId),
      supabase.from("onboarding_messages").select("role,content,created_at").eq("session_id", sessionId).order("created_at", { ascending: true }).limit(24),
    ]);

    const knownFacts: Record<string, unknown> = {};
    for (const f of facts ?? []) {
      if (!f?.key) continue;
      const k = normalizeKey(String((f as any).key));
      knownFacts[k] = normalizeFactValue(k, (f as any).value);
    }

    async function upsertOneFact(fact: { key: string; value: unknown; confidence: "high" | "medium" | "low"; source: string }): Promise<boolean> {
      const key = normalizeKey(fact.key).slice(0, 80);
      const value = normalizeFactValue(key, fact.value);

      try {
        const rpc = await supabase.rpc("upsert_onboarding_fact", {
          p_user_id: userId,
          p_key: key,
          p_value: value,
          p_confidence: fact.confidence,
          p_source: fact.source,
        });

        if (!rpc.error) return true;
      } catch {
        // ignore
      }

      // fallback upsert direct (best-effort)
      try {
        const { error } = await supabase.from("onboarding_facts").upsert(
          {
            user_id: userId,
            key,
            value,
            confidence: fact.confidence,
            source: fact.source,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,key" },
        );

        if (!error) return true;
      } catch {
        // ignore
      }

      return false;
    }

    // ---- ✅ PATCH anti-boucle ventes : inférer conversion_status si on vient de répondre à la question ventes
    try {
      const convKey = "conversion_status";
      const already = knownFacts[convKey];
      const hist = Array.isArray(history) ? history : [];

      // previous assistant msg (before the one we just inserted)
      const prevAssistant = [...hist].reverse().find((m: any) => m?.role === "assistant")?.content ?? "";

      if (!already && isSalesQuestion(String(prevAssistant))) {
        // Si le user est agacé (“je t’ai répondu”), on tente aussi sur le dernier message user précédent
        const lastUserBeforeThis = [...hist]
          .reverse()
          .filter((m: any) => m?.role === "user")
          .slice(0, 3)
          .map((m: any) => String(m?.content ?? ""))
          .join("\n\n");

        const answerToAnalyze = looksFrustrated(body.message) ? lastUserBeforeThis : body.message;

        const inferred = inferConversionStatusFromAnswer(String(answerToAnalyze || ""));
        if (inferred !== "unknown") {
          const ok = await upsertOneFact({ key: convKey, value: inferred, confidence: "medium", source: "heuristic_sales_answer" });
          if (ok) knownFacts[convKey] = inferred;
        }
      }
    } catch {
      // fail-open
    }

    // ---- ✅ PATCH anti-boucle acquisition / trafic : inférer acquisition_channels + traffic_source_today
    try {
      const acqKey = "acquisition_channels";
      const trafficKey = "traffic_source_today";
      const alreadyAcq = knownFacts[acqKey];
      const alreadyTraffic = knownFacts[trafficKey];
      const hist = Array.isArray(history) ? history : [];
      const prevAssistant = [...hist].reverse().find((m: any) => m?.role === "assistant")?.content ?? "";

      if ((!alreadyAcq || !alreadyTraffic) && isAcquisitionQuestion(String(prevAssistant))) {
        const lastUserBeforeThis = [...hist]
          .reverse()
          .filter((m: any) => m?.role === "user")
          .slice(0, 3)
          .map((m: any) => String(m?.content ?? ""))
          .join("\n\n");

        const answerToAnalyze = looksFrustrated(body.message) ? lastUserBeforeThis : body.message;
        const channels = extractAcquisitionChannels(String(answerToAnalyze || ""));

        if (!alreadyAcq && channels.length > 0) {
          const ok = await upsertOneFact({ key: acqKey, value: channels, confidence: "medium", source: "heuristic_acquisition_answer" });
          if (ok) knownFacts[acqKey] = channels;
        }

        if (!alreadyTraffic) {
          const traffic = inferTrafficSourceTodayFromChannels(channels);
          if (traffic && traffic !== "none") {
            const ok2 = await upsertOneFact({ key: trafficKey, value: traffic, confidence: "medium", source: "heuristic_acquisition_answer" });
            if (ok2) knownFacts[trafficKey] = traffic;
          }
        }
      }
    } catch {
      // fail-open
    }

    // ---- existing: auto-capture activities_list from last user message if multiple items (confidence low)
    try {
      const txt = String(body.message || "");
      const raw = txt
        .split(/\r?\n|,|;|\||•|\u2022/g)
        .map((s) => s.trim())
        .filter(Boolean);

      const uniq: string[] = [];
      for (const item of raw) {
        const cleaned = item.replace(/^[-–—\s]+/, "").trim();
        if (!cleaned) continue;
        if (cleaned.length > 80) continue;
        if (!uniq.some((u) => u.toLowerCase() === cleaned.toLowerCase())) uniq.push(cleaned);
      }

      if (uniq.length >= 2) {
        const ok = await upsertOneFact({ key: "activities_list", value: uniq.slice(0, 6), confidence: "low", source: "user_message_parse" });
        if (ok) knownFacts["activities_list"] = uniq.slice(0, 6);
      }
    } catch {
      // fail-open
    }

    // ---- existing: capture primary_activity when assistant asked to pick one (lock)
    try {
      const hist = Array.isArray(history) ? history : [];
      const prevAssistant = [...hist].reverse().find((m: any) => m?.role === "assistant")?.content ?? "";
      const prevAssistantLower = String(prevAssistant || "").toLowerCase();

      const askedPrimary =
        prevAssistantLower.includes("laquelle veux-tu développer en priorité") ||
        prevAssistantLower.includes("laquelle veux-tu prioriser") ||
        prevAssistantLower.includes("parmi celles-ci") ||
        prevAssistantLower.includes("which one do you want to prioritize");

      const activities = Array.isArray(knownFacts["activities_list"]) ? (knownFacts["activities_list"] as any[]).filter((x) => typeof x === "string") : [];

      if (askedPrimary && activities.length >= 2 && !knownFacts["primary_activity"]) {
        const candidate = String(body.message || "").trim();
        if (candidate && candidate.length > 0 && candidate.length <= 120 && !candidate.includes("\n")) {
          const ok = await upsertOneFact({ key: "primary_activity", value: candidate, confidence: "high", source: "user_choice" });
          if (ok) knownFacts["primary_activity"] = candidate;
        }
      }
    } catch {
      // fail-open
    }

    // Contexte unifié (facts + profil) (fail-open)
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
        conversation_history: (history ?? []).map((m: any) => ({ role: m.role, content: m.content })),
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

    let shouldFinish = Boolean(out.should_finish ?? out.done ?? false);

    // 4) apply facts + patch business_profiles
    const appliedFacts: Array<{ key: string; confidence: string }> = [];

    const toUpsert = (out.facts || [])
      .map((f) => {
        const rawKey = typeof f.key === "string" ? f.key : String((f as any).key ?? "");
        const key = normalizeKey(rawKey).slice(0, 80);

        const rawValue = (f as any).value ?? null;
        const value = normalizeFactValue(key, rawValue);

        return {
          key,
          value,
          confidence: normalizeConfidence((f as any).confidence),
          source: typeof (f as any).source === "string" && (f as any).source.trim() ? (f as any).source.trim().slice(0, 80) : "onboarding_chat",
        };
      })
      .filter((f) => isNonEmptyString(f.key));

    for (const f of toUpsert) {
      const ok = await upsertOneFact({ key: f.key, value: f.value, confidence: f.confidence, source: f.source });
      if (ok) {
        appliedFacts.push({ key: f.key, confidence: f.confidence });
        knownFacts[f.key] = f.value;
      }
    }

    // Fail-safe serveur : si activities_list >= 2 et primary_activity absent => on force la question + finish=false
    try {
      const activities = Array.isArray(knownFacts["activities_list"]) ? (knownFacts["activities_list"] as any[]).filter((x) => typeof x === "string") : [];
      const primary = typeof knownFacts["primary_activity"] === "string" ? String(knownFacts["primary_activity"]) : "";

      if (activities.length >= 2 && !primary) {
        shouldFinish = false;
      }
    } catch {
      // ignore
    }

    // Patch business_profiles (best-effort)
    try {
      const patch = buildBusinessProfilePatchFromFacts(Object.entries(knownFacts).map(([key, value]) => ({ key, value })));
      if (Object.keys(patch).length > 0) {
        await updateThenInsertBusinessProfile(supabase, userId, patch);
      }
    } catch {
      // ignore
    }

    // 5) store assistant message
    const { error: insertAssistErr } = await supabase.from("onboarding_messages").insert({
      session_id: sessionId,
      role: "assistant",
      content: out.message,
      extracted: { facts: toUpsert },
      created_at: new Date().toISOString(),
    });

    if (insertAssistErr) return NextResponse.json({ error: insertAssistErr.message }, { status: 400 });

    return NextResponse.json({
      sessionId,
      message: out.message,
      appliedFacts,
      shouldFinish,
    });
  } catch (err: any) {
    console.error("[OnboardingChatV2] error:", err);
    return NextResponse.json({ error: err?.message ?? "Bad Request" }, { status: 400 });
  }
}
