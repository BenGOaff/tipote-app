import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai } from "@/lib/openaiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // mets 180 ou 300 si besoin

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
  // cherche un nombre type 5000, 5 000, 5k, 5.5k
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
  const direct =
    cleanString(businessProfile.target_monthly_revenue, 64) ||
    cleanString(businessProfile.revenue_goal, 240) ||
    cleanString(businessProfile.revenue_goal_monthly, 240) ||
    cleanString(businessProfile.revenueGoalMonthly, 240);

  if (direct) return direct;

  const mg = cleanString(businessProfile.main_goal, 240) || cleanString(businessProfile.mainGoal90Days, 240);
  if (mg) return mg;

  const goals = asArray(businessProfile.main_goals);
  if (goals.length) return cleanString(goals[0], 240);

  return "";
}

// ✅ light retrieval / relevance scoring for resource_chunks (coach-level prompts without blowing tokens)
const STOPWORDS = new Set([
  "le",
  "la",
  "les",
  "un",
  "une",
  "des",
  "du",
  "de",
  "d",
  "et",
  "ou",
  "mais",
  "donc",
  "or",
  "ni",
  "car",
  "à",
  "a",
  "au",
  "aux",
  "en",
  "dans",
  "sur",
  "sous",
  "pour",
  "par",
  "avec",
  "sans",
  "chez",
  "vers",
  "ce",
  "cet",
  "cette",
  "ces",
  "ça",
  "cela",
  "c",
  "qui",
  "que",
  "quoi",
  "dont",
  "où",
  "je",
  "tu",
  "il",
  "elle",
  "on",
  "nous",
  "vous",
  "ils",
  "elles",
  "me",
  "te",
  "se",
  "mon",
  "ma",
  "mes",
  "ton",
  "ta",
  "tes",
  "son",
  "sa",
  "ses",
  "notre",
  "nos",
  "votre",
  "vos",
  "leur",
  "leurs",
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "so",
  "because",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "without",
  "at",
  "by",
  "from",
  "as",
  "is",
  "are",
  "was",
  "were",
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
  const words = t
    .split(" ")
    .map((w) => w.trim())
    .filter(Boolean);

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

function buildProfileSearchText(businessProfile: AnyRecord, selectedPyramid?: AnyRecord | null): string {
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
    selected_pyramid: selectedPyramid ?? null,
  };
  return JSON.stringify(base);
}

function pickTopResourceChunks(params: {
  chunks: AnyRecord[];
  businessProfile: AnyRecord;
  selectedPyramid?: AnyRecord | null;
  maxChunks?: number;
}): AnyRecord[] {
  const { chunks, businessProfile, selectedPyramid, maxChunks = 18 } = params;
  if (!Array.isArray(chunks) || chunks.length < 1) return [];

  const searchText = buildProfileSearchText(businessProfile, selectedPyramid);
  const keywords = extractKeywords(searchText, 30);
  const kwSet = new Set(keywords);

  const scored = chunks
    .map((c, idx) => {
      const rec = asRecord(c) ?? {};
      const raw = rec.content ?? rec.text ?? rec.chunk ?? rec.body ?? rec.excerpt ?? rec.markdown ?? "";
      const text = normalizeTextForSearch(cleanString(raw, 8000));
      let score = 0;

      // score keywords presence
      for (const kw of kwSet) {
        if (!kw) continue;
        if (text.includes(kw)) score += 2;
      }

      // bonus if chunk has explicit tags that match
      const tags = asArray(rec.tags ?? rec.keywords ?? []).map((x) => normalizeTextForSearch(cleanString(x, 40)));
      for (const t of tags) if (kwSet.has(t)) score += 2;

      // slight recency bonus if timestamps exist (best-effort)
      const updated = typeof rec.updated_at === "string" ? Date.parse(rec.updated_at) : NaN;
      if (Number.isFinite(updated)) {
        const ageDays = (Date.now() - updated) / (1000 * 60 * 60 * 24);
        if (ageDays >= 0 && ageDays < 365) score += 1;
      }

      return { idx, score, rec, raw };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored
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
        content: cleanString(raw, 1800), // keep prompt small
      };
    });

  return top;
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

async function persistStrategyRow(params: {
  supabase: any;
  userId: string;
  businessProfile: AnyRecord;
  planJson: AnyRecord;
}): Promise<void> {
  const { supabase, userId, businessProfile, planJson } = params;
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
      cleanString(planJson.title ?? planJson.summary ?? planJson.strategy_summary ?? "Ma stratégie", 180) ||
      "Ma stratégie";

    const payload: AnyRecord = {
      user_id: userId,
      ...(businessProfileId ? { business_profile_id: businessProfileId } : {}),
      title,
      horizon_days: horizonDays,
      ...(targetMonthlyRev !== null ? { target_monthly_rev: targetMonthlyRev } : {}),
      updated_at: new Date().toISOString(),
    };

    // On tente un upsert, mais sans faire échouer le flux si la table/colonnes diffèrent en prod.
    const upsertRes = await supabase
      .from("strategies")
      .upsert(payload, { onConflict: "user_id" })
      .select("id")
      .maybeSingle();

    if (upsertRes?.error) {
      // fallback insert (si pas de contrainte unique sur user_id)
      const insRes = await supabase.from("strategies").insert(payload).select("id").maybeSingle();
      if (insRes?.error) {
        console.error("persistStrategyRow failed:", insRes.error);
      }
    }
  } catch (e) {
    console.error("persistStrategyRow unexpected error:", e);
  }
}

/**
 * ✅ NEW (anti-régression): récupérer un strategy_id best-effort
 * - ne casse rien si la table strategies n'existe pas
 */
async function getOrCreateStrategyIdBestEffort(params: {
  supabase: any;
  userId: string;
  businessProfile: AnyRecord;
  planJson: AnyRecord;
}): Promise<string | null> {
  const { supabase, userId, businessProfile, planJson } = params;
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
      cleanString(planJson.title ?? planJson.summary ?? planJson.strategy_summary ?? "Ma stratégie", 180) ||
      "Ma stratégie";

    const payload: AnyRecord = {
      user_id: userId,
      ...(businessProfileId ? { business_profile_id: businessProfileId } : {}),
      title,
      horizon_days: horizonDays,
      ...(targetMonthlyRev !== null ? { target_monthly_rev: targetMonthlyRev } : {}),
      updated_at: new Date().toISOString(),
    };

    const upsertRes = await supabase
      .from("strategies")
      .upsert(payload, { onConflict: "user_id" })
      .select("id")
      .maybeSingle();
    if (!upsertRes?.error && upsertRes?.data?.id) return String(upsertRes.data.id);

    // fallback select
    const sel = await supabase.from("strategies").select("id").eq("user_id", userId).maybeSingle();
    if (!sel?.error && sel?.data?.id) return String(sel.data.id);

    return null;
  } catch (e) {
    console.error("getOrCreateStrategyIdBestEffort error:", e);
    return null;
  }
}

function normalizeOffer(offer: AnyRecord | null): AnyRecord | null {
  if (!offer) return null;
  const title = cleanString(offer.title ?? offer.nom ?? offer.name, 160);
  const composition = cleanString(offer.composition ?? offer.contenu ?? "", 800);
  const purpose = cleanString(offer.purpose ?? offer.objectif ?? offer.benefit ?? "", 400);
  const format = cleanString(offer.format ?? offer.type ?? "", 120);
  const insight = cleanString(offer.insight ?? offer.angle ?? "", 240);
  const price = toNumber(offer.price);
  if (!title && !composition && !purpose) return null;

  return {
    title,
    composition,
    purpose,
    format,
    insight,
    ...(price !== null ? { price } : {}),
  };
}

function normalizePyramid(p: AnyRecord | null, idx: number): AnyRecord {
  const id = String(p?.id ?? idx);
  const name = cleanString(p?.name ?? p?.nom ?? `Pyramide ${idx + 1}`, 160);
  const strategy_summary = cleanString(p?.strategy_summary ?? p?.logique ?? "", 4000);

  const lead =
    asRecord(p?.lead_magnet) ??
    asRecord(p?.leadMagnet) ??
    asRecord(p?.lead) ??
    asRecord(p?.lead_offer) ??
    null;

  const low =
    asRecord(p?.low_ticket) ??
    asRecord(p?.lowTicket) ??
    asRecord(p?.mid) ??
    asRecord(p?.middle_offer) ??
    null;

  const high =
    asRecord(p?.high_ticket) ??
    asRecord(p?.highTicket) ??
    asRecord(p?.high) ??
    asRecord(p?.high_offer) ??
    null;

  return {
    id,
    name,
    strategy_summary,
    lead_magnet: normalizeOffer(lead),
    low_ticket: normalizeOffer(low),
    high_ticket: normalizeOffer(high),
  };
}

function pyramidsLookUseful(pyramids: unknown[]): boolean {
  if (!Array.isArray(pyramids) || pyramids.length < 1) return false;
  const ok = pyramids
    .map((p, idx) => normalizePyramid(asRecord(p), idx))
    .filter((x) => !!cleanString(x.name, 2) && !!x.lead_magnet && !!x.low_ticket && !!x.high_ticket);
  return ok.length >= 1;
}

/**
 * ✅ NEW (anti-régression): persister les pyramides dans public.offer_pyramids en best-effort
 * - On n'empêche jamais le flux si la table/colonnes n'existent pas.
 * - On garde business_plan comme source actuelle (compat).
 */
async function persistOfferPyramidsBestEffort(params: {
  supabase: any;
  userId: string;
  strategyId: string | null;
  pyramids: AnyRecord[];
  pyramidRunId: string;
}): Promise<void> {
  const { supabase, userId, strategyId, pyramids, pyramidRunId } = params;

  try {
    if (!Array.isArray(pyramids) || pyramids.length < 1) return;

    const rows: AnyRecord[] = [];

    pyramids.forEach((pyr, idx) => {
      const pyramidName = cleanString(pyr?.name ?? `Pyramide ${idx + 1}`, 160);
      const pyramidSummary = cleanString(pyr?.strategy_summary ?? "", 4000);

      const levels: { level: string; offer: AnyRecord | null }[] = [
        { level: "lead_magnet", offer: asRecord(pyr?.lead_magnet) },
        { level: "low_ticket", offer: asRecord(pyr?.low_ticket) },
        { level: "high_ticket", offer: asRecord(pyr?.high_ticket) },
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
        const row: AnyRecord = {
          user_id: userId,
          ...(strategyId ? { strategy_id: strategyId } : {}),
          pyramid_run_id: pyramidRunId,
          option_index: idx,
          level, // enum offer_level côté DB (doit matcher)
          name,
          description,
          promise,
          format,
          // delivery non présent dans normalizeOffer -> laissé NULL
          ...(price !== null ? { price_min: price, price_max: price } : {}),
          main_outcome,
          is_flagship: level === "high_ticket",
          details: {
            pyramid: { id: cleanString(pyr?.id, 64), name: pyramidName, strategy_summary: pyramidSummary },
            offer: o,
          },
          updated_at: new Date().toISOString(),
        };

        rows.push(row);
      });
    });

    if (!rows.length) return;

    // best-effort upsert: si pas de contrainte unique, on insert
    const up = await supabase.from("offer_pyramids").upsert(rows, {
      onConflict: "user_id,pyramid_run_id,option_index,level",
    });

    if (up?.error) {
      const ins = await supabase.from("offer_pyramids").insert(rows);
      if (ins?.error) {
        console.error("persistOfferPyramidsBestEffort failed:", ins.error);
      }
    }
  } catch (e) {
    console.error("persistOfferPyramidsBestEffort unexpected error:", e);
  }
}

function normalizeTaskTitle(v: AnyRecord): string {
  return cleanString(v.title ?? v.task ?? v.name, 180);
}

function normalizeTaskItem(v: AnyRecord | null): AnyRecord | null {
  if (!v) return null;
  const title = normalizeTaskTitle(v);
  if (!title) return null;

  const due_date = cleanString(v.due_date ?? v.scheduled_for ?? v.date, 32);
  const priority = cleanString(v.priority ?? v.importance ?? "", 12);

  return {
    title,
    ...(due_date ? { due_date } : {}),
    ...(priority ? { priority } : {}),
  };
}

function normalizeTasksByTimeframe(raw: AnyRecord | null): AnyRecord {
  const grouped = asRecord(raw) ?? {};
  const d30 = asArray(grouped.d30)
    .map((x) => normalizeTaskItem(asRecord(x)))
    .filter(Boolean)
    .slice(0, 30);
  const d60 = asArray(grouped.d60)
    .map((x) => normalizeTaskItem(asRecord(x)))
    .filter(Boolean)
    .slice(0, 30);
  const d90 = asArray(grouped.d90)
    .map((x) => normalizeTaskItem(asRecord(x)))
    .filter(Boolean)
    .slice(0, 30);

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

  const title = cleanString(persona.title ?? persona.profile ?? persona.name, 180);
  const pains = asArray(persona.pains)
    .map((x) => cleanString(x, 160))
    .filter(Boolean);
  const desires = asArray(persona.desires)
    .map((x) => cleanString(x, 160))
    .filter(Boolean);
  const channels = asArray(persona.channels)
    .map((x) => cleanString(x, 64))
    .filter(Boolean);
  const tags = asArray(persona.tags)
    .map((x) => cleanString(x, 64))
    .filter(Boolean);

  // ✅ coach-level
  const objections = asArray(persona.objections)
    .map((x) => cleanString(x, 160))
    .filter(Boolean);
  const triggers = asArray(persona.triggers)
    .map((x) => cleanString(x, 160))
    .filter(Boolean);
  const exact_phrases = asArray(persona.exact_phrases ?? persona.exactPhrases)
    .map((x) => cleanString(x, 180))
    .filter(Boolean);

  const result = { title, pains, desires, channels, tags, objections, triggers, exact_phrases };
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
  return (
    personaLooksUseful(asRecord(planJson.persona)) &&
    tasksByTimeframeLooksUseful(planJson) &&
    strategyTextLooksUseful(planJson)
  );
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

// ✅ AJOUT MINIMAL : plan de départ post-onboarding (strategy_summary + strategy_goals) si absent
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
`.trim();

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
      model: "gpt-4.1",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.35,
      max_tokens: 700,
    });

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
  try {
    const supabase = await getSupabaseServerClient();

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userId = session.user.id;

    // locale best-effort
    const acceptLang = (req.headers.get("accept-language") || "").toLowerCase();
    const locale: "fr" | "en" = acceptLang.includes("fr") ? "fr" : "en";

    // 0) Lire plan existant (idempotence)
    const { data: existingPlan, error: existingPlanError } = await supabase
      .from("business_plan")
      .select("plan_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingPlanError) {
      console.error("Error checking existing business_plan:", existingPlanError);
    }

    const existingPlanJson = (existingPlan?.plan_json ?? null) as AnyRecord | null;

    const existingOfferPyramids = existingPlanJson ? asArray(existingPlanJson.offer_pyramids) : [];
    const existingSelectedIndex =
      typeof existingPlanJson?.selected_offer_pyramid_index === "number"
        ? existingPlanJson.selected_offer_pyramid_index
        : typeof existingPlanJson?.selected_pyramid_index === "number"
          ? existingPlanJson.selected_pyramid_index
          : null;

    const hasSelected = typeof existingSelectedIndex === "number";
    const needFullStrategy = hasSelected && !fullStrategyLooksUseful(existingPlanJson);
    const hasUsefulPyramids = pyramidsLookUseful(existingOfferPyramids);

    // ✅ Si l'user a déjà choisi ET que la stratégie complète existe => on ne régénère rien
    if (hasSelected && !needFullStrategy) {
      return NextResponse.json(
        { success: true, planId: null, skipped: true, reason: "already_complete" },
        { status: 200 },
      );
    }

    // ✅ Si pas encore choisi, mais déjà généré les pyramides proprement => on ne régénère pas
    if (!hasSelected && hasUsefulPyramids) {
      return NextResponse.json(
        { success: true, planId: null, skipped: true, reason: "already_generated" },
        { status: 200 },
      );
    }

    // 1) Lire business_profile (onboarding)
    const { data: businessProfile, error: profileError } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (profileError || !businessProfile) {
      console.error("Business profile error:", profileError);
      return NextResponse.json(
        { success: false, error: `Business profile missing: ${profileError?.message ?? "unknown"}` },
        { status: 400 },
      );
    }

    const revenueGoalLabel = pickRevenueGoalLabel(businessProfile as AnyRecord);
    const targetMonthlyRevGuess = parseMoneyFromText(revenueGoalLabel);

    // ✅ AJOUT MINIMAL : lire onboarding_facts (si table présente) pour booster le plan de départ
    const onboardingFacts: Record<string, unknown> = {};
    try {
      const { data: onboardingFactsRows, error: onboardingFactsError } = await supabase
        .from("onboarding_facts")
        .select("key,value,confidence,updated_at")
        .eq("user_id", userId);

      if (onboardingFactsError) {
        console.error("Error reading onboarding_facts:", onboardingFactsError);
      } else {
        for (const row of onboardingFactsRows ?? []) {
          if (!row?.key) continue;
          onboardingFacts[String((row as any).key)] = (row as any).value;
        }
      }
    } catch (e) {
      // fail-open
      console.error("onboarding_facts read failed:", e);
    }

    // 2) Charger ressources (pour améliorer la qualité)
    const { data: resources, error: resourcesError } = await supabase.from("resources").select("*");
    if (resourcesError) console.error("Error loading resources:", resourcesError);

    const { data: resourceChunks, error: chunksError } = await supabase.from("resource_chunks").select("*");
    if (chunksError) console.error("Error loading resource_chunks:", chunksError);

    const MAX_CHUNKS = 18;
    // ✅ on choisit les chunks les plus pertinents pour CE user (au lieu de prendre les 24 premiers)
    const allChunks = Array.isArray(resourceChunks) ? (resourceChunks as AnyRecord[]) : [];
    const limitedChunks = pickTopResourceChunks({
      chunks: allChunks,
      businessProfile: businessProfile as AnyRecord,
      selectedPyramid: null,
      maxChunks: MAX_CHUNKS,
    });
    const resourcesForPrompt = summarizeResourcesForPrompt(resources ?? [], 12);

    const ai = openai;
    if (!ai) {
      return NextResponse.json(
        { success: false, error: "OPENAI_API_KEY_OWNER is not set (strategy generation disabled)" },
        { status: 500 },
      );
    }

    // 3) Si pas de pyramides utiles -> générer les 3 propositions de pyramides
    if (!hasUsefulPyramids) {
      const systemPrompt = `Tu es Tipote™, un coach business senior (niveau mastermind) spécialisé en offre, positionnement, acquisition et systèmes.

OBJECTIF :
Proposer 3 pyramides d'offres (lead magnet → low ticket → high ticket) parfaitement adaptées à l'utilisateur, au niveau “coach business”.

SOURCE DE VÉRITÉ (ordre de priorité) :
1) business_profile.diagnostic_profile (si présent) = vérité terrain, ultra prioritaire.
2) diagnostic_summary + diagnostic_answers (si présents).
3) Champs “cases” (maturity, biggest_blocker, etc.) = fallback seulement.

EXIGENCES “COACH-LEVEL” :
- Zéro blabla : tout doit être actionnable, spécifique, niché.
- Chaque pyramide = une stratégie distincte (angle, mécanisme, promesse, canal, format).
- Pas de généralités (“créer du contenu”) : préciser le quoi / comment / pourquoi.
- Cohérence : respecter contraintes & non-négociables (temps, énergie, budget, formats refusés).
- Inclure un quick win 7 jours (effet “wow”) dans la logique globale.

IMPORTANT :
Tu dois répondre en JSON strict uniquement, sans texte autour.`;

      const userPrompt = `SOURCE PRIORITAIRE — Diagnostic (si présent) :
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

Contraintes :
- Génère 3 pyramides complètes.
- Chaque pyramide contient : lead_magnet, low_ticket, high_ticket.
- Pour chaque offre, renseigne :
  - title (nom accrocheur, spécifique à la niche)
  - format (ex: PDF, mini-cours, formation, coaching, abonnement...)
  - price (nombre, ex: 0 / 19 / 47 / 297 / 997)
  - composition (ce que contient l'offre, concret, livrables)
  - purpose (l'objectif / transformation)
  - insight (1 phrase percutante: pourquoi ça convertit à ce niveau)
- La logique globale de chaque pyramide doit être expliquée en 1 phrase (strategy_summary).
- Titres inspirés de : SUPERPROLIFIQUE™, EMAIL FACTORY™, etc. (outcome + mécanisme).

STRUCTURE EXACTE À RENVOYER (JSON strict, pas de texte autour) :
{
  "offer_pyramids": [
    {
      "id": "A",
      "name": "Pyramide A — ...",
      "strategy_summary": "1 phrase",
      "lead_magnet": { "title":"", "format":"", "price":0, "composition":"", "purpose":"", "insight":"" },
      "low_ticket":  { "title":"", "format":"", "price":0, "composition":"", "purpose":"", "insight":"" },
      "high_ticket": { "title":"", "format":"", "price":0, "composition":"", "purpose":"", "insight":"" }
    }
  ]
}`;

      const aiResponse = await ai.chat.completions.create({
        model: "gpt-4.1",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      });

      const raw = aiResponse.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as AnyRecord;

      const pyramidsRaw = asArray(parsed.offer_pyramids);
      const normalizedOfferPyramids = pyramidsRaw.map((p, idx) => normalizePyramid(asRecord(p), idx));

      if (!pyramidsLookUseful(normalizedOfferPyramids)) {
        console.error("AI returned incomplete offer_pyramids payload:", parsed);
        return NextResponse.json({ success: false, error: "AI returned incomplete offer_pyramids" }, { status: 502 });
      }

      const basePlan: AnyRecord = isRecord(existingPlanJson) ? existingPlanJson : {};

      // ✅ run id pour relier génération -> sélection -> table offer_pyramids
      const offerPyramidsRunId =
        typeof globalThis.crypto?.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      const plan_json: AnyRecord = {
        ...basePlan,
        offer_pyramids: normalizedOfferPyramids,
        offer_pyramids_run_id: offerPyramidsRunId,
        ...(cleanString(basePlan.revenue_goal, 240) || revenueGoalLabel
          ? { revenue_goal: cleanString(basePlan.revenue_goal, 240) || revenueGoalLabel }
          : {}),
        horizon_days: toNumber(basePlan.horizon_days) ?? 90,
        ...(targetMonthlyRevGuess !== null ? { target_monthly_rev: targetMonthlyRevGuess } : {}),
        selected_offer_pyramid_index:
          typeof basePlan.selected_offer_pyramid_index === "number" ? basePlan.selected_offer_pyramid_index : null,
        selected_offer_pyramid: basePlan.selected_offer_pyramid ?? null,
        // compat legacy
        selected_pyramid_index:
          typeof basePlan.selected_pyramid_index === "number" ? basePlan.selected_pyramid_index : null,
        selected_pyramid: basePlan.selected_pyramid ?? null,
        updated_at: new Date().toISOString(),
      };

      // ✅ AJOUT MINIMAL : générer le “plan de départ” si absent (best-effort, n'empêche jamais le save)
      try {
        const hasGoals =
          Array.isArray((plan_json as any).strategy_goals) && (plan_json as any).strategy_goals.length > 0;
        const hasSummary =
          typeof (plan_json as any).strategy_summary === "string" &&
          (plan_json as any).strategy_summary.trim().length > 0;

        if (!hasGoals || !hasSummary) {
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

      // ✅ persister en best-effort dans offer_pyramids (sans casser si pas migré)
      try {
        const strategyId = await getOrCreateStrategyIdBestEffort({
          supabase,
          userId,
          businessProfile: businessProfile as AnyRecord,
          planJson: plan_json,
        });

        await persistOfferPyramidsBestEffort({
          supabase,
          userId,
          strategyId,
          pyramids: normalizedOfferPyramids,
          pyramidRunId: offerPyramidsRunId,
        });
      } catch (e) {
        console.error("offer_pyramids persistence (POST /api/strategy) error:", e);
      }

      const { data: saved, error: saveErr } = await supabase
        .from("business_plan")
        .upsert(
          {
            user_id: userId,
            plan_json,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        )
        .select("id")
        .maybeSingle();

      if (saveErr) {
        console.error("Error saving business_plan pyramids:", saveErr);
        return NextResponse.json({ success: false, error: saveErr.message }, { status: 500 });
      }

      // ✅ Optionnel : persister aussi dans la table strategies (si présente), sans bloquer.
      await persistStrategyRow({ supabase, userId, businessProfile: businessProfile as AnyRecord, planJson: plan_json });

      return NextResponse.json({ success: true, planId: saved?.id ?? null }, { status: 200 });
    }

    // 4) Si l'user a choisi une pyramide -> générer la stratégie complète + persona + plan 90j
    const selectedPyramid = pickSelectedPyramidFromPlan(existingPlanJson);

    if (!selectedPyramid) {
      return NextResponse.json(
        {
          success: false,
          error:
            "selected_offer_pyramid is missing. Choose a pyramid first (/strategy/pyramids) before generating the full strategy.",
        },
        { status: 400 },
      );
    }

    const fullSystemPrompt = `Tu es Tipote™, un coach business senior (niveau mastermind) ET un stratège opérateur (tu transformes un diagnostic en plan exécuté).
Ton niveau attendu : stratégie ultra personnalisée, digne d’un coach à 10 000$/mois.

MISSION :
À partir du business_profile (onboarding), du diagnostic_profile (si présent) et de la pyramide d’offres choisie, tu produis :
1) une stratégie claire (mission, promesse, positionnement, résumé),
2) un persona “terrain” (pains, désirs, objections, déclencheurs, phrases exactes),
3) un plan 90 jours exécutable (focus unique + milestones + tâches datées).

SOURCE DE VÉRITÉ (ordre de priorité) :
1) business_profile.diagnostic_profile (si présent) = vérité terrain, ULTRA prioritaire.
2) diagnostic_summary + diagnostic_answers (si présents).
3) Champs “cases” (maturity, biggest_blocker…) = fallback seulement.

RÈGLES COACH-LEVEL (non négociables) :
- ZÉRO généralités : pas de “créer du contenu” sans préciser le format, la fréquence, le canal, l’angle, l’objectif, et le livrable.
- Respect strict des contraintes & non-négociables (temps/énergie/budget/formats refusés).
- Cohérence totale avec la pyramide choisie : mêmes angles, mêmes mécanismes, même canal principal.
- 1 levier principal (focus) + max 2 leviers secondaires.
- Chaque tâche doit être faisable par une personne seule, et inclure un livrable clair (ex: “écrire la page X”, “publier 6 posts selon le plan Y”).
- Si une info manque : FAIS UNE HYPOTHÈSE MINIMALE et indique-la implicitement dans le plan (sans ajouter un champ “assumptions”).

UTILISATION DES RESSOURCES INTERNES :
Tu as accès à des ressources et des extraits (chunks). Utilise-les comme “cadres / checklists / patterns”, mais adapte toujours à la niche et aux contraintes. Ne cite pas les ressources, et ne colle pas de longs extraits.

GARDE-FOUS QUALITÉ (à appliquer AVANT de répondre) :
- Spécificité : au moins 70% des tâches doivent mentionner un livrable concret + un canal/format.
- Priorités : d30 = fondations + acquisition lead magnet, d60 = conversion + low-ticket, d90 = high-ticket + systèmes.
- Anti-contradiction : aucune tâche ne doit contredire “formats impossibles” et “non_negotiables”.

FORMAT JSON STRICT À RESPECTER (réponds en JSON strict uniquement, sans texte autour) :
{
  "mission": "string",
  "promise": "string",
  "positioning": "string",
  "summary": "string",
  "persona": {
    "title": "profil en 1 phrase (sans âge/ville, sans prénom)",
    "pains": ["...", "...", "...", "...", "..."],
    "desires": ["...", "...", "..."],
    "channels": ["...", "...", "..."],
    "objections": ["...", "...", "..."],
    "triggers": ["...", "...", "..."],
    "exact_phrases": ["...", "...", "...", "...", "..."]
  },
  "plan_90_days": {
    "focus": "string",
    "milestones": ["...", "...", "..."],
    "tasks_by_timeframe": {
      "d30": [{ "title": "...", "due_date": "YYYY-MM-DD", "priority": "high|medium|low" }],
      "d60": [{ "title": "...", "due_date": "YYYY-MM-DD", "priority": "high|medium|low" }],
      "d90": [{ "title": "...", "due_date": "YYYY-MM-DD", "priority": "high|medium|low" }]
    }
  }
}

CONTRAINTES TASKS :
- Minimum 6 tâches par timeframe (d30/d60/d90).
- due_date valides et réparties dans le temps.
- Les titres doivent être actionnables (verbe + livrable).`;

    // chunks les plus pertinents *après* sélection de pyramide (meilleur contexte)
    const selectedChunks = pickTopResourceChunks({
      chunks: Array.isArray(resourceChunks) ? (resourceChunks as AnyRecord[]) : [],
      businessProfile: businessProfile as AnyRecord,
      selectedPyramid,
      maxChunks: 18,
    });

    const fullUserPrompt = `CONTEXTE UTILISATEUR — À UTILISER EN PRIORITÉ
Revenue goal (label) : ${cleanString(revenueGoalLabel, 240) || "N/A"}
Target monthly revenue (guess) : ${targetMonthlyRevGuess !== null ? String(targetMonthlyRevGuess) : "N/A"}

SOURCE PRIORITAIRE — Diagnostic (si présent)
diagnostic_profile :
${JSON.stringify((businessProfile as any).diagnostic_profile ?? (businessProfile as any).diagnosticProfile ?? null, null, 2)}

diagnostic_summary :
${JSON.stringify((businessProfile as any).diagnostic_summary ?? (businessProfile as any).diagnosticSummary ?? null, null, 2)}

diagnostic_answers (brut) :
${JSON.stringify(((businessProfile as any).diagnostic_answers ?? (businessProfile as any).diagnosticAnswers ?? []) as any[], null, 2)}

DONNÉES FORMULAIRES (fallback)
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

PYRAMIDE CHOISIE (source de cohérence)
${JSON.stringify(selectedPyramid, null, 2)}

RESSOURCES INTERNES (résumé)
${JSON.stringify(resourcesForPrompt ?? [], null, 2)}

CHUNKS PERTINENTS (extraits)
${JSON.stringify(selectedChunks ?? [], null, 2)}

CONSINGNES IMPORTANTES
- Le plan 90 jours DOIT contenir des tâches avec due_date au format YYYY-MM-DD.
- Donne au moins 6 tâches par timeframe (d30, d60, d90).
- Utilise les contraintes “non_negotiables / formats_impossible” du diagnostic_profile si présentes.
- Le focus doit être un levier unique et concret (ex: “tunnel lead magnet → low-ticket via X canal”, pas “marketing”).`;

    const fullAiResponse = await ai.chat.completions.create({
      model: "gpt-4.1",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: fullSystemPrompt },
        { role: "user", content: fullUserPrompt },
      ],
      temperature: 0.6,
    });

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
        milestones: asArray(plan90Raw.milestones)
          .map((x) => cleanString(x, 180))
          .filter(Boolean)
          .slice(0, 6),
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
      .upsert(
        {
          user_id: userId,
          plan_json: nextPlan,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("id")
      .maybeSingle();

    if (fullErr) {
      console.error("Error saving business_plan full strategy:", fullErr);
      return NextResponse.json({ success: false, error: fullErr.message }, { status: 500 });
    }

    // ✅ Optionnel : persister aussi dans la table strategies (si présente en prod), sans bloquer le flux.
    await persistStrategyRow({ supabase, userId, businessProfile: businessProfile as AnyRecord, planJson: nextPlan });

    return NextResponse.json({ success: true, planId: savedFull?.id ?? null }, { status: 200 });
  } catch (err) {
    console.error("Unhandled error in /api/strategy:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
