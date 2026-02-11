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
//
// ✅ HARDENING (prod, durable) :
// - Fix FK "onboarding_sessions_user_id_fkey" : on bootstrap les rows parent (profiles + business_profiles)
// - Writes via service_role (supabaseAdmin) pour éviter RLS/politiques trop strictes et edge cases
// - Reads restent via supabase server client (cookies) pour respecter l'auth/ctx

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai } from "@/lib/openaiClient";
import { buildOnboardingClarifierSystemPrompt } from "@/lib/prompts/onboarding/system";
import { getUserContextBundle, userContextToPromptText } from "@/lib/onboarding/userContext";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

function isMissingTableOrColumnError(message?: string | null) {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    (m.includes("relation") && m.includes("does not exist")) ||
    (m.includes("column") && (m.includes("does not exist") || m.includes("unknown"))) ||
    m.includes("schema cache") ||
    m.includes("pgrst")
  );
}

/**
 * ✅ Fix durable FK onboarding_sessions_user_id_fkey
 * Certains comptes n'ont pas encore les rows parents attendues par tes contraintes FK
 * (souvent profiles.id=userId, et parfois business_profiles.user_id=userId)
 * => on force leur existence AVANT toute écriture dans onboarding_sessions/messages/facts.
 *
 * Best-effort : si schéma différent, on n'empêche jamais l'onboarding d'avancer.
 */
async function ensureUserBootstrap(params: {
  userId: string;
  userEmail?: string | null;
  projectId?: string | null;
}) {
  const { userId, userEmail, projectId } = params;
  const now = new Date().toISOString();

  // profiles (parent FK le plus probable)
  try {
    await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        email: userEmail ?? null,
        updated_at: now,
        created_at: now,
      } as any,
      { onConflict: "id" } as any,
    );
  } catch (e) {
    // best-effort
    console.warn("[OnboardingChatV2] profiles bootstrap failed (non-blocking):", e);
  }

  // business_profiles (source de vérité UI + onboarding_version souvent NOT NULL)
  try {
    const bpRow: Record<string, any> = {
      user_id: userId,
      onboarding_completed: false,
      onboarding_version: "v2",
      updated_at: now,
      created_at: now,
    };
    if (projectId) bpRow.project_id = projectId;

    // Insert-only : si ça existe déjà, on ignore
    const ins = await supabaseAdmin.from("business_profiles").insert(bpRow as any);
    if (ins?.error) {
      const msg = String(ins.error.message ?? "").toLowerCase();
      const isDuplicate =
        msg.includes("duplicate") ||
        msg.includes("already exists") ||
        msg.includes("unique constraint") ||
        msg.includes("violates unique constraint");

      if (!isDuplicate && !isMissingTableOrColumnError(ins.error.message)) {
        console.warn("[OnboardingChatV2] business_profiles bootstrap insert failed (ignored):", ins.error);
      }
    }
  } catch (e) {
    // best-effort
    console.warn("[OnboardingChatV2] business_profiles bootstrap failed (non-blocking):", e);
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

  if (k === "offers_list") {
    if (Array.isArray(value)) return value.slice(0, 50);
    return value;
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
    t.includes("j'ai tout") ||
    t.includes("j\u2019ai tout") ||
    t.includes("tout ce qu'il me faut") ||
    t.includes("tout ce qu\u2019il me faut") ||
    t.includes("tout est clair") ||
    t.includes("tu peux passer à la suite") ||
    t.includes("passer à la suite") ||
    t.includes("passer a la suite") ||
    t.includes("tu peux continuer") ||
    t.includes("tu peux passer la suite") ||
    t.includes("je te montre le récap") ||
    t.includes("je te montre le recap") ||
    t.includes("montre le récap") ||
    t.includes("montre le recap") ||
    t.includes("je lance la création") ||
    t.includes("je lance la creation")
  );
}

function isReadyToFinish(knownFacts: Record<string, unknown>): boolean {
  try {
    // Guard: if user listed multiple activities but hasn't picked a primary one yet, don't finish
    const activities = Array.isArray((knownFacts as any)["activities_list"])
      ? ((knownFacts as any)["activities_list"] as any[]).filter((x) => typeof x === "string")
      : [];
    const primary =
      typeof (knownFacts as any)["primary_activity"] === "string"
        ? String((knownFacts as any)["primary_activity"]).trim()
        : "";

    if (activities.length >= 2 && !primary) return false;

    // Essential: need all 4 — main_topic + business_model + primary_focus + target_audience
    const hasTopic = hasNonEmptyFact(knownFacts, "main_topic") || hasNonEmptyFact(knownFacts, "primary_activity");
    const hasModel = hasNonEmptyFact(knownFacts, "business_model");
    const hasFocus = hasNonEmptyFact(knownFacts, "primary_focus");
    const hasAudience = hasNonEmptyFact(knownFacts, "target_audience_short");

    if (!(hasTopic && hasModel && hasFocus && hasAudience)) return false;

    // Important: need at least 3 out of these 7 to have a solid profile
    const importantKeys = [
      "revenue_goal_monthly", "has_offers", "conversion_status",
      "content_channels_priority", "time_available_hours_week",
      "tone_preference_hint", "biggest_blocker",
    ];
    const importantCount = importantKeys.filter((k) => hasNonEmptyFact(knownFacts, k)).length;

    return importantCount >= 3;
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

function inferConversionStatusFromAnswer(
  answer: string,
): "selling_well" | "inconsistent" | "not_selling" | "unknown" {
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
  // Strip punctuation and extra whitespace so "Super !" matches "super"
  const t = (text || "").trim().toLowerCase().replace(/[!?.,;:…\s]+$/g, "").trim();
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
    t === "oui" ||
    t === "on y va" ||
    t === "allons-y" ||
    t === "let's go" ||
    t === "top" ||
    t === "nickel" ||
    t === "c'est parti" ||
    t === "cest parti"
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

  if (t.includes("bouche") || t.includes("oreille") || t.includes("recommand") || t.includes("referr"))
    push("word_of_mouth");
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
  if (t.includes("parten") || t.includes("collab") || t.includes("affiliation") || t.includes("affiliate"))
    push("partnerships");

  return out.slice(0, 8);
}

function inferTrafficSourceTodayFromChannels(
  channels: string[],
): "organic_social" | "seo" | "ads" | "partnerships" | "affiliate_platforms" | "none" {
  const set = new Set(channels);
  if (set.has("ads")) return "ads";
  if (set.has("seo")) return "seo";
  if (set.has("partnerships")) return "partnerships";
  if (
    set.has("social") ||
    set.has("word_of_mouth") ||
    set.has("youtube") ||
    set.has("blog") ||
    set.has("email")
  )
    return "organic_social";
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

function extractContentPreferences(answer: string): string[] {
  const t = (answer || "").toLowerCase();
  const out: string[] = [];

  const push = (v: string) => {
    if (!out.includes(v)) out.push(v);
  };

  if (t.includes("article") || t.includes("blog")) push("articles");
  if (t.includes("vidéo") || t.includes("video") || t.includes("youtube")) push("vidéo");
  if (t.includes("placement") || t.includes("lien")) push("placement de liens");
  if (t.includes("affiliation") || t.includes("affilié")) push("affiliation");
  if (t.includes("email") || t.includes("newsletter")) push("email");
  if (t.includes("post") || t.includes("réseaux") || t.includes("social")) push("réseaux sociaux");
  if (t.includes("podcast")) push("podcast");
  if (t.includes("comparatif") || t.includes("test") || t.includes("review")) push("comparatifs / tests");

  return out.slice(0, 8);
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

/**
 * Build a natural prose recap from known facts.
 * Displayed in the onboarding recap dialog instead of a table with empty rows.
 */
function buildRecapProse(knownFacts: Record<string, unknown>, firstName?: string | null): string {
  const parts: string[] = [];

  const name = typeof firstName === "string" && firstName.trim() ? firstName.trim() : null;
  parts.push(
    name ? `Voici ce que j'ai retenu de notre échange, ${name} :` : "Voici ce que j'ai retenu de notre échange :",
  );

  // Activity / Niche
  const primary =
    typeof knownFacts["primary_activity"] === "string" ? String(knownFacts["primary_activity"]).trim() : "";
  const niche =
    typeof knownFacts["main_topic"] === "string"
      ? String(knownFacts["main_topic"]).trim()
      : typeof knownFacts["niche"] === "string"
        ? String(knownFacts["niche"]).trim()
        : "";
  if (primary) {
    parts.push(
      `Tu te concentres sur : ${primary}${
        niche && niche.toLowerCase() !== primary.toLowerCase() ? ` (niche : ${niche})` : ""
      }.`,
    );
  } else if (niche) {
    parts.push(`Ton domaine : ${niche}.`);
  }

  // Business model
  const model = typeof knownFacts["business_model"] === "string" ? String(knownFacts["business_model"]).trim() : "";
  if (model) {
    const modelLabels: Record<string, string> = {
      offers: "vente de produits / services",
      affiliate: "affiliation",
      service: "prestation de services",
      freelancing: "freelancing",
      content_creator: "création de contenu",
      mixed: "modèle mixte",
    };
    parts.push(`Modèle économique : ${modelLabels[model] || model}.`);
  }

  // Target audience
  const audience =
    typeof knownFacts["target_audience_short"] === "string"
      ? String(knownFacts["target_audience_short"]).trim()
      : "";
  if (audience) parts.push(`Tu t'adresses à : ${audience}.`);

  // Revenue goal
  const rev = knownFacts["revenue_goal_monthly"];
  if (typeof rev === "number" && Number.isFinite(rev)) {
    parts.push(`Objectif de revenu mensuel : ${rev.toLocaleString("fr-FR")}€.`);
  }

  // Time available
  const timeHrs = knownFacts["time_available_hours_week"];
  const timeStr = typeof knownFacts["time_available"] === "string" ? String(knownFacts["time_available"]).trim() : "";
  if (typeof timeHrs === "number" && Number.isFinite(timeHrs)) {
    parts.push(`Temps disponible : environ ${Math.round(timeHrs)}h par semaine.`);
  } else if (timeStr) {
    parts.push(`Temps disponible : ${timeStr}.`);
  }

  // Conversion status
  const conv =
    typeof knownFacts["conversion_status"] === "string" ? String(knownFacts["conversion_status"]).trim() : "";
  if (conv) {
    const convLabels: Record<string, string> = {
      selling_well: "Tu as déjà des ventes régulières",
      inconsistent: "Tu commences à vendre mais ce n'est pas encore régulier",
      not_selling: "Tu n'as pas encore réalisé de ventes",
    };
    if (convLabels[conv]) parts.push(`${convLabels[conv]}.`);
  }

  // Offers info
  const hasOffers = knownFacts["has_offers"];
  const offersCount = knownFacts["offers_count"];
  if (hasOffers === true && typeof offersCount === "number") {
    parts.push(`Tu as ${offersCount} offre${offersCount > 1 ? "s" : ""} en place.`);
  } else if (hasOffers === false) {
    parts.push("Tu n'as pas encore d'offre structurée.");
  }

  // Channels
  const channels = knownFacts["acquisition_channels"];
  if (Array.isArray(channels) && channels.length > 0) {
    const labels: Record<string, string> = {
      social: "réseaux sociaux",
      youtube: "YouTube",
      blog: "blog",
      seo: "SEO",
      email: "email / newsletter",
      ads: "publicité payante",
      partnerships: "partenariats",
      word_of_mouth: "bouche-à-oreille",
    };
    const named = channels.map((c) => labels[String(c)] || String(c));
    parts.push(`Canaux d'acquisition : ${named.join(", ")}.`);
  }

  // Content preferences
  const contentPref = knownFacts["content_channels_priority"];
  if (Array.isArray(contentPref) && contentPref.length > 0) {
    parts.push(`Contenus privilégiés : ${contentPref.join(", ")}.`);
  }

  // Tone
  const tone =
    typeof knownFacts["tone_preference_hint"] === "string"
      ? String(knownFacts["tone_preference_hint"]).trim()
      : typeof knownFacts["preferred_tone"] === "string"
        ? String(knownFacts["preferred_tone"]).trim()
        : "";
  if (tone) parts.push(`Ton préféré : ${tone}.`);

  // Biggest blocker
  const blocker =
    typeof knownFacts["biggest_blocker"] === "string" ? String(knownFacts["biggest_blocker"]).trim() :
    typeof knownFacts["biggest_challenge"] === "string" ? String(knownFacts["biggest_challenge"]).trim() : "";
  if (blocker) parts.push(`Plus gros blocage : ${blocker}.`);

  // Primary focus
  const focus = typeof knownFacts["primary_focus"] === "string" ? String(knownFacts["primary_focus"]).trim() : "";
  if (focus) {
    const focusLabels: Record<string, string> = {
      sales: "Générer des ventes",
      visibility: "Gagner en visibilité",
      clarity: "Clarifier ton positionnement",
      systems: "Mettre en place des systèmes",
      offer_improvement: "Améliorer tes offres",
      traffic: "Générer du trafic",
    };
    parts.push(`Priorité : ${focusLabels[focus] || focus}.`);
  }

  if (parts.length <= 1) {
    parts.push("Je n'ai pas encore beaucoup d'informations, mais on va pouvoir construire ta stratégie avec ce qu'on a.");
  }

  parts.push("");
  parts.push("Tu pourras toujours ajuster ces informations dans tes réglages.");

  return parts.join("\n");
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

    // champs existants dans business_profiles
    // primary_activity → niche (pas de colonne primary_activity dans DB)
    if (key === "primary_activity" && isNonEmptyString(value) && !patch["niche"]) setIf("niche", getStr(value, 140));
    // traffic_source_today, conversion_status → pas de colonne dans DB, on les garde dans onboarding_facts uniquement
    if (key === "has_offers" && typeof value === "boolean") setIf("has_offers", value);

    // ✅ champs récap (business_profiles columns)
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
    if ((key === "tone_preference_hint" || key === "preferred_tone") && isNonEmptyString(value))
      setIf("preferred_tone", getStr(value, 140));
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
    // success_metric → pas de colonne success_definition dans DB, stocké dans onboarding_facts uniquement

    // offers_list → business_profiles.offers + offer_price + offer_sales_page_links
    if (key === "offers_list" && Array.isArray(value)) {
      const offersArr = value
        .filter((o) => o && typeof o === "object")
        .map((o: any) => ({
          name: typeof o.name === "string" ? o.name.trim().slice(0, 200) : "",
          price:
            typeof o.price === "string"
              ? o.price.trim().slice(0, 40)
              : typeof o.price === "number"
                ? String(o.price)
                : "",
          link: typeof o.link === "string" ? o.link.trim().slice(0, 400) : "",
          promise: typeof o.promise === "string" ? o.promise.trim().slice(0, 500) : "",
          description: typeof o.description === "string" ? o.description.trim().slice(0, 2000) : "",
          target: typeof o.target === "string" ? o.target.trim().slice(0, 500) : "",
          format: typeof o.format === "string" ? o.format.trim().slice(0, 200) : "",
        }))
        .filter((o) => o.name);
      if (offersArr.length > 0) {
        setIf("offers", offersArr);
        // Also set offer_price from first offer with a price
        const firstPrice = offersArr.find((o) => o.price)?.price;
        if (firstPrice && !patch["offer_price"]) setIf("offer_price", firstPrice);
        // Also set offer_sales_page_links from links
        const links = offersArr.map((o) => o.link).filter(Boolean);
        if (links.length > 0 && !patch["offer_sales_page_links"]) setIf("offer_sales_page_links", links.join(", "));
      }
    }

    // auditables
    if ((key === "business_stage" || key === "business_maturity") && isNonEmptyString(value))
      setIf("business_maturity", getStr(value, 60));

    // ✅ biggest_blocker → biggest_blocker column
    if ((key === "biggest_blocker" || key === "biggest_challenge") && isNonEmptyString(value))
      setIf("biggest_blocker", getStr(value, 260));

    // ✅ main_goals → main_goals column (stored as JSON array text in DB, e.g. '["goal1","goal2"]')
    if (key === "main_goals" && value) {
      if (Array.isArray(value)) {
        const arr = value
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter(Boolean)
          .slice(0, 6);
        if (arr.length > 0) setIf("main_goals", JSON.stringify(arr));
      } else if (isNonEmptyString(value)) {
        // Single goal → wrap in array for consistency
        setIf("main_goals", JSON.stringify([String(value).trim()]));
      }
    }

    // ✅ audience sizes (int4 columns — only write numbers)
    if ((key === "audience_social" || key === "social_presence") && (typeof value === "number" || isNonEmptyString(value))) {
      const n = typeof value === "number" ? value : Number(String(value).replace(/[^\d]/g, ""));
      if (Number.isFinite(n) && n >= 0) setIf("audience_social", Math.round(n));
    }
    if ((key === "audience_email" || key === "email_list_size") && (typeof value === "number" || isNonEmptyString(value))) {
      const n = typeof value === "number" ? value : Number(String(value).replace(/[^\d]/g, ""));
      if (Number.isFinite(n) && n >= 0) setIf("audience_email", Math.round(n));
    }

    // ✅ social_links (stored as JSON array text in DB, e.g. '[{"platform":"LinkedIn","url":"..."}]')
    if (key === "social_links" && value) {
      if (Array.isArray(value)) {
        // Already an array of objects → stringify
        setIf("social_links", JSON.stringify(value).slice(0, 1000));
      } else if (typeof value === "string") {
        // If it's already JSON, keep as-is; otherwise wrap in array
        const trimmed = value.trim();
        if (trimmed.startsWith("[")) {
          setIf("social_links", trimmed.slice(0, 1000));
        } else {
          setIf("social_links", JSON.stringify([{ platform: "other", url: trimmed }]));
        }
      }
    }

    // ✅ specific social URLs → dedicated columns
    if (key === "linkedin_url" && isNonEmptyString(value)) setIf("linkedin_url", getStr(value, 400));
    if (key === "instagram_url" && isNonEmptyString(value)) setIf("instagram_url", getStr(value, 400));
    if (key === "youtube_url" && isNonEmptyString(value)) setIf("youtube_url", getStr(value, 400));
    if (key === "website_url" && isNonEmptyString(value)) setIf("website_url", getStr(value, 400));
  }

  return patch;
}

async function updateThenInsertBusinessProfile(
  supabase: any,
  userId: string,
  patch: Record<string, any>,
  projectId?: string | null,
): Promise<void> {
  if (!patch || Object.keys(patch).length === 0) return;

  const row: Record<string, any> = {
    user_id: userId,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  if (projectId) row.project_id = projectId;

  let updQuery = supabase.from("business_profiles").update(row).eq("user_id", userId);
  if (projectId) updQuery = updQuery.eq("project_id", projectId);
  const upd = await updQuery.select("id");
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
    const userEmail = auth?.user?.email;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const projectId = await getActiveProjectId(supabase, userId);

    // ✅ Writes via service_role (durable, bypass RLS)
    const supabaseWrite = supabaseAdmin;

    // 0) Ensure profiles & business_profiles rows exist (FK guard)
    await ensureUserBootstrap({ userId, userEmail, projectId });

    // (On garde l’ancien code en best-effort, mais via supabaseWrite pour éviter RLS)
    try {
      const { data: profileExists } = await supabaseWrite.from("profiles").select("id").eq("id", userId).maybeSingle();

      if (!profileExists) {
        await supabaseWrite.from("profiles").insert({
          id: userId,
          email: userEmail ?? null,
          updated_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      // best-effort — if profiles table doesn't have the expected schema, ignore
      console.warn("[OnboardingChatV2] profiles ensure failed (non-blocking):", e);
    }

    try {
      let bpQuery = supabaseWrite.from("business_profiles").select("user_id").eq("user_id", userId);
      if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
      const { data: bpExists } = await bpQuery.maybeSingle();

      if (!bpExists) {
        const bpRow: Record<string, any> = {
          user_id: userId,
          onboarding_completed: false,
          onboarding_version: "v2",
          updated_at: new Date().toISOString(),
        };
        if (projectId) bpRow.project_id = projectId;
        await supabaseWrite.from("business_profiles").insert(bpRow);
      }
    } catch (e) {
      console.warn("[OnboardingChatV2] business_profiles ensure failed (non-blocking):", e);
    }

    // 1) find or create session
    let sessionId = body.sessionId ?? null;

    if (!sessionId) {
      const sessionRow: Record<string, any> = {
        user_id: userId,
        onboarding_version: "v2",
        status: "active",
        started_at: new Date().toISOString(),
        meta: {},
      };
      if (projectId) sessionRow.project_id = projectId;

      const { data: created, error } = await supabaseWrite.from("onboarding_sessions").insert(sessionRow).select("id").maybeSingle();

      if (error || !created?.id) {
        return NextResponse.json({ error: error?.message ?? "Failed to create session" }, { status: 400 });
      }
      sessionId = String(created.id);
    } else {
      let sessionQuery = supabaseWrite.from("onboarding_sessions").select("id,user_id,status").eq("id", sessionId);
      if (projectId) sessionQuery = sessionQuery.eq("project_id", projectId);
      const { data: s, error } = await sessionQuery.maybeSingle();
      if (error || !s?.id) return NextResponse.json({ error: "Invalid session" }, { status: 400 });
      if (String(s.user_id) !== String(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2) store user message
    const { error: insertMsgErr } = await supabaseWrite.from("onboarding_messages").insert({
      session_id: sessionId,
      role: "user",
      content: body.message,
      extracted: {},
      created_at: new Date().toISOString(),
    });
    if (insertMsgErr) return NextResponse.json({ error: insertMsgErr.message }, { status: 400 });

    // 3) fetch existing context (reads: via supabase)
    const bpSelect = supabase.from("business_profiles").select("*").eq("user_id", userId);
    if (projectId) bpSelect.eq("project_id", projectId);

    const factsSelect = supabaseWrite.from("onboarding_facts").select("key,value,confidence,updated_at").eq("user_id", userId);
    if (projectId) factsSelect.eq("project_id", projectId);

    const [{ data: bp }, { data: facts }, { data: history }] = await Promise.all([
      bpSelect.maybeSingle(),
      factsSelect,
      supabaseWrite
        .from("onboarding_messages")
        .select("role,content,created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(60),
    ]);

    const knownFacts: Record<string, unknown> = {};
    for (const f of facts ?? []) {
      if (!f?.key) continue;
      const k = normalizeKey(String((f as any).key));
      knownFacts[k] = normalizeFactValue(k, (f as any).value);
    }

    // --------- helper: upsert fact (RPC then fallback) ----------
    const appliedFacts: Array<{ key: string; confidence: string }> = [];

    async function upsertOneFact(fact: {
      key: string;
      value: unknown;
      confidence: "high" | "medium" | "low";
      source: string;
    }): Promise<boolean> {
      const key = normalizeKey(fact.key).slice(0, 80);
      const value = normalizeFactValue(key, fact.value);

      // 1) RPC si dispo
      try {
        const rpcParams: Record<string, any> = {
          p_user_id: userId,
          p_key: key,
          p_value: value,
          p_confidence: fact.confidence,
          p_source: fact.source,
        };
        if (projectId) rpcParams.p_project_id = projectId;

        const rpc = await supabaseWrite.rpc("upsert_onboarding_fact", rpcParams);
        if (!rpc.error) {
          appliedFacts.push({ key, confidence: fact.confidence });
          knownFacts[key] = value;
          return true;
        }
      } catch {
        // ignore
      }

      // 2) Fallback upsert table
      try {
        const factRow: Record<string, any> = {
          user_id: userId,
          key,
          value,
          confidence: fact.confidence,
          source: fact.source,
          updated_at: new Date().toISOString(),
        };
        if (projectId) factRow.project_id = projectId;

        // onConflict varie selon schéma => on essaye large puis on retombe sur "user_id,key"
        let up = await supabaseWrite.from("onboarding_facts").upsert(factRow, { onConflict: "user_id,project_id,key" } as any);
        if (up?.error && isMissingTableOrColumnError(up.error.message)) {
          up = await supabaseWrite.from("onboarding_facts").upsert(factRow, { onConflict: "user_id,key" } as any);
        }
        if (!up?.error) {
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

    // Count exchanges early — needed for all finish guards
    const exchangeCount = Math.floor((hist.length + 1) / 2);

    const userMsg = String(body.message || "");

    // EARLY_FINISH_CONFIRM: si l'assistant vient d'indiquer "tu peux passer à la suite"
    // et que l'utilisateur répond juste "ok" / "oui" => on déclenche immédiatement la fin.
    // Guarded by MIN_EXCHANGES (3) to prevent premature finish.
    try {
      const MIN_EXCHANGES_EARLY = 5;
      const prevWasFinished = messageLooksFinished(String(prevAssistant ?? ""));
      if (prevWasFinished && isUserConfirmingToFinish(userMsg) && exchangeCount >= MIN_EXCHANGES_EARLY) {
        const finishMessage =
          locale === "fr"
            ? "Parfait ✅ Je te montre le récap et je lance la création de ta stratégie."
            : "Perfect ✅ I’ll show you the recap and start building your strategy.";

        const { error: insertAssistErr } = await supabaseWrite.from("onboarding_messages").insert({
          session_id: sessionId,
          role: "assistant",
          content: finishMessage,
          extracted: { facts: [], finish_confirm: true },
          created_at: new Date().toISOString(),
        });

        if (insertAssistErr) return NextResponse.json({ error: insertAssistErr.message }, { status: 400 });

        const recapSummary = buildRecapProse(
          knownFacts,
          typeof (bp as any)?.first_name === "string" ? (bp as any).first_name : null,
        );

        return NextResponse.json({
          sessionId,
          message: finishMessage,
          appliedFacts,
          shouldFinish: true,
          recapSummary,
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
        await upsertOneFact({
          key: "activities_list",
          value: uniq.slice(0, 6),
          confidence: "low",
          source: "server_extract_activities",
        });
      }
    } catch {
      // ignore
    }

    // Auto-capture primary_activity si question explicite précédente + réponse simple
    try {
      const prevWasPrimary =
        typeof prevAssistant === "string" &&
        prevAssistant.toLowerCase().includes("laquelle") &&
        prevAssistant.toLowerCase().includes("prior");
      if (prevWasPrimary && !isNonEmptyString(knownFacts["primary_activity"])) {
        const candidate = userMsg.trim();
        if (candidate && candidate.length <= 120 && !candidate.includes("\n")) {
          await upsertOneFact({
            key: "primary_activity",
            value: candidate,
            confidence: "high",
            source: "server_extract_primary_activity",
          });
        }
      }
    } catch {
      // ignore
    }

    // Auto-extract sales
    try {
      if (
        !isNonEmptyString(knownFacts["conversion_status"]) &&
        (isSalesQuestion(prevAssistant) || looksFrustrated(userMsg))
      ) {
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
      if (
        !Array.isArray(knownFacts["acquisition_channels"]) &&
        (isAcquisitionQuestion(prevAssistant) || looksFrustrated(userMsg))
      ) {
        const channels = extractAcquisitionChannels(userMsg);
        if (channels.length > 0) {
          const ok = await upsertOneFact({
            key: "acquisition_channels",
            value: channels,
            confidence: "high",
            source: "server_extract_acquisition",
          });
          if (ok && !isNonEmptyString(knownFacts["traffic_source_today"])) {
            const traffic = inferTrafficSourceTodayFromChannels(channels);
            if (traffic !== "none") {
              await upsertOneFact({
                key: "traffic_source_today",
                value: traffic,
                confidence: "medium",
                source: "server_extract_acquisition",
              });
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

    // ✅ Auto-extract content_channels_priority (articles, placements, etc.)
    try {
      if (!Array.isArray(knownFacts["content_channels_priority"])) {
        const contentPrefs = extractContentPreferences(userMsg);
        if (contentPrefs.length > 0) {
          await upsertOneFact({ key: "content_channels_priority", value: contentPrefs, confidence: "high", source: "server_extract_content" });
        }
      }
    } catch {
      // ignore
    }

    // ✅ Auto-extract affiliate hints
    try {
      const t = userMsg.toLowerCase();
      if (!isNonEmptyString(knownFacts["business_model"]) && (t.includes("affili") || t.includes("amazon") || t.includes("programme") || t.includes("commission"))) {
        await upsertOneFact({ key: "business_model", value: "affiliate", confidence: "medium", source: "server_extract_affiliate" });
      }
      if (t.includes("amazon") && !hasNonEmptyFact(knownFacts, "affiliate_programs_known")) {
        await upsertOneFact({ key: "affiliate_programs_known", value: true, confidence: "high", source: "server_extract_affiliate" });
      }
    } catch {
      // ignore
    }

    // ✅ Auto-extract URLs (linkedin, instagram, youtube, website) + build social_links JSON
    try {
      const urlMatches = userMsg.match(/https?:\/\/[^\s,)]+/gi) ?? [];
      const socialLinksArr: Array<{ platform: string; url: string }> = [];
      for (const url of urlMatches) {
        const u = url.toLowerCase();
        if (u.includes("linkedin.com")) {
          if (!hasNonEmptyFact(knownFacts, "linkedin_url")) {
            await upsertOneFact({ key: "linkedin_url", value: url.trim(), confidence: "high", source: "server_extract_url" });
          }
          socialLinksArr.push({ platform: "LinkedIn", url: url.trim() });
        } else if (u.includes("instagram.com")) {
          if (!hasNonEmptyFact(knownFacts, "instagram_url")) {
            await upsertOneFact({ key: "instagram_url", value: url.trim(), confidence: "high", source: "server_extract_url" });
          }
          socialLinksArr.push({ platform: "Instagram", url: url.trim() });
        } else if (u.includes("youtube.com")) {
          if (!hasNonEmptyFact(knownFacts, "youtube_url")) {
            await upsertOneFact({ key: "youtube_url", value: url.trim(), confidence: "high", source: "server_extract_url" });
          }
          socialLinksArr.push({ platform: "YouTube", url: url.trim() });
        } else if (!u.includes("facebook") && !u.includes("twitter") && !u.includes("tiktok")) {
          if (!hasNonEmptyFact(knownFacts, "website_url")) {
            await upsertOneFact({ key: "website_url", value: url.trim(), confidence: "medium", source: "server_extract_url" });
          }
        }
      }
      // Also populate social_links fact (JSON array format matching DB schema)
      if (socialLinksArr.length > 0 && !hasNonEmptyFact(knownFacts, "social_links")) {
        await upsertOneFact({ key: "social_links", value: socialLinksArr, confidence: "high", source: "server_extract_url" });
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

    // ═══════════════════════════════════════════════════
    // EXCHANGE LIMITS — prevent premature finish AND infinite loops
    // ═══════════════════════════════════════════════════
    const MIN_EXCHANGES = 5;  // Never finish before the user has answered 5 questions
    const MAX_EXCHANGES = 10; // Force finish after 10 exchanges to prevent loops

    const collectedFactKeys = Object.keys(knownFacts).filter((k) => hasNonEmptyFact(knownFacts, k));

    // Determine which phase the AI should be in based on exchange count
    const missingEssentials = ["main_topic", "business_model", "primary_focus", "target_audience_short"]
      .filter((k) => !hasNonEmptyFact(knownFacts, k));
    const missingImportant = [
      "revenue_goal_monthly", "has_offers", "conversion_status",
      "content_channels_priority", "time_available_hours_week",
      "tone_preference_hint", "biggest_blocker",
    ].filter((k) => !hasNonEmptyFact(knownFacts, k));

    let phaseHint = "";
    if (exchangeCount <= 2) {
      phaseHint = "Tu es en PHASE 1 (comprendre le projet). Pose une question sur ce que fait l'utilisateur, son domaine, son business model, et à qui il s'adresse.";
    } else if (exchangeCount <= 4) {
      phaseHint = "Tu es en PHASE 2 (comprendre la situation). Pose une question sur ses ventes, ses offres, où il en est, son plus gros blocage actuel (biggest_blocker).";
    } else if (exchangeCount <= 6) {
      phaseHint = "Tu es en PHASE 3 (comprendre l'objectif et les préférences). Pose une question sur sa priorité, ses objectifs de revenu, le temps qu'il peut y consacrer.";
    } else if (exchangeCount <= 8) {
      phaseHint = "Tu es en PHASE 4 (ton, contenu, canaux). Pose une question sur : le ton qu'il préfère pour sa communication (tone_preference_hint), les types de contenu qui l'intéressent (content_channels_priority), ou ses canaux de trafic actuels. Si tu as déjà ces infos, mets should_finish=true.";
    } else {
      phaseHint = "Tu es en PHASE 5 (finalisation). Si il manque encore des facts importants, pose UNE dernière question. Sinon mets should_finish=true.";
    }

    const userPrompt = JSON.stringify(
      {
        instruction:
          "Extrais les facts de la dernière réponse. Reformule ce que tu as compris en 1 phrase, puis pose 1 NOUVELLE question (jamais déjà posée). " +
          "NE METS PAS done=true sauf si anti_loop_check te le demande explicitement.",
        phase: phaseHint,
        anti_loop_check:
          `Échange n°${exchangeCount}. ` +
          `Facts déjà collectés : [${collectedFactKeys.join(", ")}]. ` +
          `Facts essentiels manquants : [${missingEssentials.join(", ") || "aucun"}]. ` +
          `Facts importants manquants : [${missingImportant.join(", ") || "aucun"}]. ` +
          `NE POSE PAS de question sur les facts déjà collectés. ` +
          (exchangeCount >= 7 ? "Tu approches de la fin. Concentre-toi sur les facts manquants essentiels." : "") +
          (exchangeCount >= MAX_EXCHANGES ? " TERMINE MAINTENANT avec done=true et should_finish=true. Ne pose plus de question." : ""),
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
          source:
            typeof (f as any).source === "string" && (f as any).source.trim()
              ? (f as any).source.trim().slice(0, 80)
              : "onboarding_chat",
        };
      })
      .filter((f) => f.key && f.key.length > 0);

    for (const f of toUpsert) {
      await upsertOneFact({ key: f.key, value: f.value, confidence: f.confidence, source: f.source });
    }

    // ═══════════════════════════════════════════════════
    // FINISH DECISION — server is the single source of truth
    // ═══════════════════════════════════════════════════
    let shouldFinish = false;

    try {
      const ready = isReadyToFinish(knownFacts);

      if (exchangeCount >= MAX_EXCHANGES) {
        // Hard cap: force finish to prevent infinite loops regardless of facts
        shouldFinish = true;
      } else if (exchangeCount >= MIN_EXCHANGES && ready) {
        // After minimum exchanges: finish only if we have all essentials + enough important facts
        shouldFinish = true;
      } else if (exchangeCount >= MIN_EXCHANGES && messageLooksFinished(out.message)) {
        // Safety valve: if the AI itself says "Je te montre le récap" / "J'ai tout ce qu'il me faut"
        // but isReadyToFinish() is false (e.g. some facts failed to save), force finish
        // to avoid infinite loop where the AI keeps saying "here's the recap" forever.
        shouldFinish = true;
      }
      // Before MIN_EXCHANGES: never finish, regardless of AI or facts
    } catch {
      // ignore — fail-open, don't finish on error
    }

    // Patch business_profiles (best-effort) : on pousse surtout les champs récap
    try {
      const patch = buildBusinessProfilePatchFromFacts(Object.entries(knownFacts).map(([key, value]) => ({ key, value })));
      if (Object.keys(patch).length > 0) {
        await updateThenInsertBusinessProfile(supabaseWrite, userId, patch, projectId);
      }
    } catch {
      // ignore
    }

    // 5) store assistant message
    const { error: insertAssistErr } = await supabaseWrite.from("onboarding_messages").insert({
      session_id: sessionId,
      role: "assistant",
      content: out.message,
      extracted: { facts: toUpsert },
      created_at: new Date().toISOString(),
    });

    if (insertAssistErr) return NextResponse.json({ error: insertAssistErr.message }, { status: 400 });

    // Compute progress for the UI (0-100)
    const essentialKeys = ["main_topic", "business_model", "primary_focus", "target_audience_short"];
    const importantKeys = ["revenue_goal_monthly", "has_offers", "conversion_status", "content_channels_priority", "time_available_hours_week", "tone_preference_hint", "biggest_blocker"];
    const essentialDone = essentialKeys.filter((k) => hasNonEmptyFact(knownFacts, k)).length;
    const importantDone = importantKeys.filter((k) => hasNonEmptyFact(knownFacts, k)).length;
    const progress = Math.min(
      100,
      Math.round((essentialDone / essentialKeys.length) * 70 + (importantDone / importantKeys.length) * 30),
    );

    const responsePayload: Record<string, any> = {
      sessionId,
      message: out.message,
      appliedFacts,
      shouldFinish,
      progress,
    };

    if (shouldFinish) {
      responsePayload.recapSummary = buildRecapProse(
        knownFacts,
        typeof (bp as any)?.first_name === "string" ? (bp as any).first_name : null,
      );
    }

    return NextResponse.json(responsePayload);
  } catch (err: any) {
    console.error("[OnboardingChatV2] error:", err);
    return NextResponse.json({ error: err?.message ?? "Bad Request" }, { status: 400 });
  }
}
