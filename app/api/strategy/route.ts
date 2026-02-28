// app/api/strategy/route.ts
// ✅ POST idempotent — Returns SSE stream with heartbeats to prevent proxy 504 timeouts.
// - Génère un "starter plan" (strategy_summary + goals) si manquant (best-effort)
// - Si user = (non affilié) ET (pas d'offre OU pas satisfait) : génère 3 offres si manquantes
// - Si offre choisie : génère stratégie complète (persona + plan 90j)
// - Si affilié OU (user a déjà une offre ET satisfait) : génère une stratégie complète sans inventer d'offres
//
// ⚠️ IMPORTANT : l'onboarding front appelle :
// 1) POST /api/strategy (génère offres + starter plan) [si applicable]
// 2) PATCH /api/strategy/offer-pyramid (sélection) [si offres]
// 3) POST /api/strategy (génère full strategy)

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type AnyRecord = Record<string, any>;

function isRecord(v: unknown): v is AnyRecord {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asRecord(v: unknown): AnyRecord | null {
  return isRecord(v) ? (v as AnyRecord) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function cleanString(v: unknown, maxLen = 240): string {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseMoneyFromText(raw: unknown): number | null {
  const s = cleanString(raw, 240);
  if (!s) return null;
  const compact = s.replace(/\s+/g, "").toLowerCase();

  const mK = compact.match(/(\d+(?:[\.,]\d+)?)k/);
  if (mK) {
    const n = Number(mK[1].replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 1000) : null;
  }

  const m = compact.match(/(\d+(?:[\.,]\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

// Map onboarding choice keys to human-readable revenue labels
const REVENUE_GOAL_KEY_MAP: Record<string, string> = {
  lt500: "moins de 500 €/mois",
  "500_1k": "500 – 1 000 €/mois",
  "1k_3k": "1 000 – 3 000 €/mois",
  "3k_5k": "3 000 – 5 000 €/mois",
  "5k_10k": "5 000 – 10 000 €/mois",
  gt10k: "plus de 10 000 €/mois",
};

function pickRevenueGoalLabel(businessProfile: AnyRecord): string {
  const raw =
    cleanString(businessProfile.target_monthly_revenue, 64) ||
    cleanString(businessProfile.revenue_goal, 240) ||
    cleanString(businessProfile.revenue_goal_monthly, 240) ||
    cleanString(businessProfile.revenueGoalMonthly, 240);

  // Convert legacy choice keys (e.g. "1k_3k") to readable labels
  const direct = raw ? (REVENUE_GOAL_KEY_MAP[raw] ?? raw) : "";

  if (direct) return direct;

  const mg = cleanString(businessProfile.main_goal, 240) || cleanString(businessProfile.mainGoal90Days, 240);
  if (mg) return mg;

  const goals = asArray(businessProfile.main_goals);
  if (goals.length) return cleanString(goals[0], 240);

  return "";
}

/**
 * -----------------------
 * Refusals / constraints helper
 * -----------------------
 * Maps raw onboarding refusal keys to human-readable FR labels
 * and builds an explicit prompt section so the AI NEVER ignores them.
 */
const REFUSAL_LABELS: Record<string, string> = {
  no_dm: "Pas de prospection en DM",
  no_video: "Pas de vidéos",
  no_articles: "Pas d'articles / blog",
  no_social: "Pas de réseaux sociaux",
  no_course: "Pas de création de formation",
  no_coaching: "Pas de coaching individuel",
  no_personal_branding: "Pas de personal branding (ne pas se montrer)",
};

function extractRefusals(businessProfile: AnyRecord): string[] {
  const da = asRecord(businessProfile.diagnostic_answers) ?? asRecord(businessProfile.diagnosticAnswers) ?? {};
  const raw = asArray(da.refusals ?? []);
  return raw
    .map((r) => {
      const key = cleanString(r, 60).toLowerCase();
      if (!key || key === "none" || key === "aucun" || key === "aucun refus") return "";
      return REFUSAL_LABELS[key] ?? key;
    })
    .filter(Boolean);
}

function buildRefusalsPromptSection(businessProfile: AnyRecord): string {
  const refusals = extractRefusals(businessProfile);
  if (refusals.length === 0) return "";
  return `
🚫 REFUS ABSOLUS DE L'UTILISATEUR (NON-NÉGOCIABLES) :
${refusals.map((r) => `- ${r}`).join("\n")}

⚠️ INSTRUCTION CRITIQUE : Tu ne dois JAMAIS proposer, recommander ou inclure dans la stratégie, les offres, ou le plan 90 jours quoi que ce soit qui corresponde aux refus ci-dessus. Si l'utilisateur a dit "Pas de création de formation", tu ne proposes AUCUNE formation. Si "Pas de réseaux sociaux", tu ne proposes AUCUNE action sur les réseaux. Ces refus sont ABSOLUS et PRIORITAIRES sur toute autre considération.
`;
}

/**
 * -----------------------
 * Credits helpers
 * -----------------------
 */
function isNoCreditsError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  // RPC retourne souvent "NO_CREDITS" ou message contenant "no credits"
  return msg.includes("no_credits") || msg.includes("no credits") || msg.includes("insufficient credits");
}

async function chargeCreditOrThrow(params: { userId: string; feature: string; meta?: AnyRecord }) {
  const { userId, feature, meta } = params;
  await ensureUserCredits(userId);
  const res = await consumeCredits(userId, 1, { feature, ...(meta ?? {}) });
  // selon ton impl, res peut être { success:false, error:"NO_CREDITS" } ou throw
  if (res && typeof res === "object") {
    const ok = (res as any).success;
    const err = cleanString((res as any).error, 120).toUpperCase();
    if (ok === false && err.includes("NO_CREDITS")) {
      const e = new Error("NO_CREDITS");
      throw e;
    }
  }
}

/**
 * -----------------------
 * Light retrieval helpers (resource_chunks)
 * -----------------------
 */
const STOPWORDS = new Set([
  "le","la","les","un","une","des","du","de","d","et","ou","mais","donc","or","ni","car",
  "à","a","au","aux","en","dans","sur","sous","pour","par","avec","sans","chez","vers",
  "ce","cet","cette","ces","ça","cela","c","qui","que","quoi","dont","où","je","tu","il","elle","on",
  "nous","vous","ils","elles","me","te","se","mon","ma","mes","ton","ta","tes","son","sa","ses",
  "notre","nos","votre","vos","leur","leurs",
  "the","a","an","and","or","but","so","because","to","of","in","on","for","with","without","at","by","from","as","is","are","was","were",
]);

function normalizeTextForSearch(v: unknown): string {
  const s = typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeywords(text: string, max = 28): string[] {
  const t = normalizeTextForSearch(text);
  if (!t) return [];
  const words = t.split(" ").map((w) => w.trim()).filter(Boolean);

  const counts = new Map<string, number>();
  for (const w0 of words) {
    const w = w0.replace(/^[-_/]+|[-_/]+$/g, "");
    if (!w) continue;
    if (w.length < 4) continue;
    if (STOPWORDS.has(w)) continue;
    if (/^\d+$/.test(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

function buildProfileSearchText(businessProfile: AnyRecord, selectedOffers?: AnyRecord | null): string {
  const dp = businessProfile.diagnostic_profile ?? businessProfile.diagnosticProfile ?? null;
  const ds = businessProfile.diagnostic_summary ?? businessProfile.diagnosticSummary ?? "";
  const base = {
    niche: businessProfile.niche ?? businessProfile.activity ?? businessProfile.business_type ?? "",
    mission: businessProfile.mission_statement ?? businessProfile.missionStatement ?? "",
    main_goal: businessProfile.main_goal_90_days ?? businessProfile.main_goal ?? businessProfile.mainGoal90Days ?? "",
    biggest_blocker: businessProfile.biggest_blocker ?? businessProfile.biggestBlocker ?? "",
    maturity: businessProfile.maturity ?? "",
    diagnostic_profile: dp,
    diagnostic_summary: ds,
    selected_pyramid: selectedOffers ?? null,
  };
  return JSON.stringify(base);
}

function pickTopResourceChunks(params: {
  chunks: AnyRecord[];
  businessProfile: AnyRecord;
  selectedOffers?: AnyRecord | null;
  maxChunks?: number;
}): AnyRecord[] {
  const { chunks, businessProfile, selectedOffers, maxChunks = 18 } = params;
  if (!Array.isArray(chunks) || chunks.length < 1) return [];

  const searchText = buildProfileSearchText(businessProfile, selectedOffers);
  const keywords = extractKeywords(searchText, 30);
  const kwSet = new Set(keywords);

  const scored = chunks
    .map((c, idx) => {
      const rec = asRecord(c) ?? {};
      const raw = rec.content ?? rec.text ?? rec.chunk ?? rec.body ?? rec.excerpt ?? rec.markdown ?? "";
      const text = normalizeTextForSearch(cleanString(raw, 8000));
      let score = 0;

      for (const kw of kwSet) if (kw && text.includes(kw)) score += 2;

      const tags = asArray(rec.tags ?? rec.keywords ?? []).map((x) => normalizeTextForSearch(cleanString(x, 40)));
      for (const t of tags) if (kwSet.has(t)) score += 2;

      const updated = typeof rec.updated_at === "string" ? Date.parse(rec.updated_at) : NaN;
      if (Number.isFinite(updated)) {
        const ageDays = (Date.now() - updated) / (1000 * 60 * 60 * 24);
        if (ageDays >= 0 && ageDays < 365) score += 1;
      }

      return { idx, score, rec, raw };
    })
    .sort((a, b) => b.score - a.score);

  return scored
    .filter((x) => x.score > 0)
    .slice(0, maxChunks)
    .map((x) => {
      const r = x.rec;
      const raw = r.content ?? r.text ?? r.chunk ?? r.body ?? r.excerpt ?? r.markdown ?? x.raw ?? "";
      return {
        id: cleanString(r.id, 80) || String(x.idx),
        resource_id: cleanString(r.resource_id ?? r.resourceId, 80),
        title: cleanString(r.title ?? r.heading ?? r.name ?? "", 140),
        tags: asArray(r.tags ?? r.keywords ?? [])
          .map((t) => cleanString(t, 48))
          .filter(Boolean)
          .slice(0, 8),
        content: cleanString(raw, 1800),
      };
    });
}

function summarizeResourcesForPrompt(resources: unknown[], max = 12): AnyRecord[] {
  const list = Array.isArray(resources) ? resources : [];
  return list.slice(0, max).map((r) => {
    const rec = asRecord(r) ?? {};
    return {
      id: cleanString(rec.id, 80),
      title: cleanString(rec.title ?? rec.name, 180),
      type: cleanString(rec.type ?? rec.category, 48),
      tags: asArray(rec.tags ?? rec.keywords ?? [])
        .map((x) => cleanString(x, 48))
        .filter(Boolean)
        .slice(0, 10),
      summary: cleanString(rec.summary ?? rec.description ?? rec.excerpt, 320),
      url: cleanString(rec.url ?? rec.link, 220),
    };
  });
}

/**
 * -----------------------
 * DB best-effort helpers
 * -----------------------
 */
async function persistStrategyRow(params: {
  supabase: any;
  userId: string;
  businessProfile: AnyRecord;
  planJson: AnyRecord;
  projectId?: string | null;
}): Promise<void> {
  const { supabase, userId, businessProfile, planJson, projectId } = params;

  try {
    const businessProfileId = cleanString(businessProfile.id, 80) || null;
    const horizonDays = toNumber(planJson.horizon_days) ?? toNumber(planJson.horizonDays) ?? 90;
    const targetMonthlyRev =
      toNumber(planJson.target_monthly_rev) ??
      toNumber(planJson.target_monthly_revenue) ??
      parseMoneyFromText(planJson.revenue_goal) ??
      parseMoneyFromText(planJson.goal_revenue) ??
      parseMoneyFromText(planJson.main_goal);

    const title =
      cleanString(planJson.title ?? planJson.summary ?? planJson.strategy_summary ?? "Ma stratégie", 180) || "Ma stratégie";

    const payload: AnyRecord = {
      user_id: userId,
      ...(projectId ? { project_id: projectId } : {}),
      ...(businessProfileId ? { business_profile_id: businessProfileId } : {}),
      title,
      horizon_days: horizonDays,
      ...(targetMonthlyRev !== null ? { target_monthly_rev: targetMonthlyRev } : {}),
      updated_at: new Date().toISOString(),
    };

    let upsertQuery = supabase.from("strategies").upsert(payload, { onConflict: "user_id" }).select("id");
    const upsertRes = await upsertQuery.maybeSingle();
    if (upsertRes?.error) {
      const insRes = await supabase.from("strategies").insert(payload).select("id").maybeSingle();
      if (insRes?.error) console.error("persistStrategyRow failed:", insRes.error);
    }
  } catch (e) {
    console.error("persistStrategyRow unexpected error:", e);
  }
}

async function getOrCreateStrategyIdBestEffort(params: {
  supabase: any;
  userId: string;
  businessProfile: AnyRecord;
  planJson: AnyRecord;
  projectId?: string | null;
}): Promise<string | null> {
  const { supabase, userId, businessProfile, planJson, projectId } = params;

  try {
    const businessProfileId = cleanString(businessProfile.id, 80) || null;
    const horizonDays = toNumber(planJson.horizon_days) ?? toNumber(planJson.horizonDays) ?? 90;

    const targetMonthlyRev =
      toNumber(planJson.target_monthly_rev) ??
      toNumber(planJson.target_monthly_revenue) ??
      parseMoneyFromText(planJson.revenue_goal) ??
      parseMoneyFromText(planJson.goal_revenue) ??
      parseMoneyFromText(planJson.main_goal);

    const title =
      cleanString(planJson.title ?? planJson.summary ?? planJson.strategy_summary ?? "Ma stratégie", 180) || "Ma stratégie";

    const payload: AnyRecord = {
      user_id: userId,
      ...(projectId ? { project_id: projectId } : {}),
      ...(businessProfileId ? { business_profile_id: businessProfileId } : {}),
      title,
      horizon_days: horizonDays,
      ...(targetMonthlyRev !== null ? { target_monthly_rev: targetMonthlyRev } : {}),
      updated_at: new Date().toISOString(),
    };

    const upsertRes = await supabase.from("strategies").upsert(payload, { onConflict: "user_id" }).select("id").maybeSingle();
    if (!upsertRes?.error && upsertRes?.data?.id) return String(upsertRes.data.id);

    let selQuery = supabase.from("strategies").select("id").eq("user_id", userId);
    if (projectId) selQuery = selQuery.eq("project_id", projectId);
    const sel = await selQuery.maybeSingle();
    if (!sel?.error && sel?.data?.id) return String(sel.data.id);

    return null;
  } catch (e) {
    console.error("getOrCreateStrategyIdBestEffort error:", e);
    return null;
  }
}

/**
 * -----------------------
 * Persona persistence (best-effort, RLS-safe via service role)
 * -----------------------
 */
async function getSupabaseAdminSafe(): Promise<any | null> {
  try {
    const mod = await import("@/lib/supabaseAdmin");
    return (mod as any).supabaseAdmin ?? null;
  } catch (e) {
    console.error("supabaseAdmin not available (skipping persona persistence):", e);
    return null;
  }
}

function personaLooksUseful(persona: AnyRecord | null): boolean {
  if (!persona) return false;
  const title = cleanString(persona.title ?? persona.profile ?? persona.name, 120);
  const pains = asArray(persona.pains).filter((x) => !!cleanString(x, 2));
  const desires = asArray(persona.desires).filter((x) => !!cleanString(x, 2));
  return !!title || pains.length >= 2 || desires.length >= 2;
}

function normalizePersona(persona: AnyRecord | null): AnyRecord | null {
  if (!persona) return null;

  const title = cleanString(persona.title ?? persona.profile ?? persona.name, 180);
  const pains = asArray(persona.pains).map((x) => cleanString(x, 160)).filter(Boolean);
  const desires = asArray(persona.desires).map((x) => cleanString(x, 160)).filter(Boolean);
  const channels = asArray(persona.channels).map((x) => cleanString(x, 64)).filter(Boolean);
  const tags = asArray(persona.tags).map((x) => cleanString(x, 64)).filter(Boolean);

  const objections = asArray(persona.objections).map((x) => cleanString(x, 160)).filter(Boolean);
  const triggers = asArray(persona.triggers).map((x) => cleanString(x, 160)).filter(Boolean);
  const exact_phrases = asArray(persona.exact_phrases ?? persona.exactPhrases).map((x) => cleanString(x, 180)).filter(Boolean);

  const result = { title, pains, desires, channels, tags, objections, triggers, exact_phrases };
  return personaLooksUseful(result) ? result : null;
}

async function persistPersonaBestEffort(params: {
  userId: string;
  strategyId: string | null;
  persona: AnyRecord | null;
  projectId?: string | null;
}): Promise<void> {
  const { userId, strategyId, persona, projectId } = params;

  if (!persona || !personaLooksUseful(persona)) return;

  const admin = await getSupabaseAdminSafe();
  if (!admin) return;

  const now = new Date().toISOString();

  const payload: AnyRecord = {
    user_id: userId,
    ...(projectId ? { project_id: projectId } : {}),
    ...(strategyId ? { strategy_id: strategyId } : {}),
    role: "client_ideal",
    name: cleanString(persona.title, 240) || null,
    description: cleanString((persona as any).description ?? (persona as any).current_situation ?? "", 4000) || null,
    pains: JSON.stringify((persona as any).pains ?? []),
    desires: JSON.stringify((persona as any).desires ?? []),
    objections: JSON.stringify((persona as any).objections ?? []),
    current_situation: cleanString((persona as any).current_situation ?? "", 6000) || null,
    desired_situation: cleanString((persona as any).desired_situation ?? "", 6000) || null,
    awareness_level: cleanString((persona as any).awareness_level ?? "", 120) || null,
    budget_level: cleanString((persona as any).budget_level ?? "", 120) || null,
    channels: JSON.stringify((persona as any).channels ?? []),
    triggers: JSON.stringify((persona as any).triggers ?? []),
    exact_phrases: JSON.stringify((persona as any).exact_phrases ?? (persona as any).exactPhrases ?? []),
    persona_json: persona,
    updated_at: now,
  };

  try {
    const up = await admin.from("personas").upsert(payload, { onConflict: "user_id,role" });
    if (!up.error) return;
    console.error("persistPersonaBestEffort upsert error:", up.error);
  } catch (e) {
    console.error("persistPersonaBestEffort upsert failed:", e);
  }

  try {
    const ins = await admin.from("personas").insert({ ...payload, created_at: now });
    if (!ins.error) return;
    console.error("persistPersonaBestEffort insert error:", ins.error);
  } catch (e) {
    console.error("persistPersonaBestEffort insert failed:", e);
  }

  try {
    await admin.from("personas").update(payload).eq("user_id", userId).eq("role", "client_ideal");
  } catch (e) {
    console.error("persistPersonaBestEffort update fallback failed:", e);
  }
}

/**
 * Push a rich persona summary to business_profiles.mission so the settings page shows useful info.
 */
async function enrichBusinessProfileMissionBestEffort(params: {
  supabase: any;
  userId: string;
  persona: AnyRecord | null;
  planJson: AnyRecord | null;
  projectId?: string | null;
}): Promise<void> {
  const { supabase, userId, persona, planJson, projectId } = params;
  if (!persona && !planJson) return;

  try {
    const patch: AnyRecord = { updated_at: new Date().toISOString() };

    // ✅ Build persona summary for mission field (markdown format for AIContent rendering)
    if (persona) {
      const parts: string[] = [];

      const title = cleanString(persona.title ?? persona.profile ?? persona.name, 200);
      if (title) parts.push(`**${title}**`);

      const pains = asArray(persona.pains).map((x) => cleanString(x, 160)).filter(Boolean);
      if (pains.length > 0) {
        parts.push("");
        parts.push("**Douleurs principales**");
        pains.slice(0, 4).forEach((p) => parts.push(`- ${p}`));
      }

      const desires = asArray(persona.desires).map((x) => cleanString(x, 160)).filter(Boolean);
      if (desires.length > 0) {
        parts.push("");
        parts.push("**Désirs**");
        desires.slice(0, 4).forEach((d) => parts.push(`- ${d}`));
      }

      const objections = asArray(persona.objections).map((x) => cleanString(x, 160)).filter(Boolean);
      if (objections.length > 0) {
        parts.push("");
        parts.push("**Objections fréquentes**");
        objections.slice(0, 3).forEach((o) => parts.push(`- ${o}`));
      }

      const channels = asArray(persona.channels).map((x) => cleanString(x, 80)).filter(Boolean);
      if (channels.length > 0) {
        parts.push("");
        parts.push("**Canaux préférés**");
        channels.forEach((c) => parts.push(`- ${c}`));
      }

      const summary = parts.join("\n");
      if (summary.trim()) {
        patch.mission = summary;
      }
    }

    // ✅ Niche formula: NEVER overwrite — the user's exact onboarding sentence is the source of truth.
    // The niche field is set during onboarding (questionnaire) and editable in Settings > Positionnement.
    // Strategy generation must not replace it with AI-generated text.

    if (Object.keys(patch).length <= 1) return; // only updated_at, nothing useful

    let bpUpdateQuery = supabase.from("business_profiles").update(patch).eq("user_id", userId);
    if (projectId) bpUpdateQuery = bpUpdateQuery.eq("project_id", projectId);
    await bpUpdateQuery;
  } catch (e) {
    console.error("enrichBusinessProfileMissionBestEffort error (non-blocking):", e);
  }
}

/**
 * -----------------------
 * Offers normalization + persistence
 * -----------------------
 */
function normalizeOffer(offer: AnyRecord | null): AnyRecord | null {
  if (!offer) return null;
  const title = cleanString(offer.title ?? offer.nom ?? offer.name, 160);
  const composition = cleanString(offer.composition ?? offer.contenu ?? "", 800);
  const purpose = cleanString(offer.purpose ?? offer.objectif ?? offer.benefit ?? "", 400);
  const format = cleanString(offer.format ?? offer.type ?? "", 120);
  const insight = cleanString(offer.insight ?? offer.angle ?? "", 240);
  const price = toNumber(offer.price);
  if (!title && !composition && !purpose) return null;

  return { title, composition, purpose, format, insight, ...(price !== null ? { price } : {}) };
}

function normalizeOfferSet(p: AnyRecord | null, idx: number): AnyRecord {
  const id = String(p?.id ?? idx);
  const name = cleanString(p?.name ?? p?.nom ?? `Pyramide ${idx + 1}`, 160);
  const strategy_summary = cleanString(p?.strategy_summary ?? p?.logique ?? "", 4000);

  const lead =
    asRecord(p?.lead_magnet) ?? asRecord(p?.leadMagnet) ?? asRecord(p?.lead) ?? asRecord(p?.lead_offer) ?? null;
  const low =
    asRecord(p?.low_ticket) ?? asRecord(p?.lowTicket) ?? null;
  const mid =
    asRecord(p?.middle_ticket) ?? asRecord(p?.middleTicket) ?? asRecord(p?.mid) ?? asRecord(p?.middle_offer) ?? null;
  const high =
    asRecord(p?.high_ticket) ?? asRecord(p?.highTicket) ?? asRecord(p?.high) ?? asRecord(p?.high_offer) ?? null;

  return {
    id,
    name,
    strategy_summary,
    lead_magnet: normalizeOffer(lead),
    low_ticket: normalizeOffer(low),
    middle_ticket: normalizeOffer(mid),
    high_ticket: normalizeOffer(high),
  };
}

function offersLookUseful(offers: unknown[]): boolean {
  if (!Array.isArray(offers) || offers.length < 1) return false;
  const ok = offers
    .map((p, idx) => normalizeOfferSet(asRecord(p), idx))
    .filter((x) => !!cleanString(x.name, 2) && !!x.lead_magnet && !!x.low_ticket && !!x.high_ticket);
  // middle_ticket is optional for backward compat with existing data
  return ok.length >= 1;
}

async function persistOfferPyramidsBestEffort(params: {
  supabase: any;
  userId: string;
  strategyId: string | null;
  pyramids: AnyRecord[];
  pyramidRunId: string;
  projectId?: string | null;
}): Promise<void> {
  const { supabase, userId, strategyId, pyramids, pyramidRunId, projectId } = params;

  try {
    if (!Array.isArray(pyramids) || pyramids.length < 1) return;

    const rows: AnyRecord[] = [];

    pyramids.forEach((pyr, idx) => {
      const offerSetName = cleanString(pyr?.name ?? `Offre ${idx + 1}`, 160);
      const offerSetSummary = cleanString(pyr?.strategy_summary ?? "", 4000);

      // Map internal names → DB enum (offer_level): lead_magnet, entry, core, premium
      const levels: { level: string; offer: AnyRecord | null }[] = [
        { level: "lead_magnet", offer: asRecord(pyr?.lead_magnet) },
        { level: "entry", offer: asRecord(pyr?.low_ticket) },
        { level: "core", offer: asRecord(pyr?.middle_ticket) },
        { level: "premium", offer: asRecord(pyr?.high_ticket) },
      ];

      levels.forEach(({ level, offer }) => {
        const o = asRecord(offer);
        if (!o) return;

        const name = cleanString(o.title ?? o.name ?? "", 180);
        const description = cleanString(o.composition ?? o.description ?? "", 2000);
        const promise = cleanString(o.purpose ?? o.promise ?? "", 2000);
        const format = cleanString(o.format ?? "", 180);
        const main_outcome = cleanString(o.insight ?? o.main_outcome ?? "", 2000);

        const price = toNumber(o.price);
        rows.push({
          user_id: userId,
          ...(projectId ? { project_id: projectId } : {}),
          ...(strategyId ? { strategy_id: strategyId } : {}),
          pyramid_run_id: pyramidRunId,
          option_index: idx,
          level,
          name,
          description,
          promise,
          format,
          ...(price !== null ? { price_min: price, price_max: price } : {}),
          main_outcome,
          is_flagship: level === "premium",
          details: {
            pyramid: { id: cleanString(pyr?.id, 64), name: offerSetName, strategy_summary: offerSetSummary },
            offer: o,
          },
          updated_at: new Date().toISOString(),
        });
      });
    });

    if (!rows.length) return;

    const up = await supabase.from("offer_pyramids").upsert(rows, {
      onConflict: "user_id,pyramid_run_id,option_index,level",
    });

    if (up?.error) {
      const ins = await supabase.from("offer_pyramids").insert(rows);
      if (ins?.error) console.error("persistOfferPyramidsBestEffort failed:", ins.error);
    }
  } catch (e) {
    console.error("persistOfferPyramidsBestEffort unexpected error:", e);
  }
}

/**
 * -----------------------
 * Tasks / Persona helpers
 * -----------------------
 */
function normalizeTaskTitle(v: AnyRecord): string {
  return cleanString(v.title ?? v.task ?? v.name, 180);
}

function normalizeTaskItem(v: AnyRecord | null): AnyRecord | null {
  if (!v) return null;
  const title = normalizeTaskTitle(v);
  if (!title) return null;

  const due_date = cleanString(v.due_date ?? v.scheduled_for ?? v.date, 32);
  const priority = cleanString(v.priority ?? v.importance ?? "", 12);

  return { title, ...(due_date ? { due_date } : {}), ...(priority ? { priority } : {}) };
}

function normalizeTasksByTimeframe(raw: AnyRecord | null): AnyRecord {
  const grouped = asRecord(raw) ?? {};
  const d30 = asArray(grouped.d30).map((x) => normalizeTaskItem(asRecord(x))).filter(Boolean).slice(0, 30);
  const d60 = asArray(grouped.d60).map((x) => normalizeTaskItem(asRecord(x))).filter(Boolean).slice(0, 30);
  const d90 = asArray(grouped.d90).map((x) => normalizeTaskItem(asRecord(x))).filter(Boolean).slice(0, 30);
  return { d30, d60, d90 };
}

function addDaysISO(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildFallbackTasksByTimeframe(
  base: Date,
  context: { niche?: string; mainGoal?: string; isAbsoluteBeginner?: boolean } = {},
): { d30: AnyRecord[]; d60: AnyRecord[]; d90: AnyRecord[] } {
  const niche = cleanString(context.niche, 80) || "votre business";
  const goal = cleanString(context.mainGoal, 120) || "atteindre vos objectifs";
  const isAbsoluteBeginner = Boolean(context.isAbsoluteBeginner);

  // Beginner path: starts from absolute zero (no niche, no offers, no audience)
  const d30Titles = isAbsoluteBeginner
    ? [
        `Identifier 3 domaines où tu pourrais aider des gens (passions, compétences, expériences)`,
        `Choisir ta niche en finissant cette phrase : "J'aide les [X] à [Y] grâce à [Z]"`,
        `Interviewer 5 personnes ciblées pour valider le problème et la demande`,
        `Créer un profil professionnel sur 1 réseau social (bio optimisée + photo pro)`,
        `Publier 10 contenus de valeur pour tester l'attractivité de ton sujet`,
        `Définir ton client idéal : problème n°1, désirs profonds, objections courantes`,
      ]
    : [
        `Clarifier la promesse et le positionnement pour ${niche}`,
        `Définir l'offre lead magnet (titre, format, bénéfice, livrables)`,
        `Créer la page de capture + séquence email de bienvenue`,
        `Lister 30 idées de contenus alignées sur ${goal}`,
        `Mettre en place un calendrier de contenu (2-3 posts/sem)`,
        `Suivre les métriques de base (leads, trafic, conversion)`,
      ];

  const d60Titles = isAbsoluteBeginner
    ? [
        `Créer ta première offre minimale : service ou produit simple à 0€ (test de demande)`,
        `Proposer cette offre test à 5 personnes de ton réseau et collecter des retours`,
        `Fixer ton prix en te basant sur la valeur perçue (pas tes coûts)`,
        `Créer une page de capture simple et collecter tes 50 premiers emails`,
        `Publier 3 contenus par semaine de façon régulière sur ton réseau principal`,
        `Rejoindre 2-3 communautés en ligne où vit ton client idéal et être utile`,
      ]
    : [
        `Construire l'offre low-ticket (structure + prix + valeur)`,
        `Rédiger la page de vente low-ticket (problème → solution → preuves)`,
        `Lancer 1 campagne d'acquisition (social / email / partenariats)`,
        `Collecter 5 retours clients et ajuster l'offre`,
        `Mettre en place un process de production de contenu récurrent`,
        `Optimiser le tunnel (conversion page, emails, CTA)`,
      ];

  const d90Titles = isAbsoluteBeginner
    ? [
        `Créer un lead magnet irrésistible (guide PDF, template ou mini-formation gratuite)`,
        `Mettre en place une séquence email de bienvenue automatisée (5 emails)`,
        `Développer ta première offre payante structurée basée sur les besoins découverts`,
        `Lancer ta première vente : 1 client payant = preuve de concept validée`,
        `Collecter 3 témoignages et les utiliser dans ton contenu et tes offres`,
        `Planifier le trimestre suivant : objectifs chiffrés, canaux prioritaires, KPIs`,
      ]
    : [
        `Structurer l'offre high-ticket (programme / coaching / service)`,
        `Créer le process de vente (script, qualification, call)`,
        `Produire 3 études de cas / témoignages`,
        `Automatiser les étapes clés (CRM, email, suivi)`,
        `Standardiser l'onboarding client et la delivery`,
        `Planifier le trimestre suivant (objectifs + priorités)`,
      ];

  function withDueDates(titles: string[], startDay: number, span: number): AnyRecord[] {
    const step = Math.max(1, Math.floor(span / Math.max(1, titles.length)));
    return titles.map((title, idx) => ({
      title,
      due_date: addDaysISO(base, startDay + idx * step),
      priority: idx < 2 ? "high" : idx < 4 ? "medium" : "low",
    }));
  }

  return {
    d30: withDueDates(d30Titles, 3, 27),
    d60: withDueDates(d60Titles, 33, 27),
    d90: withDueDates(d90Titles, 63, 27),
  };
}

function tasksByTimeframeLooksUseful(planJson: AnyRecord | null): boolean {
  if (!planJson) return false;
  const plan90 = asRecord(planJson.plan_90_days) || asRecord(planJson.plan90) || asRecord(planJson.plan_90);
  const grouped = asRecord(plan90?.tasks_by_timeframe ?? planJson.tasks_by_timeframe);
  if (!grouped) return false;
  const d30 = asArray(grouped.d30).length;
  const d60 = asArray(grouped.d60).length;
  const d90 = asArray(grouped.d90).length;
  return d30 + d60 + d90 >= 6;
}

function strategyTextLooksUseful(planJson: AnyRecord | null): boolean {
  if (!planJson) return false;
  const mission = cleanString(planJson.mission, 240);
  const promise = cleanString(planJson.promise, 240);
  const positioning = cleanString(planJson.positioning, 320);
  const summary = cleanString(planJson.summary ?? planJson.strategy_summary ?? planJson.strategySummary, 1200);
  return !!mission || !!promise || !!positioning || !!summary;
}

function fullStrategyLooksUseful(planJson: AnyRecord | null): boolean {
  if (!planJson) return false;
  return personaLooksUseful(asRecord(planJson.persona)) && tasksByTimeframeLooksUseful(planJson) && strategyTextLooksUseful(planJson);
}

function starterPlanLooksUseful(planJson: AnyRecord | null): boolean {
  if (!planJson) return false;
  const summary = cleanString(planJson.strategy_summary ?? planJson.summary ?? planJson.strategySummary ?? "", 2400);
  const goals = Array.isArray(planJson.strategy_goals) ? planJson.strategy_goals : [];
  const focus = Array.isArray(planJson.dashboard_focus) ? planJson.dashboard_focus : [];
  return Boolean(summary) || goals.length >= 1 || focus.length >= 1;
}

function pickSelectedPyramidFromPlan(planJson: AnyRecord | null): AnyRecord | null {
  if (!planJson) return null;

  const direct = asRecord(planJson.selected_offer_pyramid) ?? asRecord(planJson.selected_pyramid);
  if (direct) return direct;

  const idx =
    typeof planJson.selected_offer_pyramid_index === "number"
      ? planJson.selected_offer_pyramid_index
      : typeof planJson.selected_pyramid_index === "number"
        ? planJson.selected_pyramid_index
        : null;

  const pyramids = asArray(planJson.offer_pyramids);
  if (typeof idx === "number" && pyramids[idx]) return asRecord(pyramids[idx]) ?? null;

  return null;
}

function safeLocaleLabel(locale: "fr" | "en") {
  return locale === "fr" ? "Français" : "English";
}

async function generateStarterStrategyGoals(params: {
  ai: any;
  locale: "fr" | "en";
  businessProfile: AnyRecord;
  onboardingFacts: Record<string, unknown>;
}): Promise<{ strategy_summary: string; strategy_goals: any[]; dashboard_focus?: string[] } | null> {
  const { ai, locale, businessProfile, onboardingFacts } = params;

  const lang = safeLocaleLabel(locale);

  const systemPrompt = `
You are Tipote™, a business onboarding strategist.

GOAL
- Produce a simple, actionable “starter plan” based on the user context.
- No jargon, no acronyms.
- Be specific, realistic, and adapted to the user’s stage and constraints.

LANGUAGE
- Output language: ${lang}.

OUTPUT
Return ONLY valid JSON with this schema:
{
  "strategy_summary": "string (2-4 short sentences)",
  "strategy_goals": [
    {
      "title": "string (very specific goal)",
      "why": "string (1 sentence)",
      "metric": "string (simple measurable indicator)",
      "first_actions": ["string","string","string"]
    }
  ],
  "dashboard_focus": ["string","string","string"]
}

RULES
- Provide 3 to 5 goals max.
- first_actions must be concrete and doable this week.
- dashboard_focus are short labels to drive the dashboard (ex: "Visibilité", "Ventes", "Offre").
- If business_model is affiliate: never talk about creating an offer.
- If user has multiple activities: focus ONLY on primary_activity.
${buildRefusalsPromptSection(businessProfile)}`.trim();

  const userPrompt = `
CONTEXT — Onboarding facts (chat V2):
${JSON.stringify(onboardingFacts ?? null, null, 2)}

CONTEXT — Business profile (fallback):
${JSON.stringify(
  {
    niche: (businessProfile as any).niche ?? null,
    mission_statement: (businessProfile as any).mission_statement ?? (businessProfile as any).missionStatement ?? null,
    weekly_hours: (businessProfile as any).weekly_hours ?? (businessProfile as any).weeklyHours ?? null,
    revenue_goal_monthly:
      (businessProfile as any).revenue_goal_monthly ??
      (businessProfile as any).revenueGoalMonthly ??
      (businessProfile as any).target_monthly_revenue ??
      (businessProfile as any).revenue_goal ??
      null,
    has_offers: (businessProfile as any).has_offers ?? (businessProfile as any).hasOffers ?? null,
    offers: (businessProfile as any).offers ?? null,
    main_goal_90_days:
      (businessProfile as any).main_goal_90_days ??
      (businessProfile as any).main_goal ??
      (businessProfile as any).mainGoal90Days ??
      null,
    tone_preference: (businessProfile as any).tone_preference ?? (businessProfile as any).tonePreference ?? null,
  },
  null,
  2,
)}
`.trim();

  try {
    const resp = await ai.chat.completions.create({
      ...cachingParams("strategy_starter"),
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: 4000,
    } as any);

    const raw = resp.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as AnyRecord;

    const strategy_summary = cleanString(parsed.strategy_summary, 800) || "";
    const strategy_goals = asArray(parsed.strategy_goals)
      .slice(0, 5)
      .map((g) => {
        const gr = asRecord(g) ?? {};
        return {
          title: cleanString(gr.title, 140) || "",
          why: cleanString(gr.why, 240) || "",
          metric: cleanString(gr.metric, 140) || "",
          first_actions: asArray(gr.first_actions)
            .slice(0, 5)
            .map((a) => cleanString(a, 180))
            .filter(Boolean),
        };
      })
      .filter((g) => g.title);

    const dashboard_focus = asArray(parsed.dashboard_focus)
      .slice(0, 6)
      .map((x) => cleanString(x, 64))
      .filter(Boolean);

    if (!strategy_summary || strategy_goals.length === 0) return null;
    return { strategy_summary, strategy_goals, dashboard_focus };
  } catch (e) {
    console.error("generateStarterStrategyGoals error:", e);
    return null;
  }
}

export async function POST(req: Request) {
  // ── Pre-validate synchronously before starting the stream ──────────
  let supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  let userId: string;
  let projectId: string | null;
  let forceRegenerate: boolean;
  let locale: "fr" | "en";

  try {
    supabase = await getSupabaseServerClient();

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    userId = session.user.id;
    projectId = await getActiveProjectId(supabase, userId);

    // ✅ Read request body (force flag from front-end onboarding finalization)
    const reqBody = (await req.json().catch(() => ({}))) as { force?: boolean };
    forceRegenerate = Boolean(reqBody?.force);

    const acceptLang = (req.headers.get("accept-language") || "").toLowerCase();
    locale = acceptLang.includes("fr") ? "fr" : "en";

    if (!openai) {
      return NextResponse.json(
        { success: false, error: "AI client not configured" },
        { status: 500 },
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }

  // ── Start SSE stream — heartbeats keep the connection alive ────────
  const ai = openai!;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendSSE(event: string, data: any) {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* stream closed */ }
      }

      // Send heartbeat every 5 seconds to prevent proxy timeout
      const heartbeat = setInterval(() => {
        try {
          sendSSE("heartbeat", { status: "generating" });
        } catch { /* stream closed */ }
      }, 5000);

      try {
        sendSSE("progress", { step: "Lecture des données..." });

    // 0) Lire plan existant (idempotence)
    let bpQuery = supabase
      .from("business_plan")
      .select("plan_json")
      .eq("user_id", userId);
    if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
    const { data: existingPlan, error: existingPlanError } = await bpQuery.maybeSingle();

    if (existingPlanError) console.error("Error checking existing business_plan:", existingPlanError);

    let existingPlanJson = (existingPlan?.plan_json ?? null) as AnyRecord | null;

    const existingOffers = existingPlanJson ? asArray(existingPlanJson.offer_pyramids) : [];
    const existingSelectedIndex =
      typeof existingPlanJson?.selected_offer_pyramid_index === "number"
        ? existingPlanJson.selected_offer_pyramid_index
        : typeof existingPlanJson?.selected_pyramid_index === "number"
          ? existingPlanJson.selected_pyramid_index
          : null;

    // ✅ When force=true (e.g. after reset + re-onboarding), treat existing plan as stale
    // so we always regenerate a fresh strategy based on the new onboarding data.
    if (forceRegenerate && existingPlanJson) {
      // Wipe stale plan so all "already_complete" guards are bypassed
      existingPlanJson = null;
    }

    const hasSelected = typeof existingSelectedIndex === "number" && !forceRegenerate;
    const needFullStrategy = hasSelected && !fullStrategyLooksUseful(existingPlanJson);
    const hasUsefulOffers = !forceRegenerate && offersLookUseful(existingOffers);
    const hasStarter = !forceRegenerate && starterPlanLooksUseful(existingPlanJson);

    // 1) business_profile
    let profileQuery = supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", userId);
    if (projectId) profileQuery = profileQuery.eq("project_id", projectId);
    const { data: businessProfile, error: profileError } = await profileQuery.single();

    if (profileError || !businessProfile) {
      console.error("Business profile error:", profileError);
      sendSSE("result", { success: false, error: `Business profile missing: ${profileError?.message ?? "unknown"}` });
      return;
    }

    const revenueGoalLabel = pickRevenueGoalLabel(businessProfile as AnyRecord);
    const targetMonthlyRevGuess = parseMoneyFromText(revenueGoalLabel);

    // 2) onboarding_facts (best-effort)
    const onboardingFacts: Record<string, unknown> = {};
    try {
      let factsQuery = supabase
        .from("onboarding_facts")
        .select("key,value,confidence,updated_at")
        .eq("user_id", userId);
      if (projectId) factsQuery = factsQuery.eq("project_id", projectId);
      const { data: onboardingFactsRows, error: onboardingFactsError } = await factsQuery;

      if (onboardingFactsError) {
        console.error("Error reading onboarding_facts:", onboardingFactsError);
      } else {
        for (const row of onboardingFactsRows ?? []) {
          if (!row?.key) continue;
          onboardingFacts[String((row as any).key)] = (row as any).value;
        }
      }
    } catch (e) {
      console.error("onboarding_facts read failed:", e);
    }

    // -----------------------------
    // Onboarding facts helpers (guardrails)
    // -----------------------------
    const FACT_FALLBACKS: Record<string, string[]> = {
      business_model: ["businessModel", "business_model_v2"],
      has_offers: ["hasOffers", "has_offer", "offers_exist"],
      offers_satisfaction: ["offer_satisfaction", "satisfaction_offers", "offersSatisfaction"],
    };

    function getFact<T = unknown>(key: string, fallbacks: string[] = []): T | undefined {
      const all = [key, ...(FACT_FALLBACKS[key] ?? []), ...fallbacks];
      for (const k of all) {
        if (!k) continue;
        if (Object.prototype.hasOwnProperty.call(onboardingFacts, k)) return (onboardingFacts as any)[k] as T;
      }
      return undefined;
    }

    function warnMissingFact(key: string, requiredWhen: boolean) {
      if (!requiredWhen) return;
      const v = getFact(key);
      if (v === undefined || v === null || v === "") {
        console.warn(`[strategy] missing onboarding_fact "${key}" (fallbacks: ${(FACT_FALLBACKS[key] ?? []).join(",")})`);
      }
    }

    // ✅ Derive mode (SOURCE OF TRUTH for "generate offers or not")
    warnMissingFact("business_model", true);
    const businessModel = cleanString(getFact("business_model") as any, 40).toLowerCase();
    const isAffiliate =
      businessModel === "affiliate" ||
      businessModel === "affiliation" ||
      businessModel === "affiliate_marketing" ||
      businessModel === "affiliate-marketing";

    const hasOffersEffective =
      getFact("has_offers") === true ||
      (businessProfile as any).has_offers === true ||
      (Array.isArray((businessProfile as any).offers) && (businessProfile as any).offers.length > 0);

    warnMissingFact("offers_satisfaction", hasOffersEffective);
    const offersSatisfactionRaw = cleanString(getFact("offers_satisfaction") as any, 40).toLowerCase();
    const isSatisfiedWithOffers = ["yes", "y", "true", "satisfied", "ok", "okay", "oui"].includes(offersSatisfactionRaw);

    // ✅ FIX demandé :
    // - On génère des offres si NON affiliate ET (pas d'offre OU pas satisfait)
    // - Si l'utilisateur a une offre ET satisfait => pas d'offres (stratégie autour de l'existant)
    const shouldGenerateOffers = !isAffiliate && !hasOffersEffective;

    // If user HAS offers but is NOT satisfied, we do NOT generate 3 new offer sets.
    // Instead we generate an "offer audit & improvements" + "alternative angles" section (see no-offers mode prompt).
    const shouldAuditOffers = !isAffiliate && hasOffersEffective && !isSatisfiedWithOffers;

    // 2b) competitor analysis (best-effort)
    let competitorContext = "";
    try {
      let compQuery = supabase
        .from("competitor_analyses")
        .select("summary, strengths, weaknesses, opportunities, positioning_matrix")
        .eq("user_id", userId);
      if (projectId) compQuery = compQuery.eq("project_id", projectId);
      const { data: competitorAnalysis } = await compQuery.maybeSingle();

      if (competitorAnalysis?.summary) {
        competitorContext = `
ANALYSE CONCURRENTIELLE (fournie par l'utilisateur) :
Synthese : ${competitorAnalysis.summary}
${competitorAnalysis.strengths?.length ? `Forces vs concurrents : ${JSON.stringify(competitorAnalysis.strengths)}` : ""}
${competitorAnalysis.weaknesses?.length ? `Faiblesses vs concurrents : ${JSON.stringify(competitorAnalysis.weaknesses)}` : ""}
${competitorAnalysis.opportunities?.length ? `Opportunites : ${JSON.stringify(competitorAnalysis.opportunities)}` : ""}
${competitorAnalysis.positioning_matrix ? `Matrice de positionnement : ${competitorAnalysis.positioning_matrix}` : ""}
`.trim();
      }
    } catch (e) {
      console.error("competitor analysis read failed (non-blocking):", e);
    }

    // 3) ressources (best-effort)
    const { data: resources, error: resourcesError } = await supabase.from("resources").select("*");
    if (resourcesError) console.error("Error loading resources:", resourcesError);

    const { data: resourceChunks, error: chunksError } = await supabase.from("resource_chunks").select("*");
    if (chunksError) console.error("Error loading resource_chunks:", chunksError);

    const limitedChunks = pickTopResourceChunks({
      chunks: Array.isArray(resourceChunks) ? (resourceChunks as AnyRecord[]) : [],
      businessProfile: businessProfile as AnyRecord,
      selectedOffers: null,
      maxChunks: 18,
    });
    const resourcesForPrompt = summarizeResourcesForPrompt(resources ?? [], 12);

    // ai is already validated above (pre-stream check)

    /**
     * 4) Nettoyage anti-régression :
     * Si on NE DOIT PAS générer d'offres (affiliate OU a déjà une offre ET satisfait),
     * on supprime les offres existantes du plan pour éviter UI "unknown offers".
     */
    if (!shouldGenerateOffers) {
      try {
        const base = isRecord(existingPlanJson) ? (existingPlanJson as AnyRecord) : {};
        const hadOffers = Array.isArray(base.offer_pyramids) && base.offer_pyramids.length > 0;
        const hadSelection =
          typeof base.selected_offer_pyramid_index === "number" ||
          typeof base.selected_pyramid_index === "number" ||
          base.selected_offer_pyramid ||
          base.selected_pyramid;

        if (hadOffers || hadSelection) {
          const cleaned: AnyRecord = {
            ...base,
            offer_pyramids: [],
            offer_pyramids_run_id: null,
            selected_offer_pyramid_index: null,
            selected_offer_pyramid: null,
            selected_pyramid_index: null,
            selected_pyramid: null,
            updated_at: new Date().toISOString(),
          };

          await supabase.from("business_plan").upsert(
            { user_id: userId, ...(projectId ? { project_id: projectId } : {}), plan_json: cleaned, updated_at: new Date().toISOString() },
            { onConflict: "user_id" },
          );

          existingPlanJson = cleaned;
        }
      } catch (e) {
        console.error("best-effort cleanup of legacy offers failed:", e);
      }
    }

    /**
     * 5) Starter plan (best-effort) : même si offres déjà présentes.
     */
    if (!hasStarter) {
      try {
        sendSSE("progress", { step: "Génération du plan de démarrage..." });
        // ✅ crédits : 1 génération = 1 crédit
        await chargeCreditOrThrow({ userId, feature: "strategy_starter" });

        const starter = await generateStarterStrategyGoals({
          ai,
          locale,
          businessProfile: businessProfile as AnyRecord,
          onboardingFacts: onboardingFacts ?? {},
        });

        if (starter) {
          const basePlan: AnyRecord = isRecord(existingPlanJson) ? (existingPlanJson as AnyRecord) : {};
          const nextPlan: AnyRecord = {
            ...basePlan,
            strategy_summary: starter.strategy_summary,
            strategy_goals: starter.strategy_goals,
            ...(starter.dashboard_focus?.length ? { dashboard_focus: starter.dashboard_focus } : {}),
            updated_at: new Date().toISOString(),
          };

          await supabase.from("business_plan").upsert(
            { user_id: userId, ...(projectId ? { project_id: projectId } : {}), plan_json: nextPlan, updated_at: new Date().toISOString() },
            { onConflict: "user_id" },
          );

          existingPlanJson = nextPlan;
        }
      } catch (e) {
        if (isNoCreditsError(e)) {
          sendSSE("result", { success: false, error: "NO_CREDITS" }); return;
        }
        console.error("starter plan generation failed (non-blocking):", e);
      }
    }

    /**
     * 6) Early returns (après starter)
     */
    if (hasSelected && !needFullStrategy && starterPlanLooksUseful(existingPlanJson)) {
      sendSSE("result", { success: true, planId: null, skipped: true, reason: "already_complete" }); return;
    }

    if (shouldGenerateOffers && !hasSelected && hasUsefulOffers && starterPlanLooksUseful(existingPlanJson)) {
      sendSSE("result", { success: true, planId: null, skipped: true, reason: "already_generated" }); return;
    }

    /**
     * 7) Génération des offres (SEULEMENT si shouldGenerateOffers)
     * - cas A: user n'a pas d'offre
     * - cas B: user a une offre MAIS pas satisfait => proposer alternatives (sans être “générique”)
     */
    if (shouldGenerateOffers && !hasUsefulOffers) {
      // ✅ crédits : 1 génération = 1 crédit
      try {
        await chargeCreditOrThrow({
          userId,
          feature: "offer_pyramids",
          meta: { hasOffersEffective, isSatisfiedWithOffers, businessModel },
        });
      } catch (e) {
        if (isNoCreditsError(e)) {
          sendSSE("result", { success: false, error: "NO_CREDITS" }); return;
        }
        throw e;
      }

      const systemPrompt = `Tu es Tipote™, un coach business senior (niveau mastermind) spécialisé en offre, positionnement, acquisition et systèmes.

OBJECTIF :
Proposer 3 pyramides d'offres complètes (lead magnet → low ticket → middle ticket → high ticket) adaptées à l'utilisateur.
Chaque pyramide = un ANGLE STRATÉGIQUE différent (objectif, mécanisme, positionnement).

CONTEXTE IMPORTANT :
- Si l'utilisateur a déjà des offres ET qu'il n'est PAS satisfait : propose 3 alternatives d'offres (angles/mécanismes) en réutilisant ou améliorant ses offres existantes quand c'est pertinent.
- Si l'utilisateur n'a pas d'offre : propose 3 pyramides d'offres complètes from scratch.

SOURCE DE VÉRITÉ (ordre de priorité) :
1) business_profile.diagnostic_profile (si présent) = vérité terrain, ultra prioritaire.
2) diagnostic_summary + diagnostic_answers (si présents).
3) Champs “cases” (maturity, biggest_blocker, etc.) = fallback seulement.

EXIGENCES “COACH-LEVEL” :
- Zéro blabla : tout doit être actionnable, spécifique, niché.
- Chaque pyramide = une stratégie distincte (angle, mécanisme, promesse, canal, format).
- Pas de généralités : préciser le quoi / comment / pourquoi.
- Cohérence : respecter contraintes & non-négociables (temps, énergie, budget, formats refusés).
- Inclure un quick win 7 jours dans la logique globale.
- Les 3 pyramides doivent représenter des ORIENTATIONS DIFFÉRENTES pour aider l'utilisateur à se décider (ex: communauté vs expertise vs productisation).
${buildRefusalsPromptSection(businessProfile as AnyRecord)}
IMPORTANT :
Tu dois répondre en JSON strict uniquement, sans texte autour.`.trim();

      const userPrompt = `META
- has_offers_effective: ${String(hasOffersEffective)}
- offers_satisfaction: ${offersSatisfactionRaw || "unknown"}

SOURCE PRIORITAIRE — Diagnostic (si présent) :
- diagnostic_profile :
${JSON.stringify((businessProfile as any).diagnostic_profile ?? (businessProfile as any).diagnosticProfile ?? null, null, 2)}

- diagnostic_summary :
${JSON.stringify((businessProfile as any).diagnostic_summary ?? (businessProfile as any).diagnosticSummary ?? null, null, 2)}

- diagnostic_answers (extraits) :
${JSON.stringify(((businessProfile as any).diagnostic_answers ?? (businessProfile as any).diagnosticAnswers ?? []) as any[], null, 2)}

DONNÉES FORMULAIRES (fallback) :
${JSON.stringify(
  {
    first_name: (businessProfile as any).first_name ?? (businessProfile as any).firstName ?? null,
    country: (businessProfile as any).country ?? null,
    niche: (businessProfile as any).niche ?? null,
    mission_statement: (businessProfile as any).mission_statement ?? (businessProfile as any).missionStatement ?? null,
    maturity: (businessProfile as any).maturity ?? null,
    biggest_blocker: (businessProfile as any).biggest_blocker ?? (businessProfile as any).biggestBlocker ?? null,
    weekly_hours: (businessProfile as any).weekly_hours ?? (businessProfile as any).weeklyHours ?? null,
    revenue_goal_monthly:
      (businessProfile as any).revenue_goal_monthly ??
      (businessProfile as any).revenueGoalMonthly ??
      (businessProfile as any).target_monthly_revenue ??
      (businessProfile as any).revenue_goal ??
      null,
    has_offers: (businessProfile as any).has_offers ?? (businessProfile as any).hasOffers ?? null,
    offers: (businessProfile as any).offers ?? null,
    social_links: (businessProfile as any).social_links ?? (businessProfile as any).socialLinks ?? null,
    email_list_size: (businessProfile as any).email_list_size ?? (businessProfile as any).emailListSize ?? null,
    main_goal_90_days:
      (businessProfile as any).main_goal_90_days ??
      (businessProfile as any).main_goal ??
      (businessProfile as any).mainGoal90Days ??
      null,
    main_goals: (businessProfile as any).main_goals ?? (businessProfile as any).mainGoals ?? null,
    preferred_content_type:
      (businessProfile as any).preferred_content_type ?? (businessProfile as any).preferredContentType ?? null,
    tone_preference: (businessProfile as any).tone_preference ?? (businessProfile as any).tonePreference ?? null,
  },
  null,
  2,
)}

Ressources internes (résumé) :
${JSON.stringify(resourcesForPrompt ?? [], null, 2)}

Chunks pertinents (extraits) :
${JSON.stringify(limitedChunks ?? [], null, 2)}

${competitorContext ? competitorContext + "\n" : ""}Contraintes :
- Génère 3 pyramides d'offres complètes, chacune avec un ANGLE STRATÉGIQUE différent.
${competitorContext ? "- Tiens compte de l'analyse concurrentielle pour proposer des offres différenciantes." : ""}
- Chaque pyramide contient 4 niveaux : lead_magnet, low_ticket, middle_ticket, high_ticket.
- Pour chaque niveau :
  - title, format, price (number), composition, purpose, insight
- 1 phrase "strategy_summary" par pyramide expliquant l'orientation et pourquoi cette approche.
- Les 3 pyramides doivent aider l'utilisateur à choisir entre des directions différentes.

STRUCTURE EXACTE À RENVOYER (JSON strict) :
{
  "offer_pyramids": [
    {
      "id": "A",
      "name": "Pyramide A — ...",
      "strategy_summary": "1 phrase expliquant l'angle stratégique de cette pyramide",
      "lead_magnet":   { "title":"", "format":"", "price":0, "composition":"", "purpose":"", "insight":"" },
      "low_ticket":    { "title":"", "format":"", "price":0, "composition":"", "purpose":"", "insight":"" },
      "middle_ticket": { "title":"", "format":"", "price":0, "composition":"", "purpose":"", "insight":"" },
      "high_ticket":   { "title":"", "format":"", "price":0, "composition":"", "purpose":"", "insight":"" }
    }
  ]
}`.trim();

      sendSSE("progress", { step: "Génération des offres..." });
      const aiResponse = await ai.chat.completions.create({
        ...cachingParams("strategy_offers"),
        model: OPENAI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 8000,
      } as any);

      const raw = aiResponse.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as AnyRecord;

      const offersRaw = asArray(parsed.offer_pyramids);
      const normalizedOffers = offersRaw.map((p, idx) => normalizeOfferSet(asRecord(p), idx));

      if (!offersLookUseful(normalizedOffers)) {
        console.error("AI returned incomplete offer_pyramids payload:", parsed);
        sendSSE("result", { success: false, error: "AI returned incomplete offer_pyramids" }); return;
      }

      const basePlan: AnyRecord = isRecord(existingPlanJson) ? existingPlanJson : {};

      const offerPyramidsRunId =
        typeof globalThis.crypto?.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      const plan_json: AnyRecord = {
        ...basePlan,
        offer_pyramids: normalizedOffers,
        offer_pyramids_run_id: offerPyramidsRunId,
        ...(cleanString(basePlan.revenue_goal, 240) || revenueGoalLabel
          ? { revenue_goal: cleanString(basePlan.revenue_goal, 240) || revenueGoalLabel }
          : {}),
        horizon_days: toNumber(basePlan.horizon_days) ?? 90,
        ...(targetMonthlyRevGuess !== null ? { target_monthly_rev: targetMonthlyRevGuess } : {}),
        selected_offer_pyramid_index:
          typeof basePlan.selected_offer_pyramid_index === "number" ? basePlan.selected_offer_pyramid_index : null,
        selected_offer_pyramid: basePlan.selected_offer_pyramid ?? null,
        selected_pyramid_index: typeof basePlan.selected_pyramid_index === "number" ? basePlan.selected_pyramid_index : null,
        selected_pyramid: basePlan.selected_pyramid ?? null,
        updated_at: new Date().toISOString(),
      };

      // starter plan si manquant (best-effort)
      try {
        const hasGoals = Array.isArray((plan_json as any).strategy_goals) && (plan_json as any).strategy_goals.length > 0;
        const hasSummary = typeof (plan_json as any).strategy_summary === "string" && (plan_json as any).strategy_summary.trim().length > 0;

        if (!hasGoals || !hasSummary) {
          // ✅ crédits : on a déjà consommé 1 crédit pour les offres ci-dessus,
          // on ne re-consomme pas ici (starter best-effort). Si tu veux facturer aussi, fais-le explicitement.
          const starter = await generateStarterStrategyGoals({
            ai,
            locale,
            businessProfile: businessProfile as AnyRecord,
            onboardingFacts: onboardingFacts ?? {},
          });

          if (starter) {
            (plan_json as any).strategy_summary = starter.strategy_summary;
            (plan_json as any).strategy_goals = starter.strategy_goals;
            if (starter.dashboard_focus?.length) (plan_json as any).dashboard_focus = starter.dashboard_focus;
          }
        }
      } catch (e) {
        console.error("starter plan generation failed (non-blocking):", e);
      }

      // best-effort persist offer_pyramids table
      try {
        const strategyId = await getOrCreateStrategyIdBestEffort({
          supabase,
          userId,
          businessProfile: businessProfile as AnyRecord,
          planJson: plan_json,
          projectId,
        });

        await persistOfferPyramidsBestEffort({
          supabase,
          userId,
          strategyId,
          pyramids: normalizedOffers,
          pyramidRunId: offerPyramidsRunId,
          projectId,
        });
      } catch (e) {
        console.error("offer_pyramids persistence error:", e);
      }

      const { data: saved, error: saveErr } = await supabase
        .from("business_plan")
        .upsert({ user_id: userId, ...(projectId ? { project_id: projectId } : {}), plan_json, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
        .select("id")
        .maybeSingle();

      if (saveErr) {
        console.error("Error saving business_plan offers:", saveErr);
        sendSSE("result", { success: false, error: saveErr.message }); return;
      }

      await persistStrategyRow({ supabase, userId, businessProfile: businessProfile as AnyRecord, planJson: plan_json, projectId });

      sendSSE("result", { success: true, planId: saved?.id ?? null }); return;
    }

    /**
     * 8) Cas "NE PAS générer d'offres" (affiliate OU user a déjà une offre ET satisfait)
     * -> stratégie complète sans inventer d'offres
     */
    if (!shouldGenerateOffers) {
      if (fullStrategyLooksUseful(existingPlanJson) && starterPlanLooksUseful(existingPlanJson)) {
        sendSSE("result", { success: true, planId: null, skipped: true, reason: "already_complete_no_pyramids" }); return;
      }

      // ✅ crédits : 1 génération = 1 crédit
      try {
        await chargeCreditOrThrow({
          userId,
          feature: "strategy_full_no_pyramids",
          meta: { offer_mode: isAffiliate ? "affiliate" : "existing_offer", businessModel },
        });
      } catch (e) {
        if (isNoCreditsError(e)) {
          sendSSE("result", { success: false, error: "NO_CREDITS" }); return;
        }
        throw e;
      }

      const systemPrompt = `Tu es Tipote™, un coach business senior (niveau mastermind) ET un stratège opérateur.

MISSION
À partir du business_profile, des onboarding_facts (source de vérité), et des ressources internes, tu produis :
1) une stratégie claire (mission, promesse, positionnement, résumé),
2) un persona “terrain” du CLIENT IDEAL (pains, désirs, objections, déclencheurs, phrases exactes),
3) un plan 90 jours exécutable (focus unique + milestones + tâches datées).

⚠️ DISTINCTION PROPRIETAIRE vs CLIENT IDEAL :
- Le “persona” décrit le CLIENT IDEAL (la cible, l'acheteur), PAS le propriétaire du business.
- Les champs “non_negotiables”, “root_fear”, “situation_tried”, “tone_preference”, “time_available” = contraintes du PROPRIETAIRE.
- Ne les attribue JAMAIS au persona du client idéal.

RÈGLES CRITIQUES (NON NÉGOCIABLES)
- Tu NE CRÉES PAS de nouvelles offres si l'utilisateur a déjà une offre.
- Si offers_satisfaction = yes : tu considères l'offre existante comme “flagship” et tu n'y touches pas.
- Si l'utilisateur a déjà une offre MAIS n'est PAS satisfait : tu proposes un audit (offer_audit) + 2-3 angles alternatifs (offer_alternatives) SANS inventer 3 nouvelles offres complètes.
- Si business_model = affiliate : tu NE PARLES PAS de créer une offre.
- Zéro blabla : tout doit être actionnable, spécifique, niché.
- Respect strict des contraintes si elles existent.

🎯 ADAPTATION AU NIVEAU DU BUSINESS (CRITIQUE) :
- Si l'utilisateur a DÉJÀ des offres (surtout middle/high ticket, >1000€) : NE PAS proposer de “créer un lead magnet”, “définir sa niche”, ou “faire ses premiers contenus”. C'est insultant pour un business avancé.
- Pour un business avancé (offres existantes, CA > 2000€/mois) : concentre-toi sur l'OPTIMISATION et le SCALE (augmenter le taux de conversion, automatiser, upseller, créer des systèmes de vente prévisibles, développer l'audience qualifiée, structurer le closing, créer des assets marketing à haut levier).
- Pour un business intermédiaire (offres existantes, CA < 2000€/mois) : concentre-toi sur l'ACCÉLÉRATION (systématiser l'acquisition, optimiser le funnel existant, tester de nouveaux canaux, améliorer le packaging/positionnement).
- Les tâches du plan 90j doivent correspondre au NIVEAU RÉEL du business. Analyse les offres, prix, volume de ventes pour calibrer les actions.
${buildRefusalsPromptSection(businessProfile as AnyRecord)}
FORMAT JSON STRICT UNIQUEMENT :
{
  “mission”: “string”,
  “promise”: “string”,
  “positioning”: “string”,
  “summary”: “string”,
  “persona”: {
    “title”: “profil en 1 phrase”,
    “pains”: [“...”],
    “desires”: [“...”],
    “channels”: [“...”],
    “objections”: [“...”],
    “triggers”: [“...”],
    “exact_phrases”: [“...”]
  },
  “plan_90_days”: {
    “focus”: “string”,
    “milestones”: [“...”, “...”, “...”],
    “tasks_by_timeframe”: {
      “d30”: [{ “title”: “...”, “due_date”: “YYYY-MM-DD”, “priority”: “high|medium|low” }],
      “d60”: [{ “title”: “...”, “due_date”: “YYYY-MM-DD”, “priority”: “high|medium|low” }],
      “d90”: [{ “title”: “...”, “due_date”: “YYYY-MM-DD”, “priority”: “high|medium|low” }]
    }
  },
  “offer_audit”: {
    “diagnosis”: “string”,
    “quick_wins”: [“string”,”string”,”string”],
    “improvements”: [
      { “area”: “positioning|promise|pricing|packaging|delivery|funnel|traffic”, “recommendation”: “string”, “test”: “string (simple experiment 7-14 days)” }
    ]
  },
  “offer_alternatives”: [
    { “angle”: “string”, “for_who”: “string”, “core_promise”: “string”, “suggested_changes”: [“string”], “first_test”: “string” }
  ]
}`.trim();

      const selectedChunks = pickTopResourceChunks({
        chunks: Array.isArray(resourceChunks) ? (resourceChunks as AnyRecord[]) : [],
        businessProfile: businessProfile as AnyRecord,
        selectedOffers: null,
        maxChunks: 18,
      });

      const userPrompt = `ONBOARDING FACTS (SOURCE DE VÉRITÉ)
${JSON.stringify(onboardingFacts ?? null, null, 2)}

SOURCE PRIORITAIRE — Diagnostic (si présent) :
- diagnostic_profile :
${JSON.stringify((businessProfile as any).diagnostic_profile ?? (businessProfile as any).diagnosticProfile ?? null, null, 2)}

- diagnostic_summary :
${JSON.stringify((businessProfile as any).diagnostic_summary ?? (businessProfile as any).diagnosticSummary ?? null, null, 2)}

- diagnostic_answers (extraits) :
${JSON.stringify(((businessProfile as any).diagnostic_answers ?? (businessProfile as any).diagnosticAnswers ?? []) as any[], null, 2)}

BUSINESS PROFILE (fallback)
${JSON.stringify(
  {
    niche: (businessProfile as any).niche ?? null,
    mission_statement: (businessProfile as any).mission_statement ?? (businessProfile as any).missionStatement ?? null,
    has_offers: (businessProfile as any).has_offers ?? null,
    offers: (businessProfile as any).offers ?? null,
    business_maturity: (businessProfile as any).business_maturity ?? null,
    revenue_goal_monthly:
      (businessProfile as any).revenue_goal_monthly ??
      (businessProfile as any).revenueGoalMonthly ??
      (businessProfile as any).target_monthly_revenue ??
      (businessProfile as any).revenue_goal ??
      null,
    current_monthly_revenue: ((businessProfile as any).diagnostic_answers as AnyRecord)?.currentMonthlyRevenue ?? null,
    has_already_sold: ((businessProfile as any).diagnostic_answers as AnyRecord)?.hasAlreadySold ?? null,
    weekly_hours: (businessProfile as any).weekly_hours ?? (businessProfile as any).weeklyHours ?? null,
    biggest_blocker: (businessProfile as any).biggest_blocker ?? (businessProfile as any).biggestBlocker ?? null,
    is_satisfied_with_offers: isSatisfiedWithOffers,
    audience_email: (businessProfile as any).audience_email ?? null,
    audience_social: (businessProfile as any).audience_social ?? null,
  },
  null,
  2,
)}

⚠️ OFFRES EXISTANTES DE L'UTILISATEUR (source de vérité — à utiliser comme base de la stratégie) :
${JSON.stringify((businessProfile as any).offers ?? [], null, 2)}
→ Si l'utilisateur a des offres à prix élevé (>1000€), c'est un business AVANCÉ. Adapte les tâches en conséquence (pas de "créer un lead magnet" ou "définir sa niche").
→ Si l'utilisateur a déjà vendu (has_already_sold=yes) et un CA mensuel, c'est un business ÉTABLI. Focus sur l'optimisation et le scale.

${competitorContext ? competitorContext + "\n" : ""}RESSOURCES INTERNES (résumé)
${JSON.stringify(resourcesForPrompt ?? [], null, 2)}

CHUNKS PERTINENTS (extraits)
${JSON.stringify(selectedChunks ?? [], null, 2)}

CONTRAINTES TASKS
- Minimum 6 tâches par timeframe (d30/d60/d90).
- due_date valides et réparties.
- Focus = 1 levier concret.
- ⚠️ Les tâches doivent être calibrées au NIVEAU du business : si l'utilisateur a déjà des offres high ticket et des clients, ne propose PAS de tâches de débutant.
${competitorContext ? "- Intègre les insights de l'analyse concurrentielle dans le positionnement et la stratégie." : ""}
`.trim();

      sendSSE("progress", { step: "Génération de la stratégie complète..." });
      const fullAiResponse = await ai.chat.completions.create({
        ...cachingParams("strategy_full"),
        model: OPENAI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 10000,
      } as any);

      const fullRaw = fullAiResponse.choices?.[0]?.message?.content ?? "{}";
      const fullParsed = JSON.parse(fullRaw) as AnyRecord;

      const mission = cleanString(fullParsed.mission, 240);
      const promise = cleanString(fullParsed.promise, 240);
      const positioning = cleanString(fullParsed.positioning, 320);
      const summary = cleanString(fullParsed.summary ?? fullParsed.strategy_summary ?? fullParsed.strategySummary, 2000);

      const persona = normalizePersona(asRecord(fullParsed.persona));

      const plan90Raw = asRecord(fullParsed.plan_90_days) ?? asRecord(fullParsed.plan90) ?? {};
      const tasksByTf = normalizeTasksByTimeframe(asRecord(plan90Raw.tasks_by_timeframe));

      // Offer audit & alternatives (only meaningful when user already has offers and is not satisfied)
      const offerAuditRaw = asRecord((fullParsed as any).offer_audit);
      const offerAudit = offerAuditRaw
        ? {
            diagnosis: cleanString((offerAuditRaw as any).diagnosis, 3000),
            quick_wins: asArray((offerAuditRaw as any).quick_wins)
              .map((x) => cleanString(x, 220))
              .filter(Boolean)
              .slice(0, 10),
            improvements: asArray((offerAuditRaw as any).improvements)
              .map((it) => {
                const r = asRecord(it) ?? {};
                const area = cleanString((r as any).area, 48);
                const recommendation = cleanString((r as any).recommendation, 1800);
                const test = cleanString((r as any).test, 600);
                return area || recommendation || test ? { ...(area ? { area } : {}), ...(recommendation ? { recommendation } : {}), ...(test ? { test } : {}) } : null;
              })
              .filter(Boolean)
              .slice(0, 12),
          }
        : null;

      const offerAlternatives = asArray((fullParsed as any).offer_alternatives)
        .map((a) => {
          const r = asRecord(a) ?? {};
          const angle = cleanString((r as any).angle, 140);
          const for_who = cleanString((r as any).for_who ?? (r as any).forWho, 220);
          const core_promise = cleanString((r as any).core_promise ?? (r as any).corePromise, 220);
          const suggested_changes = asArray((r as any).suggested_changes ?? (r as any).suggestedChanges)
            .map((x) => cleanString(x, 180))
            .filter(Boolean)
            .slice(0, 10);
          const first_test = cleanString((r as any).first_test ?? (r as any).firstTest, 320);
          if (!angle && !core_promise) return null;
          return { ...(angle ? { angle } : {}), ...(for_who ? { for_who } : {}), ...(core_promise ? { core_promise } : {}), ...(suggested_changes.length ? { suggested_changes } : {}), ...(first_test ? { first_test } : {}) };
        })
        .filter(Boolean)
        .slice(0, 6);

      const basePlan: AnyRecord = isRecord(existingPlanJson) ? existingPlanJson : {};

      const hasUsefulTasks = tasksByTimeframeLooksUseful({ plan_90_days: { tasks_by_timeframe: tasksByTf } } as any);

      const fallbackTasksByTf = hasUsefulTasks
        ? null
        : buildFallbackTasksByTimeframe(new Date(), {
            niche:
              cleanString((businessProfile as any)?.niche, 80) ||
              cleanString((businessProfile as any)?.business_type, 80) ||
              cleanString((businessProfile as any)?.activity, 80),
            mainGoal:
              cleanString((businessProfile as any)?.main_goal, 120) ||
              cleanString((businessProfile as any)?.goal, 120) ||
              cleanString((businessProfile as any)?.revenue_goal, 120),
            isAbsoluteBeginner: !isAffiliate && !hasOffersEffective,
          });

      const safePersona = personaLooksUseful(persona) ? persona : normalizePersona(asRecord(basePlan.persona)) ?? persona;
      const safeTasksByTf = normalizeTasksByTimeframe((fallbackTasksByTf ?? tasksByTf) as unknown as AnyRecord);

      const nextPlan: AnyRecord = {
        ...basePlan,
        offer_mode: isAffiliate ? "affiliate" : hasOffersEffective ? "existing_offer" : "none",
        offers_satisfaction: offersSatisfactionRaw || null,
        ...(shouldAuditOffers
          ? {
              offer_audit: offerAudit ?? (basePlan as any).offer_audit ?? null,
              offer_alternatives: offerAlternatives?.length ? offerAlternatives : (basePlan as any).offer_alternatives ?? [],
            }
          : {}),
        mission: cleanString(basePlan.mission, 240) || mission,
        promise: cleanString(basePlan.promise, 240) || promise,
        positioning: cleanString(basePlan.positioning, 320) || positioning,
        summary: cleanString(basePlan.summary ?? basePlan.strategy_summary ?? basePlan.strategySummary, 2000) || summary,
        persona: personaLooksUseful(asRecord(basePlan.persona)) ? basePlan.persona : safePersona,
        plan_90_days: {
          ...(asRecord(basePlan.plan_90_days) ?? {}),
          focus: cleanString(plan90Raw.focus, 200),
          milestones: asArray(plan90Raw.milestones).map((x) => cleanString(x, 180)).filter(Boolean).slice(0, 6),
          tasks_by_timeframe: tasksByTimeframeLooksUseful(basePlan)
            ? (asRecord((asRecord(basePlan.plan_90_days) ?? {}).tasks_by_timeframe) ??
                asRecord(basePlan.tasks_by_timeframe) ??
                safeTasksByTf)
            : safeTasksByTf,
        },
        strategy_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: savedFull, error: fullErr } = await supabase
        .from("business_plan")
        .upsert({ user_id: userId, ...(projectId ? { project_id: projectId } : {}), plan_json: nextPlan, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
        .select("id")
        .maybeSingle();

      if (fullErr) {
        console.error("Error saving business_plan full strategy (no offers):", fullErr);
        sendSSE("result", { success: false, error: fullErr.message }); return;
      }

      await persistStrategyRow({ supabase, userId, businessProfile: businessProfile as AnyRecord, planJson: nextPlan, projectId });

      try {
        const strategyId = await getOrCreateStrategyIdBestEffort({
          supabase,
          userId,
          businessProfile: businessProfile as AnyRecord,
          planJson: nextPlan,
          projectId,
        });

        await persistPersonaBestEffort({
          userId,
          strategyId,
          persona: normalizePersona(asRecord(nextPlan.persona)),
          projectId,
        });

        await enrichBusinessProfileMissionBestEffort({
          supabase,
          userId,
          persona: normalizePersona(asRecord(nextPlan.persona)),
          planJson: nextPlan,
          projectId,
        });
      } catch (e) {
        console.error("persona persistence error (non-blocking):", e);
      }

      sendSSE("result", { success: true, planId: savedFull?.id ?? null }); return;
    }

    /**
     * 9) Cas offres : si offre choisie -> générer full strategy
     */
    const selectedOffers = pickSelectedPyramidFromPlan(existingPlanJson);

    if (!selectedOffers) {
      sendSSE("result", {
        success: false,
        error: "selected_offer_pyramid is missing. Choose an offer set first (/api/strategy/offer-pyramid PATCH) before generating the full strategy.",
      }); return;
    }

    // ✅ crédits : 1 génération = 1 crédit
    try {
      await chargeCreditOrThrow({
        userId,
        feature: "strategy_full_from_pyramid",
        meta: { businessModel },
      });
    } catch (e) {
      if (isNoCreditsError(e)) {
        sendSSE("result", { success: false, error: "NO_CREDITS" }); return;
      }
      throw e;
    }

    const isBeginnerPath = !isAffiliate && !hasOffersEffective;

    const fullSystemPrompt = `Tu es Tipote™, un coach business senior (niveau mastermind) ET un stratège opérateur.

MISSION :
À partir du business_profile (onboarding), du diagnostic_profile (si présent) et de l'offre choisie, tu produis :
1) stratégie claire (mission, promesse, positionnement, résumé),
2) persona "terrain" du CLIENT IDEAL (pains, désirs, objections, déclencheurs, phrases exactes),
3) plan 90 jours exécutable (focus unique + milestones + tâches datées).

⚠️ DISTINCTION PROPRIETAIRE vs CLIENT IDEAL :
- Le "persona" décrit le CLIENT IDEAL (la cible, l'acheteur), PAS le propriétaire du business.
- Les champs "non_negotiables", "root_fear", "situation_tried", "tone_preference", "time_available" = contraintes du PROPRIETAIRE.
- Ne les attribue JAMAIS au persona du client idéal.

RÈGLES COACH-LEVEL :
- ZÉRO généralités.
- Respect strict des contraintes/non_negotiables si présentes (ce sont les contraintes du propriétaire pour le plan 90j, pas du persona).
- Cohérence totale avec l'offre choisie.
- 1 levier principal (focus).
- Min 6 tâches par timeframe, due_date valides.

🎯 ADAPTATION AU NIVEAU DU BUSINESS (CRITIQUE) :
- Si l'utilisateur a DÉJÀ des offres (surtout middle/high ticket, >1000€) : concentre-toi sur l'OPTIMISATION et le SCALE.
- Si l'utilisateur a déjà vendu et a un CA : NE PAS proposer de tâches de débutant (créer un lead magnet, définir sa niche, etc.).
- Analyse les offres (prix, format, volume) pour calibrer les tâches au niveau réel du business.
${buildRefusalsPromptSection(businessProfile as AnyRecord)}${isBeginnerPath ? `
CONTEXTE DÉBUTANT (IMPORTANT) :
L'utilisateur part de ZÉRO. Il n'a pas encore de clients ni de preuve sociale.
- Phase 1 (d30) : tâches de validation et construction des bases (niche, persona, présence, premiers contenus). PAS encore de vente forcée.
- Phase 2 (d60) : premières actions de monétisation simples (offre test, premiers clients).
- Phase 3 (d90) : structuration et mise à l'échelle à partir des premières preuves.
- Chaque tâche doit être faisable par quelqu'un qui débute, sans équipe ni budget.
- Commence par "Comment valider rapidement que des gens veulent payer pour ça ?"` : ""}

FORMAT JSON STRICT UNIQUEMENT :
{
  "mission": "string",
  "promise": "string",
  "positioning": "string",
  "summary": "string",
  "persona": {
    "title": "profil en 1 phrase",
    "pains": ["..."],
    "desires": ["..."],
    "channels": ["..."],
    "objections": ["..."],
    "triggers": ["..."],
    "exact_phrases": ["..."]
  },
  "plan_90_days": {
    "focus": "string",
    "milestones": ["...", "...", "..."],
    "tasks_by_timeframe": {
      "d30": [{ "title": "...", "due_date": "YYYY-MM-DD", "priority": "high|medium|low" }],
      "d60": [{ "title": "...", "due_date": "YYYY-MM-DD", "priority": "high|medium|low" }],
      "d90": [{ "title": "...", "due_date": "YYYY-MM-DD", "priority": "high|medium|low" }]
    }
  },
  "offer_audit": {
    "diagnosis": "string",
    "quick_wins": ["string","string","string"],
    "improvements": [
      { "area": "positioning|promise|pricing|packaging|delivery|funnel|traffic", "recommendation": "string", "test": "string (simple experiment 7-14 days)" }
    ]
  },
  "offer_alternatives": [
    { "angle": "string", "for_who": "string", "core_promise": "string", "suggested_changes": ["string"], "first_test": "string" }
  ]
}`.trim();

    const selectedChunks = pickTopResourceChunks({
      chunks: Array.isArray(resourceChunks) ? (resourceChunks as AnyRecord[]) : [],
      businessProfile: businessProfile as AnyRecord,
      selectedOffers,
      maxChunks: 18,
    });

    const fullUserPrompt = `Revenue goal (label) : ${cleanString(revenueGoalLabel, 240) || "N/A"}
Target monthly revenue (guess) : ${targetMonthlyRevGuess !== null ? String(targetMonthlyRevGuess) : "N/A"}

ONBOARDING FACTS (SOURCE DE VÉRITÉ)
${JSON.stringify(onboardingFacts ?? null, null, 2)}

SOURCE PRIORITAIRE — Diagnostic (si présent)
diagnostic_profile :
${JSON.stringify((businessProfile as any).diagnostic_profile ?? (businessProfile as any).diagnosticProfile ?? null, null, 2)}

diagnostic_summary :
${JSON.stringify((businessProfile as any).diagnostic_summary ?? (businessProfile as any).diagnosticSummary ?? null, null, 2)}

diagnostic_answers :
${JSON.stringify(((businessProfile as any).diagnostic_answers ?? (businessProfile as any).diagnosticAnswers ?? []) as any[], null, 2)}

DONNÉES FORMULAIRES (fallback)
${JSON.stringify(
  {
    niche: (businessProfile as any).niche ?? null,
    mission_statement: (businessProfile as any).mission_statement ?? (businessProfile as any).missionStatement ?? null,
    has_offers: (businessProfile as any).has_offers ?? null,
    offers: (businessProfile as any).offers ?? null,
    business_maturity: (businessProfile as any).business_maturity ?? null,
    current_monthly_revenue: ((businessProfile as any).diagnostic_answers as AnyRecord)?.currentMonthlyRevenue ?? null,
    has_already_sold: ((businessProfile as any).diagnostic_answers as AnyRecord)?.hasAlreadySold ?? null,
    weekly_hours: (businessProfile as any).weekly_hours ?? (businessProfile as any).weeklyHours ?? null,
    biggest_blocker: (businessProfile as any).biggest_blocker ?? (businessProfile as any).biggestBlocker ?? null,
    tone_preference: (businessProfile as any).tone_preference ?? (businessProfile as any).tonePreference ?? null,
    audience_email: (businessProfile as any).audience_email ?? null,
    audience_social: (businessProfile as any).audience_social ?? null,
  },
  null,
  2,
)}

OFFRE CHOISIE
${JSON.stringify(selectedOffers, null, 2)}

⚠️ OFFRES EXISTANTES DE L'UTILISATEUR (si applicable) :
${JSON.stringify((businessProfile as any).offers ?? [], null, 2)}
→ Adapte le plan 90j au niveau réel du business.

${competitorContext ? competitorContext + "\n" : ""}RESSOURCES INTERNES (résumé)
${JSON.stringify(resourcesForPrompt ?? [], null, 2)}

CHUNKS PERTINENTS (extraits)
${JSON.stringify(selectedChunks ?? [], null, 2)}

CONSINGNES
- Min 6 tâches par timeframe.
- due_date YYYY-MM-DD.
- Focus = 1 levier concret (tunnel lead magnet → low-ticket → high-ticket).
${competitorContext ? "- Intègre les insights de l'analyse concurrentielle dans le positionnement et la stratégie." : ""}`.trim();

    sendSSE("progress", { step: "Génération de la stratégie complète avec offres..." });
    const fullAiResponse = await ai.chat.completions.create({
      ...cachingParams("strategy_full"),
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: fullSystemPrompt },
        { role: "user", content: fullUserPrompt },
      ],
      max_completion_tokens: 10000,
    } as any);

    const fullRaw = fullAiResponse.choices?.[0]?.message?.content ?? "{}";
    const fullParsed = JSON.parse(fullRaw) as AnyRecord;

    const mission = cleanString(fullParsed.mission, 240);
    const promise = cleanString(fullParsed.promise, 240);
    const positioning = cleanString(fullParsed.positioning, 320);
    const summary = cleanString(fullParsed.summary ?? fullParsed.strategy_summary ?? fullParsed.strategySummary, 2000);

    const persona = normalizePersona(asRecord(fullParsed.persona));

    const plan90Raw = asRecord(fullParsed.plan_90_days) ?? asRecord(fullParsed.plan90) ?? {};
    const tasksByTf = normalizeTasksByTimeframe(asRecord(plan90Raw.tasks_by_timeframe));

    const basePlan: AnyRecord = isRecord(existingPlanJson) ? existingPlanJson : {};

    const hasUsefulTasks = tasksByTimeframeLooksUseful({ plan_90_days: { tasks_by_timeframe: tasksByTf } } as any);

    const isBeginnerOfferMode = cleanString(basePlan?.offer_mode, 32) === "none";
    const fallbackTasksByTf = hasUsefulTasks
      ? null
      : buildFallbackTasksByTimeframe(new Date(), {
          niche:
            cleanString((businessProfile as any)?.niche, 80) ||
            cleanString((businessProfile as any)?.business_type, 80) ||
            cleanString((businessProfile as any)?.activity, 80),
          mainGoal:
            cleanString((businessProfile as any)?.main_goal, 120) ||
            cleanString((businessProfile as any)?.goal, 120) ||
            cleanString((businessProfile as any)?.revenue_goal, 120),
          isAbsoluteBeginner: isBeginnerOfferMode,
        });

    const safePersona = personaLooksUseful(persona) ? persona : normalizePersona(asRecord(basePlan.persona)) ?? persona;
    const safeTasksByTf = normalizeTasksByTimeframe((fallbackTasksByTf ?? tasksByTf) as unknown as AnyRecord);

    const nextPlan: AnyRecord = {
      ...basePlan,
      ...(cleanString(basePlan.revenue_goal, 240) || revenueGoalLabel
        ? { revenue_goal: cleanString(basePlan.revenue_goal, 240) || revenueGoalLabel }
        : {}),
      horizon_days: toNumber(basePlan.horizon_days) ?? 90,
      ...(targetMonthlyRevGuess !== null ? { target_monthly_rev: targetMonthlyRevGuess } : {}),
      mission: cleanString(basePlan.mission, 240) || mission,
      promise: cleanString(basePlan.promise, 240) || promise,
      positioning: cleanString(basePlan.positioning, 320) || positioning,
      summary: cleanString(basePlan.summary ?? basePlan.strategy_summary ?? basePlan.strategySummary, 2000) || summary,
      persona: personaLooksUseful(asRecord(basePlan.persona)) ? basePlan.persona : safePersona,
      plan_90_days: {
        ...(asRecord(basePlan.plan_90_days) ?? {}),
        focus: cleanString(plan90Raw.focus, 200),
        milestones: asArray(plan90Raw.milestones).map((x) => cleanString(x, 180)).filter(Boolean).slice(0, 6),
        tasks_by_timeframe: tasksByTimeframeLooksUseful(basePlan)
          ? (asRecord((asRecord(basePlan.plan_90_days) ?? {}).tasks_by_timeframe) ??
              asRecord(basePlan.tasks_by_timeframe) ??
              safeTasksByTf)
          : safeTasksByTf,
      },
      strategy_generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: savedFull, error: fullErr } = await supabase
      .from("business_plan")
      .upsert({ user_id: userId, ...(projectId ? { project_id: projectId } : {}), plan_json: nextPlan, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .select("id")
      .maybeSingle();

    if (fullErr) {
      console.error("Error saving business_plan full strategy:", fullErr);
      sendSSE("result", { success: false, error: fullErr.message }); return;
    }

    await persistStrategyRow({ supabase, userId, businessProfile: businessProfile as AnyRecord, planJson: nextPlan, projectId });

    try {
      const strategyId = await getOrCreateStrategyIdBestEffort({
        supabase,
        userId,
        businessProfile: businessProfile as AnyRecord,
        planJson: nextPlan,
        projectId,
      });

      await persistPersonaBestEffort({
        userId,
        strategyId,
        persona: normalizePersona(asRecord(nextPlan.persona)),
        projectId,
      });

      await enrichBusinessProfileMissionBestEffort({
        supabase,
        userId,
        persona: normalizePersona(asRecord(nextPlan.persona)),
        planJson: nextPlan,
        projectId,
      });
    } catch (e) {
      console.error("persona persistence error (non-blocking):", e);
    }

    sendSSE("result", { success: true, planId: savedFull?.id ?? null });
      } catch (err: any) {
        if (isNoCreditsError(err)) {
          sendSSE("result", { success: false, error: "NO_CREDITS" });
        } else {
          console.error("Unhandled error in /api/strategy:", err);
          sendSSE("error", { success: false, error: err instanceof Error ? err.message : "Internal server error" });
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
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
