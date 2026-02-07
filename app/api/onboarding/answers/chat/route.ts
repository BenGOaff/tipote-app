// app/api/onboarding/answers/chat/route.ts
// Onboarding conversationnel v2 (agent Clarifier)
// - N'écrase pas l'onboarding existant (answers/complete restent en place)
// - Stocke la conversation (onboarding_sessions/onboarding_messages)
// - Stocke des facts propres (onboarding_facts) via RPC upsert_onboarding_fact
// - Synchronise les champs "récap" vers business_profiles (source de vérité UI) sans écraser par des vides
//
// PATCH PREMIUM (finish UX) :
// - Si le bot dit "tu peux passer à la suite" => le serveur déclenche shouldFinish=true
// - Si l'utilisateur répond juste "ok" après ce message => finish immédiat (pas de boucle)
// - Extracteurs serveur pour alimenter le récap (revenue_goal_monthly, time_available, niche, main_goal, tone, content)
// - Garde-fou : si activities_list>=2 et primary_activity manquante => on ne termine pas

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
  try {
    const activities = Array.isArray((knownFacts as any)["activities_list"])
      ? ((knownFacts as any)["activities_list"] as any[]).filter((x) => typeof x === "string")
      : [];
    const primary = typeof (knownFacts as any)["primary_activity"] === "string" ? String((knownFacts as any)["primary_activity"]).trim() : "";

    if (activities.length >= 2 && !primary) return false;

    const hasSales = hasNonEmptyFact(knownFacts, "conversion_status");
    const hasAcq = hasNonEmptyFact(knownFacts, "acquisition_channels");
    const hasSuccess = hasNonEmptyFact(knownFacts, "success_metrics");

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

function isUserConfirmingToFinish(text: string): boolean {
  const t = (text || "").trim().toLowerCase();
  if (!t) return false;
  return (
    t === "ok" ||
    t === "okay" ||
    t === "go" ||
    t === "continuer" ||
    t === "continue" ||
    t === "c'est bon" ||
    t === "cest bon" ||
    t === "ça marche" ||
    t === "ca marche" ||
    t === "parfait" ||
    t === "super" ||
    t === "yes" ||
    t === "oui"
  );
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

function extractSuccessMetrics(answer: string): Record<string, any> | null {
  const t = (answer || "").toLowerCase();
  const payload: Record<string, any> = {};

  const criteria: string[] = [];
  if (t.includes("chiffre") || t.includes("ca") || t.includes("revenu") || t.includes("mrr")) criteria.push("revenue");
  if (t.includes("clients")) criteria.push("clients");
  if (t.includes("communaut") || t.includes("audience")) criteria.push("audience");

  if (criteria.length) payload.criteria = Array.from(new Set(criteria));

  const mClients = answer.match(/(\d{1,4})\s*(clients?|abonnés?|abonnes?)/i);
  if (mClients?.[1]) {
    const n = Number(mClients[1]);
    if (Number.isFinite(n)) payload.clients_target = n;
  }

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

function extractRevenueGoalMonthly(answer: string): number | null {
  const s = String(answer || "");
  const t = s.toLowerCase();

  const mK = t.match(/(\d{1,3})\s*k\s*\/\s*mois/) || t.match(/(\d{1,3})\s*k\s*mois/);
  if (mK?.[1]) {
    const n = Number(mK[1]);
    if (Number.isFinite(n)) return n * 1000;
  }

  const mEuroMonth = s.match(/(\d[\d\s]{1,9})\s*(€|eur|euros)\s*\/\s*mois/i);
  if (mEuroMonth?.[1]) {
    const n = Number(mEuroMonth[1].replace(/\s/g, ""));
    if (Number.isFinite(n)) return n;
  }

  const mPlain = s.match(/\b(\d{2,6})\b/);
  if (mPlain?.[1]) {
    const n = Number(mPlain[1]);
    if (Number.isFinite(n) && n >= 200 && n <= 999999) return n;
  }

  return null;
}

function extractTimeAvailableHoursWeek(answer: string): number | null {
  const t = String(answer || "").toLowerCase();

  // "2h/jour" => 14h/semaine
  const mPerDay = t.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*h\s*\/\s*jour/);
  if (mPerDay?.[1]) {
    const n = Number(mPerDay[1].replace(",", "."));
    if (Number.isFinite(n)) return Math.round(n * 7 * 10) / 10;
  }

  // "5-10h/semaine" => prendre la moyenne
  const mRange = t.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*h\s*\/\s*semaine/);
  if (mRange?.[1] && mRange?.[2]) {
    const a = Number(mRange[1]);
    const b = Number(mRange[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.round(((a + b) / 2) * 10) / 10;
  }

  // "5h/semaine"
  const mWeek = t.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*h\s*\/\s*semaine/);
  if (mWeek?.[1]) {
    const n = Number(mWeek[1].replace(",", "."));
    if (Number.isFinite(n)) return n;
  }

  return null;
}

function formatTimeAvailable(hoursWeek: number | null): string | null {
  if (!hoursWeek || !Number.isFinite(hoursWeek) || hoursWeek <= 0) return null;
  const n = Math.round(hoursWeek * 10) / 10;
  return `${n}h/semaine`;
}

function buildBusinessProfilePatchFromFacts(facts: Array<{ key: string; value: unknown }>) {
  const patch: Record<string, any> = {};

  const setIf = (k: string, v: any) => {
    if (v === null || v === undefined) return;
    if (typeof v === "string" && !v.trim()) return;
    patch[k] = v;
  };

  const getStr = (v: any, max = 220) => {
    const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
    if (!s) return "";
    return s.length > max ? s.slice(0, max) : s;
  };

  for (const f of facts) {
    const key = normalizeKey(f.key);
    const value = f.value;

    // champs UI existants (déjà)
    if (key === "primary_activity" && isNonEmptyString(value)) setIf("primary_activity", String(value).slice(0, 200));
    if (key === "traffic_source_today" && isNonEmptyString(value)) setIf("traffic_source_today", String(value));
    if (key === "has_offers" && typeof value === "boolean") setIf("has_offers", value);
    if (key === "conversion_status" && isNonEmptyString(value)) setIf("conversion_status", String(value));

    // ✅ champs récap (business_profiles_rows csv)
    if ((key === "main_topic" || key === "niche") && isNonEmptyString(value)) setIf("niche", getStr(value, 140));
    if ((key === "mission" || key === "target_audience_short") && isNonEmptyString(value)) setIf("mission", getStr(value, 260));
    if ((key === "main_goal" || key === "main_goal_90_days" || key === "objective_90_days") && isNonEmptyString(value))
      setIf("main_goal", getStr(value, 240));
    if (key === "revenue_goal_monthly" && (typeof value === "number" || isNonEmptyString(value))) {
      const n = typeof value === "number" ? value : Number(String(value).replace(/\s/g, "").replace(",", "."));
      if (Number.isFinite(n)) setIf("revenue_goal_monthly", n);
    }
    if (key === "time_available_hours_week" && typeof value === "number") {
      const s = formatTimeAvailable(value);
      if (s) setIf("time_available", s);
    }
    if ((key === "time_available" || key === "weekly_hours") && isNonEmptyString(value)) {
      setIf("time_available", getStr(value, 80));
    }
    if ((key === "tone_preference_hint" || key === "preferred_tone") && isNonEmptyString(value)) setIf("preferred_tone", getStr(value, 140));
    if ((key === "content_channels_priority" || key === "content_preference" || key === "preferred_content_type") && value) {
      if (Array.isArray(value)) {
        const joined = value
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter(Boolean)
          .slice(0, 8)
          .join(", ");
        if (joined) setIf("content_preference", joined);
      } else if (isNonEmptyString(value)) {
        setIf("content_preference", getStr(value, 180));
      }
    }
    if ((key === "success_metric" || key === "success_definition") && isNonEmptyString(value)) setIf("success_definition", getStr(value, 240));
    if (key === "success_metrics" && value && typeof value === "object") {
      setIf("success_definition", JSON.stringify(value).slice(0, 240));
    }

    // auditables
    if ((key === "business_stage" || key === "business_maturity") && isNonEmptyString(value)) setIf("business_maturity", getStr(value, 60));
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

    // EARLY_FINISH_CONFIRM: si l'assistant vient d'indiquer "tu peux passer à la suite"
    // et que l'utilisateur répond juste "ok" / "oui" => on déclenche immédiatement la fin (UX premium).
    try {
      const prevWasFinished = messageLooksFinished(String(prevAssistant ?? ""));
      if (prevWasFinished && isUserConfirmingToFinish(userMsg)) {
        const finishMessage =
          locale === "fr"
            ? "Parfait ✅ Je te montre le récap et je lance la création de ta stratégie."
            : "Perfect ✅ I’ll show you the recap and start building your strategy.";

        const { error: insertAssistErr } = await supabase.from("onboarding_messages").insert({
          session_id: sessionId,
          role: "assistant",
          content: finishMessage,
          extracted: { facts: [], finish_confirm: true },
          created_at: new Date().toISOString(),
        });

        if (insertAssistErr) return NextResponse.json({ error: insertAssistErr.message }, { status: 400 });

        return NextResponse.json({
          sessionId,
          message: finishMessage,
          appliedFacts,
          shouldFinish: true,
        });
      }
    } catch {
      // ignore
    }

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

    // Auto-extract sales
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

    // Auto-extract acquisition
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

    // Auto-extract success_metrics
    try {
      if (typeof knownFacts["success_metrics"] === "undefined" || knownFacts["success_metrics"] === null) {
        const metrics = extractSuccessMetrics(userMsg);
        if (metrics) {
          await upsertOneFact({ key: "success_metrics", value: metrics, confidence: "high", source: "server_extract_success" });
        }
      }
    } catch {
      // ignore
    }

    // ✅ Auto-extract revenue_goal_monthly (pour récap)
    try {
      if (typeof knownFacts["revenue_goal_monthly"] === "undefined" || knownFacts["revenue_goal_monthly"] === null) {
        const rev = extractRevenueGoalMonthly(userMsg);
        if (typeof rev === "number" && Number.isFinite(rev)) {
          await upsertOneFact({ key: "revenue_goal_monthly", value: rev, confidence: "high", source: "server_extract_recap" });
        }
      }
    } catch {
      // ignore
    }

    // ✅ Auto-extract time_available_hours_week (pour récap)
    try {
      if (typeof knownFacts["time_available_hours_week"] === "undefined" || knownFacts["time_available_hours_week"] === null) {
        const hrs = extractTimeAvailableHoursWeek(userMsg);
        if (typeof hrs === "number" && Number.isFinite(hrs)) {
          await upsertOneFact({ key: "time_available_hours_week", value: hrs, confidence: "high", source: "server_extract_recap" });
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

    // Garde-fou : interdit le finish si activities_list>=2 et primary_activity manquante
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
    // - cas normal: ready => finish
    // - cas UX premium: si message indique fin => finish
    try {
      const ready = isReadyToFinish(knownFacts);

      if (ready) shouldFinish = true;
      if (messageLooksFinished(out.message)) shouldFinish = true;
      if (Boolean(out.should_finish ?? out.done ?? false)) shouldFinish = true;
    } catch {
      // ignore
    }

    // Patch business_profiles (best-effort) : on pousse surtout les champs récap
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
