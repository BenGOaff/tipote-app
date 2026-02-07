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
// PATCH (A2+ lock activ.) :
// - Auto-capture activities_list (confidence low) si user liste plusieurs items
// - Auto-capture primary_activity (confidence high) si l'assistant vient de demander une priorité
//
// PATCH (QUALITÉ) :
// - Décision "finish" côté serveur : si les 3 piliers sont bien en mémoire (sales + acquisition + success)
//   => shouldFinish=true même si le modèle bavarde encore (sinon le chat ne se termine jamais).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai } from "@/lib/openaiClient";
import { buildOnboardingClarifierSystemPrompt } from "@/lib/prompts/onboarding/system";
import { getUserContextBundle, userContextToPromptText } from "@/lib/onboarding/userContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ChatRole = "assistant" | "user";

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

function isNonEmptyString(v: unknown) {
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
        .slice(0, 10);
      return arr;
    }
    if (typeof value === "string") {
      const parts = value
        .split(/\r?\n|,|;|\||•|\u2022/g)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10);
      return parts;
    }
  }

  if (k === "acquisition_channels" || k === "content_channels_priority") {
    if (Array.isArray(value)) {
      const arr = value
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean)
        .slice(0, 12);
      return arr;
    }
    if (typeof value === "string") {
      const parts = value
        .split(/\r?\n|,|;|\||•|\u2022/g)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12);
      return parts;
    }
  }

  return value;
}

function hasNonEmptyFact(knownFacts: Record<string, unknown>, key: string): boolean {
  const v = (knownFacts as any)[key];
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as any).length > 0;
  return true;
}

function messageLooksFinished(text: string): boolean {
  const t = (text || "").toLowerCase();
  return (
    t.includes("j’ai tout") ||
    t.includes("j'ai tout") ||
    t.includes("tout ce qu’il me faut") ||
    t.includes("tout ce qu'il me faut") ||
    t.includes("tout est clair") ||
    t.includes("tu peux passer à la suite") ||
    t.includes("passer à la suite") ||
    t.includes("passer a la suite") ||
    t.includes("tu peux continuer") ||
    t.includes("tu peux passer la suite")
  );
}

function isReadyToFinish(knownFacts: Record<string, unknown>): boolean {
  // Minimum viable pour déclencher le récap + génération best-effort.
  // On n'avance JAMAIS si l'utilisateur devait choisir une activité prioritaire.
  try {
    const activities = Array.isArray((knownFacts as any)["activities_list"])
      ? ((knownFacts as any)["activities_list"] as any[]).filter((x) => typeof x === "string")
      : [];
    const primary = typeof (knownFacts as any)["primary_activity"] === "string" ? String((knownFacts as any)["primary_activity"]).trim() : "";

    if (activities.length >= 2 && !primary) return false;

    const hasSales = hasNonEmptyFact(knownFacts, "conversion_status");
    const hasAcq = hasNonEmptyFact(knownFacts, "acquisition_channels");
    const hasSuccess = hasNonEmptyFact(knownFacts, "success_metrics");

    // On exige les 3 piliers (sales/acquisition/success) : sinon risque de plan bancal.
    return hasSales && hasAcq && hasSuccess;
  } catch {
    return false;
  }
}

function isSalesQuestion(text: string) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("réalisé des ventes") ||
    t.includes("des ventes") ||
    t.includes("clients payants") ||
    t.includes("commencé à vendre") ||
    (t.includes("as-tu déjà") && (t.includes("vend") || t.includes("vente"))) ||
    t.includes("have you sold") ||
    t.includes("selling")
  );
}

function looksFrustrated(text: string) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("je viens de te répondre") ||
    t.includes("tu m'as déjà") ||
    t.includes("tu m’as déjà") ||
    t.includes("ça tourne") ||
    t.includes("passe à la suite") ||
    t.includes("enchaîne") ||
    t.includes("enchaine") ||
    t.includes("putain") ||
    t.includes("bordel") ||
    t.includes("avance") ||
    t.includes("passe à la suite") ||
    t.includes("boucle") ||
    t.includes("mec")
  );
}

function inferConversionStatusFromAnswer(answer: string): "selling_well" | "inconsistent" | "not_selling" | "unknown" {
  const t = (answer || "").toLowerCase();

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

  if (
    t.includes("régulier") ||
    t.includes("régulièrement") ||
    t.includes("ça vend bien") ||
    t.includes("beaucoup") ||
    t.includes("plein de") ||
    /(\b)\d+\s?(€|eur|euros)(\b)/i.test(answer) ||
    /(\b)\d+\s?k\s*\/\s*mois(\b)/i.test(answer)
  ) {
    return "selling_well";
  }

  if (
    t.includes("quelques") ||
    t.includes("un seul") ||
    t.includes("une vente") ||
    t.includes("deux ventes") ||
    t.includes("beta") ||
    t.includes("bêta") ||
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
    t.includes("trafic") ||
    t.includes("tes premiers clients") ||
    t.includes("entendent parler") ||
    t.includes("source de trafic") ||
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
    t.includes("twitter") ||
    t.includes("x ")
  )
    push("social");
  if (t.includes("youtube")) push("youtube");
  if (t.includes("blog")) push("blog");
  if (t.includes("seo")) push("seo");
  if (t.includes("email") || t.includes("newsletter") || t.includes("liste")) push("email");
  if (t.includes("pub") || t.includes("ads") || t.includes("publicit")) push("ads");
  if (t.includes("parten") || t.includes("collab") || t.includes("affiliation") || t.includes("affiliate")) push("partnerships");

  return out.slice(0, 8);
}

function inferTrafficSourceTodayFromChannels(
  channels: string[],
): "organic_social" | "seo" | "ads" | "partnerships" | "affiliate_platforms" | "none" {
  const set = new Set(channels);
  if (set.has("ads")) return "ads";
  if (set.has("seo")) return "seo";
  if (set.has("partnerships")) return "partnerships";
  if (set.has("social") || set.has("word_of_mouth") || set.has("youtube") || set.has("blog") || set.has("email")) return "organic_social";
  return "none";
}

function buildBusinessProfilePatchFromFacts(facts: Array<{ key: string; value: unknown }>) {
  const patch: Record<string, any> = {};

  const setIf = (k: string, v: any) => {
    if (v === null || v === undefined) return;
    if (typeof v === "string" && !v.trim()) return;
    patch[k] = v;
  };

  for (const f of facts) {
    const key = normalizeKey(f.key);
    const value = f.value;

    if (key === "primary_activity" && isNonEmptyString(value)) setIf("primary_activity", String(value).slice(0, 200));
    if (key === "traffic_source_today" && isNonEmptyString(value)) setIf("traffic_source_today", String(value));
    if (key === "has_offers" && typeof value === "boolean") setIf("has_offers", value);
    if (key === "conversion_status" && isNonEmptyString(value)) setIf("conversion_status", String(value));
  }

  return patch;
}

async function updateThenInsertBusinessProfile(supabase: any, userId: string, patch: Record<string, any>): Promise<void> {
  if (!patch || Object.keys(patch).length === 0) return;

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
      supabase.from("onboarding_messages").select("role,content,created_at").eq("session_id", sessionId).order("created_at", { ascending: true }).limit(60),
    ]);

    const knownFacts: Record<string, unknown> = {};
    for (const f of facts ?? []) {
      if (!f?.key) continue;
      const k = normalizeKey(String((f as any).key));
      knownFacts[k] = normalizeFactValue(k, (f as any).value);
    }

    // --------- helper: upsert fact (RPC then fallback) ----------
    const appliedFacts: Array<{ key: string; confidence: string }> = [];

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
        if (!rpc.error) {
          appliedFacts.push({ key, confidence: fact.confidence });
          knownFacts[key] = value;
          return true;
        }
      } catch {
        // ignore
      }

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
        if (!error) {
          appliedFacts.push({ key, confidence: fact.confidence });
          knownFacts[key] = value;
          return true;
        }
      } catch {
        // ignore
      }

      return false;
    }

    const hist = Array.isArray(history) ? history : [];
    const prevAssistant = [...hist].reverse().find((m: any) => m?.role === "assistant")?.content ?? "";

    const userMsg = String(body.message || "");

    // Auto-capture activities_list si user liste plusieurs items
    try {
      const raw = userMsg
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

      if (uniq.length >= 2 && !Array.isArray(knownFacts["activities_list"])) {
        await upsertOneFact({ key: "activities_list", value: uniq.slice(0, 6), confidence: "low", source: "server_extract_activities" });
      }
    } catch {
      // ignore
    }

    // Auto-capture primary_activity si question explicite précédente + réponse simple
    try {
      const prevWasPrimary = typeof prevAssistant === "string" && prevAssistant.toLowerCase().includes("laquelle") && prevAssistant.toLowerCase().includes("prior");
      if (prevWasPrimary && !isNonEmptyString(knownFacts["primary_activity"])) {
        const candidate = userMsg.trim();
        if (candidate && candidate.length <= 120 && !candidate.includes("\n")) {
          await upsertOneFact({ key: "primary_activity", value: candidate, confidence: "high", source: "server_extract_primary_activity" });
        }
      }
    } catch {
      // ignore
    }

    // Auto-extract sales / acquisition (best-effort) depuis la réponse user
    try {
      if (!isNonEmptyString(knownFacts["conversion_status"]) && (isSalesQuestion(prevAssistant) || looksFrustrated(userMsg))) {
        const inferred = inferConversionStatusFromAnswer(userMsg);
        if (inferred !== "unknown") {
          await upsertOneFact({ key: "conversion_status", value: inferred, confidence: "high", source: "server_extract_sales" });
        }
      }
    } catch {
      // ignore
    }

    try {
      if (!Array.isArray(knownFacts["acquisition_channels"]) && (isAcquisitionQuestion(prevAssistant) || looksFrustrated(userMsg))) {
        const channels = extractAcquisitionChannels(userMsg);
        if (channels.length > 0) {
          const ok = await upsertOneFact({ key: "acquisition_channels", value: channels, confidence: "high", source: "server_extract_acquisition" });
          if (ok && !isNonEmptyString(knownFacts["traffic_source_today"])) {
            const traffic = inferTrafficSourceTodayFromChannels(channels);
            if (traffic !== "none") {
              await upsertOneFact({ key: "traffic_source_today", value: traffic, confidence: "medium", source: "server_extract_acquisition" });
            }
          }
        }
      }
    } catch {
      // ignore
    }

    // Contexte unifié (facts + profil)
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
        goal:
          "Understand, extract and persist facts. " +
          "Your message MUST start with a 1-sentence acknowledgement of what the user just said, then ask 1 new question. " +
          "NEVER repeat a question already answered in known_facts or conversation_history.",
        known_facts: knownFacts,
        business_profile_snapshot: bp ?? null,
        conversation_history: (history ?? []).map((m: any) => ({ role: m.role as ChatRole, content: m.content })),
        user_context_text: userContextText || null,
        previous_question_was_sales: isSalesQuestion(prevAssistant),
        previous_question_was_acquisition: isAcquisitionQuestion(prevAssistant),
        user_frustrated: looksFrustrated(userMsg),
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
      temperature: 0.25,
      max_tokens: 900,
    });

    const raw = ai.choices?.[0]?.message?.content ?? "";
    const parsed = safeJsonParse(raw);
    const out = AiResponseSchema.parse(parsed);

    let shouldFinish = Boolean(out.should_finish ?? out.done ?? false);

    // 4) apply facts + patch business_profiles
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
      .filter((f) => f.key && f.key.length > 0);

    for (const f of toUpsert) {
      await upsertOneFact({ key: f.key, value: f.value, confidence: f.confidence, source: f.source });
    }

    // Fail-safe : interdit le finish si activities_list>=2 et primary_activity manquante
    try {
      const activities = Array.isArray(knownFacts["activities_list"]) ? (knownFacts["activities_list"] as any[]).filter((x) => typeof x === "string") : [];
      const primary = typeof knownFacts["primary_activity"] === "string" ? String(knownFacts["primary_activity"]) : "";

      if (activities.length >= 2 && !primary) {
        shouldFinish = false;
      }
    } catch {
      // ignore
    }

    // ✅ Décision finish (serveur = source de vérité)
    // On n'affiche le récap / finalisation QUE si on a vraiment les 3 piliers en mémoire.
    try {
      const ready = isReadyToFinish(knownFacts);

      if (ready) {
        shouldFinish = true;
      } else if (shouldFinish && !ready) {
        // Le modèle peut se tromper : on refuse de finir sans les facts requis.
        shouldFinish = false;
      }

      // Si le modèle dit explicitement qu'il a fini, on ne le croit que si ready=true.
      if (messageLooksFinished(out.message) && ready) {
        shouldFinish = true;
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
