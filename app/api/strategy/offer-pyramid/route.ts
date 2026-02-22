// app/api/strategy/offer-pyramid/route.ts
// ✅ Génère les offres (si besoin) + sauvegarde dans business_plan.plan_json
// ✅ PATCH : sauvegarde le choix (selected_offer_pyramid_index + selected_offer_pyramid) dans business_plan
// ✅ POST : si offres manquantes -> génère ; si offre choisie + stratégie incomplète -> génère stratégie complète (persona + plan 90j)
// ✅ Best-effort sync (ne casse jamais le flux si erreur DB) :
//    - public.strategies (ligne par user)
//    - public.offer_pyramids (3 lignes par offre : lead/low/high)
//    - public.personas (colonnes lisibles + persona_json JSONB complet)

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
    const s = v.trim().replace(",", ".");
    const n = Number(s);
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

function pickRevenueGoalLabel(businessProfile: AnyRecord): string {
  const monthly = cleanString(businessProfile.revenue_goal_monthly, 64);
  if (monthly) return monthly;

  const direct = cleanString(businessProfile.target_monthly_revenue, 64) || cleanString(businessProfile.revenue_goal, 240);
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
 * Retrieval (best-effort)
 * -----------------------
 */
function extractAnyText(obj: AnyRecord | null, maxLen = 2200): string {
  if (!obj) return "";
  const candidates = [
    obj.content,
    obj.text,
    obj.chunk,
    obj.body,
    obj.markdown,
    obj.html,
    obj.summary,
    obj.description,
    obj.excerpt,
    obj.title,
    obj.name,
  ]
    .map((x) => cleanString(x, maxLen))
    .filter(Boolean);

  if (!candidates.length) {
    try {
      const s = JSON.stringify(obj);
      return cleanString(s, maxLen);
    } catch {
      return "";
    }
  }
  return cleanString(candidates.join("\n"), maxLen);
}

function tokenize(s: string): string[] {
  const base = (s || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (!base) return [];
  const parts = base.split(/\s+/g).filter(Boolean);
  return parts.filter((t) => t.length >= 3 && t.length <= 32);
}

function scoreTextByQuery(text: string, queryTokens: string[]): number {
  if (!text || !queryTokens.length) return 0;
  const t = text.toLowerCase();
  let score = 0;
  for (const q of queryTokens) {
    let idx = 0;
    let hits = 0;
    while (true) {
      idx = t.indexOf(q, idx);
      if (idx === -1) break;
      hits++;
      idx += q.length;
      if (hits >= 6) break;
    }
    if (hits) score += hits * (q.length >= 6 ? 3 : 2);
  }
  if (t.includes("checklist") || t.includes("framework") || t.includes("template") || t.includes("exemple")) score += 4;
  return score;
}

function buildRetrievalQuery(params: { businessProfile: AnyRecord; selectedOffers?: AnyRecord | null }): string {
  const bp = params.businessProfile ?? {};
  const pyr = params.selectedOffers ?? {};

  const niche = cleanString(bp.niche ?? bp.market ?? bp.activity ?? bp.business_type, 120);
  const goal = cleanString(bp.main_goal_90_days ?? bp.main_goal ?? bp.goal ?? bp.revenue_goal, 180);
  const blocker = cleanString(bp.biggest_blocker ?? bp.biggestBlocker, 160);
  const maturity = cleanString(bp.maturity, 80);

  const offerBits = [
    cleanString(pyr?.name, 160),
    cleanString(pyr?.strategy_summary, 280),
    cleanString(pyr?.lead_magnet?.title, 160),
    cleanString(pyr?.low_ticket?.title, 160),
    cleanString(pyr?.high_ticket?.title, 160),
  ].filter(Boolean);

  return [niche && `niche ${niche}`, goal && `objectif ${goal}`, blocker && `blocage ${blocker}`, maturity && `maturité ${maturity}`, ...offerBits]
    .filter(Boolean)
    .join(" | ");
}

function selectRelevantContext(params: {
  resources: AnyRecord[];
  resourceChunks: AnyRecord[];
  businessProfile: AnyRecord;
  selectedOffers?: AnyRecord | null;
  maxResources?: number;
  maxChunks?: number;
}): { pickedResources: AnyRecord[]; pickedChunks: AnyRecord[]; contextBlock: string } {
  const { resources, resourceChunks, businessProfile, selectedOffers = null, maxResources = 6, maxChunks = 12 } = params;

  const query = buildRetrievalQuery({ businessProfile, selectedOffers });
  const qTokens = tokenize(query);

  const scoredResources = (Array.isArray(resources) ? resources : [])
    .map((r) => {
      const rec = asRecord(r) ?? {};
      const txt = extractAnyText(rec, 2200);
      const score = scoreTextByQuery(txt, qTokens);
      return { rec, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResources)
    .filter((x) => x.score > 0);

  const scoredChunks = (Array.isArray(resourceChunks) ? resourceChunks : [])
    .map((c) => {
      const rec = asRecord(c) ?? {};
      const txt = extractAnyText(rec, 2200);
      const score = scoreTextByQuery(txt, qTokens);
      return { rec, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks)
    .filter((x) => x.score > 0);

  const pickedResources = scoredResources.map((x) => x.rec);
  const pickedChunks = scoredChunks.map((x) => x.rec);

  const contextLines: string[] = [];
  if (pickedResources.length) {
    contextLines.push("RESSOURCES PERTINENTES (extraits):");
    pickedResources.forEach((r, i) => {
      const id = cleanString(r.id ?? r.slug ?? r.resource_id ?? "", 64);
      const title = cleanString(r.title ?? r.name ?? "Ressource", 140);
      const excerpt = extractAnyText(r, 900);
      contextLines.push(`- [R${i + 1}] ${id ? `(${id}) ` : ""}${title}\n${excerpt}`);
    });
  }
  if (pickedChunks.length) {
    contextLines.push("CHUNKS PERTINENTS (extraits):");
    pickedChunks.forEach((c, i) => {
      const id = cleanString(c.id ?? c.chunk_id ?? c.resource_id ?? "", 64);
      const title = cleanString(c.title ?? c.heading ?? c.section ?? "", 140);
      const excerpt = extractAnyText(c, 900);
      contextLines.push(`- [C${i + 1}] ${id ? `(${id}) ` : ""}${title}\n${excerpt}`);
    });
  }

  return { pickedResources, pickedChunks, contextBlock: contextLines.join("\n\n") };
}

/**
 * -----------------------
 * Offers normalization
 * -----------------------
 */
function normalizeOffer(offer: AnyRecord | null): AnyRecord | null {
  if (!offer) return null;
  const title = cleanString(offer.title ?? offer.nom ?? offer.name, 160);
  const composition = cleanString(offer.composition ?? offer.contenu ?? "", 2000);
  const purpose = cleanString(offer.purpose ?? offer.objectif ?? offer.benefit ?? "", 800);
  const format = cleanString(offer.format ?? offer.type ?? "", 180);
  const insight = cleanString(offer.insight ?? offer.angle ?? "", 800);
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

/**
 * -----------------------
 * Tasks / Persona utils
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
  const d30 = asArray(grouped.d30).map((x) => normalizeTaskItem(asRecord(x))).filter(Boolean).slice(0, 60);
  const d60 = asArray(grouped.d60).map((x) => normalizeTaskItem(asRecord(x))).filter(Boolean).slice(0, 60);
  const d90 = asArray(grouped.d90).map((x) => normalizeTaskItem(asRecord(x))).filter(Boolean).slice(0, 60);
  return { d30, d60, d90 };
}

function addDaysISO(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function buildFallbackTasksByTimeframe(
  base: Date,
  context: { niche?: string; mainGoal?: string } = {},
): { d30: AnyRecord[]; d60: AnyRecord[]; d90: AnyRecord[] } {
  const niche = cleanString(context.niche, 80) || "votre business";
  const goal = cleanString(context.mainGoal, 120) || "atteindre vos objectifs";

  const d30Titles = [
    `Clarifier la promesse et le positionnement pour ${niche}`,
    `Définir l'offre lead magnet (titre, format, bénéfice, livrables)`,
    `Créer la page de capture + séquence email de bienvenue`,
    `Lister 30 idées de contenus alignées sur ${goal}`,
    `Mettre en place un calendrier de contenu (2-3 posts/sem)`,
    `Suivre les métriques de base (leads, trafic, conversion)`,
  ];
  const d60Titles = [
    `Construire l'offre low-ticket (structure + prix + valeur)`,
    `Rédiger la page de vente low-ticket (problème → solution → preuves)`,
    `Lancer 1 campagne d'acquisition (social / email / partenariats)`,
    `Collecter 5 retours clients et ajuster l'offre`,
    `Mettre en place un process de production de contenu récurrent`,
    `Optimiser le tunnel (conversion page, emails, CTA)`,
  ];
  const d90Titles = [
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

function personaLooksUseful(persona: AnyRecord | null): boolean {
  if (!persona) return false;
  const title = cleanString(persona.title ?? persona.profile ?? persona.name, 120);
  const pains = asArray(persona.pains).filter((x) => !!cleanString(x, 2));
  const desires = asArray(persona.desires).filter((x) => !!cleanString(x, 2));
  return !!title || pains.length >= 2 || desires.length >= 2;
}

function normalizePersona(persona: AnyRecord | null): AnyRecord | null {
  if (!persona) return null;

  const title = cleanString(persona.title ?? persona.profile ?? persona.name, 240);

  const pains = asArray(persona.pains).map((x) => cleanString(x, 240)).filter(Boolean);
  const desires = asArray(persona.desires).map((x) => cleanString(x, 240)).filter(Boolean);
  const objections = asArray(persona.objections).map((x) => cleanString(x, 240)).filter(Boolean);

  const channels = asArray(persona.channels).map((x) => cleanString(x, 120)).filter(Boolean);
  const triggers = asArray(persona.triggers ?? persona.purchase_triggers).map((x) => cleanString(x, 240)).filter(Boolean);
  const exact_phrases = asArray(persona.exact_phrases ?? persona.expressions).map((x) => cleanString(x, 240)).filter(Boolean);

  const results_short_term = asArray(persona.results_short_term ?? persona.resultsShortTerm)
    .map((x) => cleanString(x, 240))
    .filter(Boolean);
  const results_mid_term = asArray(persona.results_mid_term ?? persona.resultsMidTerm)
    .map((x) => cleanString(x, 240))
    .filter(Boolean);
  const results_long_term = asArray(persona.results_long_term ?? persona.resultsLongTerm)
    .map((x) => cleanString(x, 240))
    .filter(Boolean);

  const daily_exasperations = asArray(persona.daily_exasperations ?? persona.dailyExasperations)
    .map((x) => cleanString(x, 240))
    .filter(Boolean);
  const emotions_wanted = asArray(persona.emotions_wanted ?? persona.emotionsWanted)
    .map((x) => cleanString(x, 240))
    .filter(Boolean);
  const tried_solutions = asArray(persona.tried_solutions ?? persona.triedSolutions)
    .map((x) => cleanString(x, 240))
    .filter(Boolean);
  const limiting_beliefs = asArray(persona.limiting_beliefs ?? persona.limitingBeliefs)
    .map((x) => cleanString(x, 240))
    .filter(Boolean);
  const values = asArray(persona.values ?? persona.valeurs).map((x) => cleanString(x, 160)).filter(Boolean);

  const current_situation = cleanString(persona.current_situation ?? persona.currentSituation, 6000);
  const desired_situation = cleanString(persona.desired_situation ?? persona.desiredSituation, 6000);
  const internal_dialogue = cleanString(persona.internal_dialogue ?? persona.dialogue_interne ?? persona.internalDialogue, 6000);

  const first_action_if_fixed = cleanString(persona.first_action_if_fixed ?? persona.firstActionIfFixed, 800);
  const true_motivation = cleanString(persona.true_motivation ?? persona.trueMotivation, 4000);
  const day_with_problem = cleanString(persona.day_with_problem ?? persona.dayWithProblem, 6000);
  const ideal_life_5_10y = cleanString(persona.ideal_life_5_10y ?? persona.idealLife5_10y ?? persona.idealLife, 6000);
  const worst_nightmare = cleanString(persona.worst_nightmare ?? persona.worstNightmare, 4000);

  const awareness_level = cleanString(persona.awareness_level ?? persona.awarenessLevel ?? "", 80);
  const budget_level = cleanString(persona.budget_level ?? persona.budgetLevel ?? "", 80);

  const competitor_analysis = asRecord(persona.competitor_analysis ?? persona.competitorAnalysis) ?? null;
  const summary_block = asRecord(persona.summary_block ?? persona.summaryBlock) ?? null;

  const result: AnyRecord = {
    title,
    pains,
    desires,
    objections,
    channels,
    triggers,
    exact_phrases,
    results_short_term,
    results_mid_term,
    results_long_term,
    current_situation,
    desired_situation,
    internal_dialogue,
    daily_exasperations,
    emotions_wanted,
    tried_solutions,
    limiting_beliefs,
    values,
    first_action_if_fixed,
    true_motivation,
    day_with_problem,
    ideal_life_5_10y,
    worst_nightmare,
    awareness_level,
    budget_level,
    competitor_analysis,
    summary_block,
  };

  return personaLooksUseful(result) ? result : null;
}

function tasksByTimeframeLooksUseful(planJson: AnyRecord | null): boolean {
  if (!planJson) return false;
  const plan90 = asRecord(planJson.plan_90_days) || asRecord(planJson.plan90) || asRecord(planJson.plan_90);
  const grouped = asRecord(plan90?.tasks_by_timeframe ?? planJson.tasks_by_timeframe);
  if (!grouped) return false;
  const d30 = asArray(grouped.d30).length;
  const d60 = asArray(grouped.d60).length;
  const d90 = asArray(grouped.d90).length;
  return d30 + d60 + d90 >= 10;
}
function strategyTextLooksUseful(planJson: AnyRecord | null): boolean {
  if (!planJson) return false;
  const mission = cleanString(planJson.mission, 240);
  const promise = cleanString(planJson.promise, 240);
  const positioning = cleanString(planJson.positioning, 320);
  const summary = cleanString(planJson.summary ?? planJson.strategy_summary ?? planJson.strategySummary, 1600);
  return !!mission || !!promise || !!positioning || !!summary;
}
function fullStrategyLooksUseful(planJson: AnyRecord | null): boolean {
  if (!planJson) return false;
  return personaLooksUseful(asRecord(planJson.persona)) && tasksByTimeframeLooksUseful(planJson) && strategyTextLooksUseful(planJson);
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

/**
 * -----------------------
 * ✅ BEST-EFFORT SYNC (ADMIN)
 * -----------------------
 */
async function persistStrategyRowBestEffort(params: { userId: string; businessProfile: AnyRecord; planJson: AnyRecord; projectId?: string | null }): Promise<string | null> {
  const { userId, businessProfile, planJson, projectId } = params;
  try {
    const businessProfileId = cleanString(businessProfile.id, 80) || null;
    const horizonDays = toNumber(planJson.horizon_days) ?? toNumber(planJson.horizonDays) ?? 90;

    const targetMonthlyRev =
      toNumber(planJson.target_monthly_rev) ??
      toNumber(planJson.target_monthly_revenue) ??
      parseMoneyFromText(planJson.target_monthly_rev) ??
      parseMoneyFromText(planJson.target_monthly_revenue) ??
      parseMoneyFromText(planJson.revenue_goal) ??
      parseMoneyFromText(planJson.goal_revenue) ??
      parseMoneyFromText(planJson.main_goal) ??
      parseMoneyFromText(businessProfile.revenue_goal_monthly) ??
      parseMoneyFromText(businessProfile.target_monthly_revenue) ??
      parseMoneyFromText(businessProfile.revenue_goal);

    const title = cleanString(planJson.title ?? planJson.summary ?? planJson.strategy_summary ?? "Ma stratégie", 180) || "Ma stratégie";

    const payload: AnyRecord = {
      user_id: userId,
      ...(projectId ? { project_id: projectId } : {}),
      ...(businessProfileId ? { business_profile_id: businessProfileId } : {}),
      title,
      horizon_days: horizonDays,
      ...(targetMonthlyRev !== null ? { target_monthly_rev: targetMonthlyRev } : {}),
      updated_at: new Date().toISOString(),
    };

    const upsertRes = await supabaseAdmin.from("strategies").upsert(payload, { onConflict: "user_id" }).select("id").maybeSingle();
    if (upsertRes?.error) {
      console.error("persistStrategyRowBestEffort upsert error:", upsertRes.error);
      return null;
    }
    return upsertRes?.data?.id ? String(upsertRes.data.id) : null;
  } catch (e) {
    console.error("persistStrategyRowBestEffort unexpected error:", e);
    return null;
  }
}

async function getOrCreateStrategyIdBestEffort(params: { userId: string; businessProfile: AnyRecord; planJson: AnyRecord; projectId?: string | null }): Promise<string | null> {
  const { userId, businessProfile, planJson, projectId } = params;

  try {
    let readQuery = supabaseAdmin.from("strategies").select("id").eq("user_id", userId);
    if (projectId) readQuery = readQuery.eq("project_id", projectId);
    const readRes = await readQuery.maybeSingle();
    if (readRes?.data?.id) return String(readRes.data.id);

    const created = await persistStrategyRowBestEffort({ userId, businessProfile, planJson, projectId });
    if (created) return created;

    let readQuery2 = supabaseAdmin.from("strategies").select("id").eq("user_id", userId);
    if (projectId) readQuery2 = readQuery2.eq("project_id", projectId);
    const readRes2 = await readQuery2.maybeSingle();
    if (readRes2?.data?.id) return String(readRes2.data.id);
  } catch (e) {
    console.error("getOrCreateStrategyIdBestEffort error:", e);
  }
  return null;
}

async function persistOfferPyramidsBestEffort(params: {
  userId: string;
  strategyId: string | null;
  pyramids: AnyRecord[];
  selectedIndex: number | null;
  projectId?: string | null;
}): Promise<void> {
  const { userId, strategyId, pyramids, selectedIndex, projectId } = params;
  if (!Array.isArray(pyramids) || pyramids.length < 1) return;

  const now = new Date().toISOString();

  // Map internal names → DB enum (offer_level): lead_magnet, entry, core, premium
  const DB_LEVEL_MAP: Record<string, string> = {
    lead_magnet: "lead_magnet",
    low_ticket: "entry",
    middle_ticket: "core",
    high_ticket: "premium",
  };

  function mkRow(args: {
    offerSetName: string;
    offerSetSummary: string;
    level: "lead_magnet" | "low_ticket" | "middle_ticket" | "high_ticket";
    offer: AnyRecord;
    isFlagship: boolean;
  }): AnyRecord {
    const title = cleanString(args.offer.title, 160);
    const format = cleanString(args.offer.format, 180);
    const composition = cleanString(args.offer.composition, 2000);
    const purpose = cleanString(args.offer.purpose, 800);
    const insight = cleanString(args.offer.insight, 800);
    const price = toNumber(args.offer.price);

    return {
      user_id: userId,
      ...(projectId ? { project_id: projectId } : {}),
      ...(strategyId ? { strategy_id: strategyId } : {}),
      level: DB_LEVEL_MAP[args.level] ?? args.level,
      name: cleanString(`${args.offerSetName} — ${title || args.level}`, 240) || args.level,
      description: cleanString(`${args.offerSetSummary}\n\n${composition}`, 4000),
      promise: purpose,
      format,
      delivery: insight,
      ...(price !== null ? { price_min: price, price_max: price } : {}),
      main_outcome: purpose,
      is_flagship: !!args.isFlagship,
      updated_at: now,
    };
  }

  const rows: AnyRecord[] = [];
  pyramids.forEach((p, idx) => {
    const offerSetName = cleanString(p.name, 160) || `Offre ${idx + 1}`;
    const offerSetSummary = cleanString(p.strategy_summary, 1200);

    const lead = asRecord(p.lead_magnet);
    const low = asRecord(p.low_ticket);
    const mid = asRecord(p.middle_ticket);
    const high = asRecord(p.high_ticket);

    const isSelected = typeof selectedIndex === "number" && idx === selectedIndex;

    if (lead) rows.push(mkRow({ offerSetName, offerSetSummary, level: "lead_magnet", offer: lead, isFlagship: isSelected }));
    if (low) rows.push(mkRow({ offerSetName, offerSetSummary, level: "low_ticket", offer: low, isFlagship: isSelected }));
    if (mid) rows.push(mkRow({ offerSetName, offerSetSummary, level: "middle_ticket", offer: mid, isFlagship: isSelected }));
    if (high) rows.push(mkRow({ offerSetName, offerSetSummary, level: "high_ticket", offer: high, isFlagship: isSelected }));
  });

  if (!rows.length) return;

  try {
    let delQuery = supabaseAdmin.from("offer_pyramids").delete().eq("user_id", userId);
    if (projectId) delQuery = delQuery.eq("project_id", projectId);
    const del = await delQuery;
    if (del?.error) console.error("persistOfferPyramidsBestEffort delete error:", del.error);

    const ins = await supabaseAdmin.from("offer_pyramids").insert(rows);
    if (ins?.error) console.error("persistOfferPyramidsBestEffort insert error:", ins.error);
  } catch (e) {
    console.error("persistOfferPyramidsBestEffort unexpected error:", e);
  }
}

async function persistPersonaBestEffort(params: { userId: string; strategyId: string | null; persona: AnyRecord | null; projectId?: string | null }): Promise<void> {
  const { userId, strategyId, persona, projectId } = params;
  if (!persona || !personaLooksUseful(persona)) return;

  const now = new Date().toISOString();

  const payload: AnyRecord = {
    user_id: userId,
    ...(projectId ? { project_id: projectId } : {}),
    ...(strategyId ? { strategy_id: strategyId } : {}),
    name: cleanString(persona.title, 240) || null,
    role: "client_ideal",
    description: cleanString(persona.current_situation ?? persona.description ?? "", 4000) || null,
    pains: cleanString(JSON.stringify(persona.pains ?? [], null, 2), 4000),
    desires: cleanString(JSON.stringify(persona.desires ?? [], null, 2), 4000),
    objections: cleanString(JSON.stringify(persona.objections ?? [], null, 2), 4000),
    current_situation: cleanString(persona.current_situation ?? "", 6000) || null,
    desired_situation: cleanString(persona.desired_situation ?? "", 6000) || null,
    awareness_level: cleanString(persona.awareness_level ?? "", 120) || null,
    budget_level: cleanString(persona.budget_level ?? "", 120) || null,
    persona_json: persona,
    updated_at: now,
  };

  try {
    const up = await supabaseAdmin.from("personas").upsert(payload, { onConflict: "user_id" });
    if (up?.error) {
      const ins = await supabaseAdmin.from("personas").insert(payload);
      if (ins?.error) console.error("persistPersonaBestEffort insert error:", ins.error);
    }
  } catch (e) {
    console.error("persistPersonaBestEffort unexpected error:", e);
  }
}

async function enrichBusinessProfileMissionBestEffort(params: {
  supabase: any;
  userId: string;
  persona: AnyRecord | null;
  planJson: AnyRecord | null;
  projectId?: string | null;
}): Promise<void> {
  const { supabase, userId, persona, planJson, projectId } = params;
  if (!persona) return;

  try {
    const parts: string[] = [];
    const title = cleanString(persona.title ?? persona.profile ?? persona.name, 200);
    if (title) parts.push(title);

    const pains = asArray(persona.pains).map((x) => cleanString(x, 160)).filter(Boolean);
    if (pains.length > 0) parts.push(`Douleurs principales : ${pains.slice(0, 4).join(" ; ")}.`);

    const desires = asArray(persona.desires).map((x) => cleanString(x, 160)).filter(Boolean);
    if (desires.length > 0) parts.push(`Désirs : ${desires.slice(0, 4).join(" ; ")}.`);

    const objections = asArray(persona.objections).map((x) => cleanString(x, 160)).filter(Boolean);
    if (objections.length > 0) parts.push(`Objections fréquentes : ${objections.slice(0, 3).join(" ; ")}.`);

    const channels = asArray(persona.channels).map((x) => cleanString(x, 80)).filter(Boolean);
    if (channels.length > 0) parts.push(`Canaux préférés : ${channels.join(", ")}.`);

    const summary = parts.join("\n");
    if (!summary.trim()) return;

    const patch: AnyRecord = { mission: summary, updated_at: new Date().toISOString() };
    const positioning = cleanString(planJson?.positioning, 300);
    if (positioning) patch.niche = positioning;

    let bpUpdateQuery = supabase.from("business_profiles").update(patch).eq("user_id", userId);
    if (projectId) bpUpdateQuery = bpUpdateQuery.eq("project_id", projectId);
    await bpUpdateQuery;
  } catch (e) {
    console.error("enrichBusinessProfileMissionBestEffort error (non-blocking):", e);
  }
}

/**
 * -----------------------
 * GET (for onboarding UI)
 * -----------------------
 */
export async function GET(_req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session?.user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    const userId = session.user.id;
    const projectId = await getActiveProjectId(supabase, userId);

    let bpQuery = supabase.from("business_profiles").select("*").eq("user_id", userId);
    if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
    const { data: businessProfile } = await bpQuery.maybeSingle();

    const onboardingFacts: Record<string, unknown> = {};
    try {
      let factsQuery = supabase.from("onboarding_facts").select("key,value").eq("user_id", userId);
      if (projectId) factsQuery = factsQuery.eq("project_id", projectId);
      const { data: rows } = await factsQuery;
      for (const r of rows ?? []) {
        if (!r?.key) continue;
        onboardingFacts[String((r as any).key)] = (r as any).value;
      }
    } catch {
      // ignore
    }

    const businessModel = cleanString((onboardingFacts as any)["business_model"], 40).toLowerCase();
    const isAffiliate =
      businessModel === "affiliate" ||
      businessModel === "affiliation" ||
      businessModel === "affiliate_marketing" ||
      businessModel === "affiliate-marketing";

    const hasOffersEffective =
      (onboardingFacts as any)["has_offers"] === true ||
      (businessProfile as any)?.has_offers === true ||
      (Array.isArray((businessProfile as any)?.offers) && (businessProfile as any).offers.length > 0);

    const offerMode = isAffiliate ? "affiliate" : hasOffersEffective ? "existing_offer" : "none";
    const shouldGenerateOffers = !isAffiliate && !hasOffersEffective;

    let planQuery = supabase.from("business_plan").select("plan_json").eq("user_id", userId);
    if (projectId) planQuery = planQuery.eq("project_id", projectId);
    const { data: planRow } = await planQuery.maybeSingle();
    const planJson = (planRow?.plan_json ?? null) as AnyRecord | null;

    const offer_pyramids = planJson ? asArray((planJson as any).offer_pyramids) : [];
    const selected_offer_pyramid_index =
      typeof (planJson as any)?.selected_offer_pyramid_index === "number"
        ? (planJson as any).selected_offer_pyramid_index
        : typeof (planJson as any)?.selected_pyramid_index === "number"
          ? (planJson as any).selected_pyramid_index
          : null;

    return NextResponse.json(
      {
        success: true,
        offer_mode: offerMode,
        shouldGenerateOffers,
        offer_pyramids,
        selected_offer_pyramid_index,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Unhandled error in GET /api/strategy/offer-pyramid:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

/**
 * -----------------------
 * PATCH
 * -----------------------
 */
export async function PATCH(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session?.user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    const userId = session.user.id;
    const projectId = await getActiveProjectId(supabase, userId);

    const body = (await req.json().catch(() => ({}))) as AnyRecord;
    const selectedIndexRaw = body?.selectedIndex;
    const pyramidRaw = body?.pyramid;

    const selectedIndex =
      typeof selectedIndexRaw === "number" ? selectedIndexRaw : typeof selectedIndexRaw === "string" ? Number(selectedIndexRaw) : null;

    if (selectedIndex === null || !Number.isFinite(selectedIndex) || selectedIndex < 0) {
      return NextResponse.json({ success: false, error: "Invalid selectedIndex" }, { status: 400 });
    }

    let patchPlanQuery = supabase.from("business_plan").select("plan_json").eq("user_id", userId);
    if (projectId) patchPlanQuery = patchPlanQuery.eq("project_id", projectId);
    const { data: planRow, error: planErr } = await patchPlanQuery.maybeSingle();
    if (planErr) console.error("Error reading business_plan for PATCH:", planErr);

    const basePlan: AnyRecord = isRecord(planRow?.plan_json) ? (planRow?.plan_json as AnyRecord) : {};

    let pyramid: AnyRecord | null = asRecord(pyramidRaw);

    if (!pyramid) {
      const pyramidsArr = asArray(basePlan.offer_pyramids);
      const picked = pyramidsArr[selectedIndex];
      pyramid = asRecord(picked);

      if (!pyramid) {
        return NextResponse.json(
          { success: false, error: "Missing offer set: no offer set provided and offer_pyramids[selectedIndex] not found" },
          { status: 400 },
        );
      }
    }

    const nextPlan: AnyRecord = {
      ...basePlan,
      selected_offer_pyramid_index: selectedIndex,
      selected_offer_pyramid: pyramid,

      // compat legacy
      selected_pyramid_index: selectedIndex,
      selected_pyramid: pyramid,

      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveErr } = await supabase
      .from("business_plan")
      .upsert({ user_id: userId, ...(projectId ? { project_id: projectId } : {}), plan_json: nextPlan, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .select("id")
      .maybeSingle();

    if (saveErr) {
      console.error("Error saving selection in business_plan:", saveErr);
      return NextResponse.json({ success: false, error: saveErr.message }, { status: 500 });
    }

    try {
      let patchBpQuery = supabase.from("business_profiles").select("*").eq("user_id", userId);
      if (projectId) patchBpQuery = patchBpQuery.eq("project_id", projectId);
      const { data: businessProfile } = await patchBpQuery.maybeSingle();
      if (businessProfile) {
        const strategyId = await getOrCreateStrategyIdBestEffort({
          userId,
          businessProfile: businessProfile as AnyRecord,
          planJson: nextPlan,
          projectId,
        });

        const pyramids = asArray(nextPlan.offer_pyramids)
          .map((p, idx) => normalizeOfferSet(asRecord(p), idx))
          .filter((x) => !!x && !!x.lead_magnet && (!!x.low_ticket || !!x.middle_ticket) && !!x.high_ticket);

        if (pyramids.length) {
          await persistOfferPyramidsBestEffort({ userId, strategyId, pyramids, selectedIndex, projectId });
        } else {
          const normalizedSelected = normalizeOfferSet(pyramid, 0);
          await persistOfferPyramidsBestEffort({ userId, strategyId, pyramids: [normalizedSelected], selectedIndex: 0, projectId });
        }
      }
    } catch (e) {
      console.error("PATCH best-effort sync unexpected error:", e);
    }

    return NextResponse.json({ success: true, planId: saved?.id ?? null }, { status: 200 });
  } catch (err) {
    console.error("Unhandled error in PATCH /api/strategy/offer-pyramid:", err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 });
  }
}

/**
 * -----------------------
 * POST — SSE stream with heartbeats to prevent proxy 504 timeout
 * Generates offer pyramids ONLY (not full strategy).
 * -----------------------
 */
export async function POST(req: Request) {
  // ── Pre-validate synchronously before starting the stream ──────────
  let supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  let userId: string;
  let projectId: string | null;

  try {
    supabase = await getSupabaseServerClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    userId = session.user.id;
    projectId = await getActiveProjectId(supabase, userId);

    if (!openai) {
      return NextResponse.json({ success: false, error: "AI client not configured (strategy disabled)" }, { status: 500 });
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

    let postPlanQuery = supabase.from("business_plan").select("plan_json").eq("user_id", userId);
    if (projectId) postPlanQuery = postPlanQuery.eq("project_id", projectId);
    const { data: existingPlan, error: existingPlanError } = await postPlanQuery.maybeSingle();
    if (existingPlanError) console.error("Error checking existing business_plan:", existingPlanError);

    const existingPlanJson = (existingPlan?.plan_json ?? null) as AnyRecord | null;

    const existingOffers = existingPlanJson ? asArray(existingPlanJson.offer_pyramids) : [];
    const hasUsefulOffers = offersLookUseful(existingOffers);

    // If we already have useful offers, return them immediately
    if (hasUsefulOffers) {
      sendSSE("result", { success: true, skipped: true, reason: "already_generated", offer_pyramids: existingOffers });
      clearInterval(heartbeat);
      controller.close();
      return;
    }

    let postBpQuery = supabase.from("business_profiles").select("*").eq("user_id", userId);
    if (projectId) postBpQuery = postBpQuery.eq("project_id", projectId);
    const { data: businessProfile, error: profileError } = await postBpQuery.single();
    if (profileError || !businessProfile) {
      console.error("Business profile error:", profileError);
      sendSSE("error", { success: false, error: `Business profile missing: ${profileError?.message ?? "unknown"}` });
      clearInterval(heartbeat);
      controller.close();
      return;
    }

    // -----------------------
    // Offer mode (new onboarding)
    // -----------------------
    const onboardingFacts: Record<string, unknown> = {};
    try {
      let postFactsQuery = supabase.from("onboarding_facts").select("key,value").eq("user_id", userId);
      if (projectId) postFactsQuery = postFactsQuery.eq("project_id", projectId);
      const { data: rows } = await postFactsQuery;
      for (const r of rows ?? []) {
        if (!r?.key) continue;
        onboardingFacts[String((r as any).key)] = (r as any).value;
      }
    } catch {
      // ignore
    }

    const businessModel = cleanString((onboardingFacts as any)["business_model"], 40).toLowerCase();
    const isAffiliate =
      businessModel === "affiliate" ||
      businessModel === "affiliation" ||
      businessModel === "affiliate_marketing" ||
      businessModel === "affiliate-marketing";

    const hasOffersEffective =
      (onboardingFacts as any)["has_offers"] === true ||
      (businessProfile as any)?.has_offers === true ||
      (Array.isArray((businessProfile as any)?.offers) && (businessProfile as any).offers.length > 0);

    const offerMode = isAffiliate ? "affiliate" : hasOffersEffective ? "existing_offer" : "none";
    const shouldGenerateOffers = offerMode === "none";

    if (!shouldGenerateOffers) {
      sendSSE("result", { success: true, skipped: true, reason: "offer_mode_no_pyramids", offer_mode: offerMode });
      clearInterval(heartbeat);
      controller.close();
      return;
    }

    sendSSE("progress", { step: "Génération des pyramides d'offres..." });

    const revenueGoalLabel = pickRevenueGoalLabel(businessProfile as AnyRecord);
    const targetMonthlyRevGuess = parseMoneyFromText(revenueGoalLabel);

    const { data: resources, error: resourcesError } = await supabase.from("resources").select("*");
    if (resourcesError) console.error("Error loading resources:", resourcesError);

    const { data: resourceChunks, error: chunksError } = await supabase.from("resource_chunks").select("*");
    if (chunksError) console.error("Error loading resource_chunks:", chunksError);

    const OFFERS_COUNT = 3;

    const { contextBlock } = selectRelevantContext({
      resources: (resources ?? []) as AnyRecord[],
      resourceChunks: (resourceChunks ?? []) as AnyRecord[],
      businessProfile: businessProfile as AnyRecord,
      selectedOffers: null,
      maxResources: 5,
      maxChunks: 10,
    });

    const systemPrompt = `Tu es Tipote™, un coach business senior (niveau mastermind) spécialisé en offre, positionnement, acquisition et systèmes.

OBJECTIF : Proposer ${OFFERS_COUNT} pyramides d'offres complètes (lead magnet → low ticket → middle ticket → high ticket) adaptées à l'utilisateur.
Chaque pyramide = un ANGLE STRATÉGIQUE différent (objectif, mécanisme, positionnement).

SOURCE DE VÉRITÉ (ordre de priorité) :
1) business_profile.diagnostic_profile (si présent) = vérité terrain.
2) diagnostic_summary + diagnostic_answers (si présents).
3) Champs onboarding "cases" = fallback.

EXIGENCES "ANTI-GÉNÉRALITÉS" :
- Interdit: "faire du contenu", "améliorer la com", "poster sur Instagram" sans préciser QUOI / ANGLE / FORMAT / FRÉQUENCE / CTA.
- Chaque pyramide doit avoir: mécanisme, livrables, critère de réussite, et 1 phrase "pourquoi ça convertit" par niveau.
- Chaque pyramide = stratégie distincte (angle, mécanisme, promesse, canal principal, format, objection principale).
- Intègre un quick win 7 jours cohérent avec la pyramide.
- Les pyramides doivent représenter des ORIENTATIONS DIFFÉRENTES pour aider l'utilisateur à se décider.
${buildRefusalsPromptSection(businessProfile as AnyRecord)}
IMPORTANT : Réponds en JSON strict uniquement, sans texte autour.`;

    const userPrompt = `SOURCE PRIORITAIRE — Diagnostic (si présent) :
- diagnostic_profile : ${JSON.stringify((businessProfile as any).diagnostic_profile ?? (businessProfile as any).diagnosticProfile ?? null, null, 2)}
- diagnostic_summary : ${JSON.stringify((businessProfile as any).diagnostic_summary ?? (businessProfile as any).diagnosticSummary ?? null, null, 2)}
- diagnostic_answers : ${JSON.stringify(((businessProfile as any).diagnostic_answers ?? (businessProfile as any).diagnosticAnswers ?? []) as any[], null, 2)}

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
    main_goal_90_days: (businessProfile as any).main_goal_90_days ?? (businessProfile as any).main_goal ?? (businessProfile as any).mainGoal90Days ?? null,
    main_goals: (businessProfile as any).main_goals ?? (businessProfile as any).mainGoals ?? null,
    preferred_content_type: (businessProfile as any).preferred_content_type ?? (businessProfile as any).preferredContentType ?? null,
    tone_preference: (businessProfile as any).tone_preference ?? (businessProfile as any).tonePreference ?? null,
  },
  null,
  2,
)}

RESSOURCES INTERNES (top extraits pertinents) :
${contextBlock || "(aucun extrait pertinent trouvé)"}

Contraintes de sortie :
- Génère ${OFFERS_COUNT} pyramides d'offres complètes, chacune avec un ANGLE STRATÉGIQUE différent.
- Chaque pyramide contient 4 niveaux : lead_magnet, low_ticket, middle_ticket, high_ticket.
- Pour chaque niveau, renseigne :
  - title (spécifique + outcome + mécanisme)
  - format (PDF, mini-cours, workshop, template, audit, coaching, etc.)
  - price (nombre)
  - composition (livrables concrets)
  - purpose (objectif/transformation mesurable)
  - insight (1 phrase: pourquoi ça convertit à ce niveau)
- La logique globale de chaque pyramide = strategy_summary (1 phrase expliquant l'orientation).

STRUCTURE EXACTE À RENVOYER :
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

    // 🪙 Credits: 1 génération = 1 crédit
    await ensureUserCredits(userId);

    sendSSE("progress", { step: "L'IA génère tes 3 pyramides d'offres..." });

    const aiResponse = await ai.chat.completions.create({
      ...cachingParams("offer_pyramid"),
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
    await consumeCredits(userId, 1, { feature: "offer_pyramid" });

    const offersRaw = asArray(parsed.offer_pyramids);
    const normalizedOffers = offersRaw.map((p, idx) => normalizeOfferSet(asRecord(p), idx));

    if (!offersLookUseful(normalizedOffers)) {
      console.error("AI returned incomplete offer_pyramids payload:", parsed);
      sendSSE("error", { success: false, error: "AI returned incomplete offer_pyramids" });
      clearInterval(heartbeat);
      controller.close();
      return;
    }

    sendSSE("progress", { step: "Sauvegarde des pyramides..." });

    const basePlan: AnyRecord = isRecord(existingPlanJson) ? existingPlanJson : {};
    const plan_json: AnyRecord = {
      ...basePlan,
      offer_pyramids: normalizedOffers,

      ...(cleanString(basePlan.revenue_goal, 240) || revenueGoalLabel ? { revenue_goal: cleanString(basePlan.revenue_goal, 240) || revenueGoalLabel } : {}),

      horizon_days: toNumber(basePlan.horizon_days) ?? 90,
      ...(targetMonthlyRevGuess !== null ? { target_monthly_rev: targetMonthlyRevGuess } : {}),

      selected_offer_pyramid_index: typeof basePlan.selected_offer_pyramid_index === "number" ? basePlan.selected_offer_pyramid_index : null,
      selected_offer_pyramid: basePlan.selected_offer_pyramid ?? null,

      // legacy compat
      selected_pyramid_index: typeof basePlan.selected_pyramid_index === "number" ? basePlan.selected_pyramid_index : null,
      selected_pyramid: basePlan.selected_pyramid ?? null,

      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveErr } = await supabase
      .from("business_plan")
      .upsert({ user_id: userId, ...(projectId ? { project_id: projectId } : {}), plan_json, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .select("id")
      .maybeSingle();

    if (saveErr) {
      console.error("Error saving business_plan offers:", saveErr);
      sendSSE("error", { success: false, error: saveErr.message });
      clearInterval(heartbeat);
      controller.close();
      return;
    }

    try {
      const strategyId = await getOrCreateStrategyIdBestEffort({
        userId,
        businessProfile: businessProfile as AnyRecord,
        planJson: plan_json,
        projectId,
      });

      await persistOfferPyramidsBestEffort({
        userId,
        strategyId,
        pyramids: normalizedOffers,
        selectedIndex: null,
        projectId,
      });
    } catch (e) {
      console.error("POST offers sync unexpected error:", e);
    }

    // ✅ Return the generated pyramids in the SSE result
    sendSSE("result", { success: true, planId: saved?.id ?? null, offer_pyramids: normalizedOffers });

      } catch (err) {
        console.error("Unhandled error in POST /api/strategy/offer-pyramid SSE:", err);
        sendSSE("error", { success: false, error: err instanceof Error ? err.message : "Internal server error" });
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
