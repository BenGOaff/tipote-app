// app/api/onboarding/answers/chat/route.ts
// Onboarding conversationnel v2 (agent Clarifier)
// Objectif produit : Tipote DOIT comprendre et enregistrer ce que l'user dit.
//
// ✅ Fix qualité (anti-boucle PRO) :
// 1) Extraction serveur déterministe (canonical keys) sur certaines infos critiques,
//    + upsert DB vérifié => l'info est réellement "commit" avant de continuer.
// 2) Prompt renforcé : accusé de compréhension obligatoire + interdiction stricte de répétition.
// 3) Anti-répétition post-modèle : si l'IA repose une question déjà répondue,
//    on remplace par une question suivante, MAIS uniquement si le fact est bien enregistré.
// 4) Debug de confiance : routeVersion + appliedFacts reflètent uniquement des écritures réussies.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getUserContextBundle, userContextToPromptText } from "@/lib/onboarding/userContext";
import { openai } from "@/lib/openaiClient";
import { buildOnboardingClarifierSystemPrompt } from "@/lib/prompts/onboarding/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE_VERSION = "onboarding_chat_v2_quality_2026-02-07";

type ChatRole = "assistant" | "user";
type QuestionCategory = "sales" | "acquisition" | "success" | "primary_activity" | "other";

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
    t.includes("mec")
  );
}

function detectCategory(text: string): QuestionCategory {
  const t = (text || "").toLowerCase();

  if (
    t.includes("réalisé des ventes") ||
    t.includes("des ventes") ||
    t.includes("clients payants") ||
    t.includes("commencé à vendre") ||
    (t.includes("as-tu déjà") && (t.includes("vend") || t.includes("vente"))) ||
    t.includes("have you sold") ||
    t.includes("selling")
  )
    return "sales";

  if (
    t.includes("d'où vient") ||
    t.includes("d’où vient") ||
    t.includes("trafic") ||
    t.includes("tes premiers clients") ||
    t.includes("entendent parler") ||
    t.includes("source de trafic") ||
    t.includes("traffic source") ||
    t.includes("where do your leads come")
  )
    return "acquisition";

  if (
    t.includes("quand tu sauras") ||
    t.includes("réussi avec tipote") ||
    t.includes("mesurer le succès") ||
    t.includes("comptera le plus") ||
    t.includes("chiffre d'affaires") ||
    t.includes("chiffre d’affaires") ||
    t.includes("nombre de clients") ||
    t.includes("taille de ta communauté")
  )
    return "success";

  if (
    t.includes("laquelle veux-tu développer en priorité") ||
    t.includes("laquelle veux-tu prioriser") ||
    t.includes("parmi celles-ci") ||
    t.includes("which one do you want to prioritize")
  )
    return "primary_activity";

  return "other";
}

function normalizeFactValue(key: string, value: unknown): any {
  const k = normalizeKey(key);

  if (k === "activities_list" || k === "content_channels_priority" || k === "acquisition_channels") {
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

  return value;
}

function hasNonEmptyFact(knownFacts: Record<string, unknown>, k: string): boolean {
  const v = knownFacts[k];
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as any).length > 0;
  return true;
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

function extractSuccessMetrics(answer: string): Record<string, any> | null {
  const t = (answer || "").toLowerCase();
  const payload: Record<string, any> = {};

  const criteria: string[] = [];
  if (t.includes("chiffre") || t.includes("ca") || t.includes("revenu") || t.includes("mrr")) criteria.push("revenue");
  if (t.includes("clients")) criteria.push("clients");
  if (t.includes("communaut") || t.includes("audience")) criteria.push("audience");

  if (criteria.length) payload.criteria = Array.from(new Set(criteria));

  // clients_target
  const mClients = answer.match(/(\d{1,4})\s*(clients?|abonnés?|abonnes?)/i);
  if (mClients?.[1]) {
    const n = Number(mClients[1]);
    if (Number.isFinite(n)) payload.clients_target = n;
  }

  // mrr_target_monthly: 10k/mois, 10 000€/mois
  const mK = answer.match(/(\d{1,3})\s*k\s*\/\s*mois/i) || answer.match(/(\d{1,3})\s*k\s*mois/i);
  if (mK?.[1]) {
    const n = Number(mK[1]);
    if (Number.isFinite(n)) payload.mrr_target_monthly = n * 1000;
  } else {
    const mEuro = answer.match(/(\d[\d\s]{1,9})\s*(€|eur|euros)\s*\/\s*mois/i);
    if (mEuro?.[1]) {
      const n = Number(mEuro[1].replace(/\s/g, ""));
      if (Number.isFinite(n)) payload.mrr_target_monthly = n;
    }
  }

  return Object.keys(payload).length ? payload : null;
}

function buildBusinessProfilePatchFromFacts(knownFacts: Record<string, unknown>) {
  // On patch uniquement les champs qui existent déjà dans la logique UI/récap.
  // On ne doit jamais écraser avec des vides.
  const patch: Record<string, any> = {};

  const setIf = (k: string, v: any) => {
    if (v === null || v === undefined) return;
    if (typeof v === "string" && !v.trim()) return;
    patch[k] = v;
  };

  setIf("primary_activity", typeof knownFacts["primary_activity"] === "string" ? String(knownFacts["primary_activity"]).slice(0, 200) : undefined);

  // traffic_source_today (enum)
  setIf("traffic_source_today", typeof knownFacts["traffic_source_today"] === "string" ? knownFacts["traffic_source_today"] : undefined);

  // has_offers / conversion status are useful for dashboard
  setIf("has_offers", typeof knownFacts["has_offers"] === "boolean" ? knownFacts["has_offers"] : undefined);

  // Optional: keep conversion_status in profile if column exists
  setIf("conversion_status", typeof knownFacts["conversion_status"] === "string" ? knownFacts["conversion_status"] : undefined);

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

function nextQuestionFromChecklist(knownFacts: Record<string, unknown>, locale: "fr" | "en"): string | null {
  // On n'utilise ceci que si l'IA tente de répéter une question déjà répondue.
  // Donc: on avance UNIQUEMENT quand le fact existe.
  const fr = locale === "fr";

  if (hasNonEmptyFact(knownFacts, "activities_list") && !hasNonEmptyFact(knownFacts, "primary_activity")) {
    const list = (knownFacts["activities_list"] as any[]).filter((x) => typeof x === "string").slice(0, 6);
    if (list.length >= 2) {
      return fr
        ? `OK, j’ai noté tes différentes idées.\n- ${list.join("\n- ")}\n\nLaquelle tu veux développer en priorité (une seule) ?`
        : `OK, I noted your different ideas.\n- ${list.join("\n- ")}\n\nWhich one do you want to prioritize (just one)?`;
    }
  }

  if (!hasNonEmptyFact(knownFacts, "conversion_status")) {
    return fr
      ? "OK. Aujourd’hui, est-ce que tu as déjà des ventes (même quelques-unes) ou c’est encore en préparation ?"
      : "OK. Today, do you already have sales (even a few), or is it still in preparation?";
  }

  if (!hasNonEmptyFact(knownFacts, "acquisition_channels")) {
    return fr
      ? "OK. D’où viennent surtout tes premiers contacts aujourd’hui (réseaux sociaux, bouche à oreille, SEO, partenariats, autre) ?"
      : "OK. Where do most of your first leads come from (social, word-of-mouth, SEO, partnerships, other)?";
  }

  if (!hasNonEmptyFact(knownFacts, "success_metrics")) {
    return fr
      ? "OK. Quand tu sauras que tu as réussi, ce sera plutôt grâce au chiffre d’affaires, au nombre de clients, à la communauté… ou autre ?"
      : "OK. When you know you’ve succeeded, will it be revenue, clients, audience… or something else?";
  }

  return null;
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
          meta: { route_version: ROUTE_VERSION },
        })
        .select("id")
        .maybeSingle();

      if (error || !created?.id) {
        return NextResponse.json({ error: error?.message ?? "Failed to create session" }, { status: 400 });
      }
      sessionId = String(created.id);
    } else {
      const { data: s, error } = await supabase.from("onboarding_sessions").select("id,user_id,status,meta").eq("id", sessionId).maybeSingle();

      if (error || !s?.id) return NextResponse.json({ error: "Invalid session" }, { status: 400 });
      if (String(s.user_id) !== String(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      // best-effort: store current route version in meta
      try {
        const meta = (s as any)?.meta && typeof (s as any).meta === "object" ? (s as any).meta : {};
        if (meta.route_version !== ROUTE_VERSION) {
          await supabase.from("onboarding_sessions").update({ meta: { ...meta, route_version: ROUTE_VERSION } }).eq("id", sessionId);
        }
      } catch {
        // ignore
      }
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

    const appliedFacts: Array<{ key: string; confidence: string }> = [];

    async function upsertOneFact(fact: { key: string; value: unknown; confidence: "high" | "medium" | "low"; source: string }): Promise<boolean> {
      const key = normalizeKey(fact.key).slice(0, 80);
      const value = normalizeFactValue(key, fact.value);

      // RPC first (if exists)
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

      // direct upsert fallback
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
    const prevAssistantText = String([...hist].reverse().find((m: any) => m?.role === "assistant")?.content ?? "");
    const prevCategory = detectCategory(prevAssistantText);

    const userMsg = String(body.message || "");
    const answerToAnalyze = looksFrustrated(userMsg)
      ? [...hist]
          .reverse()
          .filter((m: any) => m?.role === "user")
          .slice(0, 3)
          .map((m: any) => String(m?.content ?? ""))
          .join("\n\n")
      : userMsg;

    // ✅ Extraction serveur déterministe (comprendre + enregistrer)
    // On ne se limite pas au "prevCategory", on le fait en best-effort dès qu'on voit une info exploitable.
    // Important: on n'avance jamais "à l'aveugle" — on n'utilise ces valeurs que si upsert réussi.
    // Sales
    if (!hasNonEmptyFact(knownFacts, "conversion_status")) {
      const inferred = inferConversionStatusFromAnswer(answerToAnalyze);
      if (inferred !== "unknown") {
        await upsertOneFact({ key: "conversion_status", value: inferred, confidence: "high", source: "server_extract_sales" });
      }
    }

    // Acquisition
    if (!hasNonEmptyFact(knownFacts, "acquisition_channels")) {
      const channels = extractAcquisitionChannels(answerToAnalyze);
      if (channels.length > 0) {
        const ok = await upsertOneFact({ key: "acquisition_channels", value: channels, confidence: "high", source: "server_extract_acquisition" });
        if (ok && !hasNonEmptyFact(knownFacts, "traffic_source_today")) {
          const traffic = inferTrafficSourceTodayFromChannels(channels);
          if (traffic !== "none") {
            await upsertOneFact({ key: "traffic_source_today", value: traffic, confidence: "medium", source: "server_extract_acquisition" });
          }
        }
      }
    }

    // Success metrics
    if (!hasNonEmptyFact(knownFacts, "success_metrics")) {
      const metrics = extractSuccessMetrics(answerToAnalyze);
      if (metrics) {
        await upsertOneFact({ key: "success_metrics", value: metrics, confidence: "high", source: "server_extract_success" });
      }
    }

    // Activities list (if user lists multiple items)
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

      if (uniq.length >= 2 && !hasNonEmptyFact(knownFacts, "activities_list")) {
        await upsertOneFact({ key: "activities_list", value: uniq.slice(0, 6), confidence: "medium", source: "server_extract_activities" });
      }
    } catch {
      // ignore
    }

    // Primary activity (only if assistant asked and user answered a single choice)
    try {
      if (prevCategory === "primary_activity" && !hasNonEmptyFact(knownFacts, "primary_activity")) {
        const candidate = userMsg.trim();
        if (candidate && candidate.length <= 120 && !candidate.includes("\n")) {
          await upsertOneFact({ key: "primary_activity", value: candidate, confidence: "high", source: "server_extract_primary_activity" });
        }
      }
    } catch {
      // ignore
    }

    // Patch business_profiles (best-effort, no overwrite by empty)
    try {
      const patch = buildBusinessProfilePatchFromFacts(knownFacts);
      await updateThenInsertBusinessProfile(supabase, userId, patch);
    } catch {
      // ignore
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

    // Prompt: on met explicitement l'obligation d'accusé de compréhension + anti-répétition.
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
        route_version: ROUTE_VERSION,
        previous_question_category: prevCategory,
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

    // Appliquer facts IA (uniquement si upsert réussi)
    const toUpsert = (out.facts || [])
      .map((f) => {
        const rawKey = typeof f.key === "string" ? f.key : String((f as any).key ?? "");
        const key = normalizeKey(rawKey).slice(0, 80);
        const rawValue = (f as any).value ?? null;
        const value = normalizeFactValue(key, rawValue);
        const confidence = normalizeConfidence((f as any).confidence);
        const source =
          typeof (f as any).source === "string" && (f as any).source.trim() ? (f as any).source.trim().slice(0, 80) : "onboarding_chat";
        return { key, value, confidence, source };
      })
      .filter((f) => f.key && f.key.length > 0);

    for (const f of toUpsert) {
      await upsertOneFact({ key: f.key, value: f.value, confidence: f.confidence, source: f.source });
    }

    // Anti-répétition post-modèle (PRO) :
    // Si l'IA tente de reposer une question déjà répondue, on propose la prochaine question utile.
    // MAIS seulement si le fact est bien enregistré (donc présent dans knownFacts).
    let finalAssistantMessage = out.message;
    let shouldFinish = Boolean(out.should_finish ?? out.done ?? false);

    const aiCategory = detectCategory(finalAssistantMessage);
    const answeredSales = hasNonEmptyFact(knownFacts, "conversion_status");
    const answeredAcq = hasNonEmptyFact(knownFacts, "acquisition_channels");
    const answeredSuccess = hasNonEmptyFact(knownFacts, "success_metrics");

    if ((aiCategory === "sales" && answeredSales) || (aiCategory === "acquisition" && answeredAcq) || (aiCategory === "success" && answeredSuccess)) {
      const next = nextQuestionFromChecklist(knownFacts, locale);
      if (next) {
        finalAssistantMessage = next;
        shouldFinish = false;
      }
    }

    // Fail-safe: si activities_list existe et primary_activity manque, on ne termine jamais
    if (hasNonEmptyFact(knownFacts, "activities_list") && !hasNonEmptyFact(knownFacts, "primary_activity")) {
      shouldFinish = false;
    }

    // store assistant message
    const { error: insertAssistErr } = await supabase.from("onboarding_messages").insert({
      session_id: sessionId,
      role: "assistant",
      content: finalAssistantMessage,
      extracted: { facts: toUpsert, category: aiCategory, route_version: ROUTE_VERSION },
      created_at: new Date().toISOString(),
    });

    if (insertAssistErr) return NextResponse.json({ error: insertAssistErr.message }, { status: 400 });

    return NextResponse.json({
      sessionId,
      message: finalAssistantMessage,
      appliedFacts,
      shouldFinish,
      routeVersion: ROUTE_VERSION,
    });
  } catch (err: any) {
    console.error("[OnboardingChatV2] error:", err);
    return NextResponse.json({ error: err?.message ?? "Bad Request" }, { status: 400 });
  }
}
