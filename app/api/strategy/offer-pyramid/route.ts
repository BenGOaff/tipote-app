// app/api/strategy/offer-pyramid/route.ts
// Generates 3 offer pyramids (lead magnet → low → middle? → high ticket)
// GET  — returns existing pyramids from business_plan.plan_json
// POST — generates 3 new pyramids via AI (SSE stream with heartbeats)
// PATCH — saves the user's pyramid selection

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
  return isRecord(v) ? v : null;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function cleanString(v: unknown, maxLen = 240): string {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}
function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ─── Refusals ────────────────────────────────────────────────────────────────

const REFUSAL_LABELS: Record<string, string> = {
  no_dm: "Pas de prospection en DM",
  no_video: "Pas de vidéos",
  no_articles: "Pas d'articles / blog",
  no_social: "Pas de réseaux sociaux",
  no_course: "Pas de création de formation",
  no_coaching: "Pas de coaching individuel",
  no_personal_branding: "Pas de personal branding (ne pas se montrer)",
};

function extractRefusals(bp: AnyRecord): string[] {
  const da = asRecord(bp.diagnostic_answers) ?? asRecord(bp.diagnosticAnswers) ?? {};
  const raw = asArray(da.refusals ?? []);
  return raw
    .map((r) => {
      const key = cleanString(r, 60).toLowerCase();
      if (!key || key === "none" || key === "aucun") return "";
      return REFUSAL_LABELS[key] ?? key;
    })
    .filter(Boolean);
}

function buildRefusalsBlock(bp: AnyRecord): string {
  const refusals = extractRefusals(bp);
  if (refusals.length === 0) return "";
  return `
🚫 REFUS ABSOLUS DE L'UTILISATEUR (NON-NÉGOCIABLES) :
${refusals.map((r) => `- ${r}`).join("\n")}

⚠️ INSTRUCTION CRITIQUE : Tu ne dois JAMAIS proposer quoi que ce soit qui corresponde aux refus ci-dessus. Ces refus sont ABSOLUS et PRIORITAIRES.
`;
}

// ─── Offer normalization ─────────────────────────────────────────────────────

function normalizeOffer(o: AnyRecord | null): AnyRecord | null {
  if (!o) return null;
  const title = cleanString(o.title ?? o.nom ?? o.name, 200);
  const pitch = cleanString(o.pitch ?? o.description ?? "", 2000);
  const problem = cleanString(o.problem ?? o.probleme ?? "", 800);
  const transformation = cleanString(o.transformation ?? o.result ?? "", 800);
  const format = cleanString(o.format ?? o.type ?? "", 200);
  const bonuses = asArray(o.bonuses ?? o.bonus).map((b) => cleanString(b, 300)).filter(Boolean);
  const guarantee = cleanString(o.guarantee ?? o.garantie ?? "", 500);
  const cta = cleanString(o.cta ?? o.call_to_action ?? "", 300);
  const price = toNumber(o.price);
  const titles = asArray(o.titles ?? o.title_options).map((t) => cleanString(t, 200)).filter(Boolean);

  if (!title && !pitch) return null;
  return {
    title,
    titles: titles.length > 0 ? titles : [title].filter(Boolean),
    pitch,
    problem,
    transformation,
    format,
    bonuses,
    guarantee,
    cta,
    ...(price !== null ? { price } : {}),
  };
}

function normalizeOfferSet(p: AnyRecord | null, idx: number): AnyRecord {
  const id = String(p?.id ?? idx);
  const name = cleanString(p?.name ?? p?.nom ?? `Pyramide ${idx + 1}`, 200);
  const strategy_summary = cleanString(p?.strategy_summary ?? p?.logique ?? "", 4000);

  return {
    id,
    name,
    strategy_summary,
    lead_magnet: normalizeOffer(asRecord(p?.lead_magnet) ?? asRecord(p?.leadMagnet)),
    low_ticket: normalizeOffer(asRecord(p?.low_ticket) ?? asRecord(p?.lowTicket)),
    middle_ticket: normalizeOffer(asRecord(p?.middle_ticket) ?? asRecord(p?.middleTicket)),
    high_ticket: normalizeOffer(asRecord(p?.high_ticket) ?? asRecord(p?.highTicket)),
  };
}

function offersLookUseful(offers: unknown[]): boolean {
  if (!Array.isArray(offers) || offers.length < 1) return false;
  return offers
    .map((p, idx) => normalizeOfferSet(asRecord(p), idx))
    .filter((x) => !!cleanString(x.name, 2) && !!x.lead_magnet && !!x.low_ticket && !!x.high_ticket)
    .length >= 1;
}

// ─── Resource retrieval (best-effort) ────────────────────────────────────────

function extractAnyText(obj: AnyRecord | null, maxLen = 2200): string {
  if (!obj) return "";
  const candidates = [obj.content, obj.text, obj.chunk, obj.body, obj.markdown, obj.summary, obj.description, obj.title, obj.name]
    .map((x) => cleanString(x, maxLen))
    .filter(Boolean);
  if (!candidates.length) {
    try { return cleanString(JSON.stringify(obj), maxLen); } catch { return ""; }
  }
  return cleanString(candidates.join("\n"), maxLen);
}

function tokenize(s: string): string[] {
  return (s || "").toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
    .split(/\s+/g).filter((t) => t.length >= 3 && t.length <= 32);
}

function scoreText(text: string, qTokens: string[]): number {
  if (!text || !qTokens.length) return 0;
  const t = text.toLowerCase();
  let score = 0;
  for (const q of qTokens) {
    let idx = 0, hits = 0;
    while (true) {
      idx = t.indexOf(q, idx);
      if (idx === -1) break;
      hits++; idx += q.length;
      if (hits >= 6) break;
    }
    if (hits) score += hits * (q.length >= 6 ? 3 : 2);
  }
  return score;
}

function selectRelevantContext(params: {
  resources: AnyRecord[];
  resourceChunks: AnyRecord[];
  bp: AnyRecord;
}): string {
  const { resources, resourceChunks, bp } = params;
  const niche = cleanString(bp.niche ?? bp.market ?? bp.activity, 120);
  const goal = cleanString(bp.main_goal_90_days ?? bp.main_goal ?? bp.goal, 180);
  const query = [niche && `niche ${niche}`, goal && `objectif ${goal}`].filter(Boolean).join(" | ");
  const qTokens = tokenize(query);

  const scored = [...(resources || []), ...(resourceChunks || [])]
    .map((r) => ({ rec: asRecord(r) ?? {}, score: scoreText(extractAnyText(asRecord(r), 2200), qTokens) }))
    .sort((a, b) => b.score - a.score)
    .filter((x) => x.score > 0)
    .slice(0, 8);

  if (!scored.length) return "";
  return "RESSOURCES PERTINENTES :\n" + scored.map((x, i) => {
    const title = cleanString(x.rec.title ?? x.rec.name ?? "Ressource", 140);
    return `- [${i + 1}] ${title}\n${extractAnyText(x.rec, 900)}`;
  }).join("\n\n");
}

// ─── DB level mapping ────────────────────────────────────────────────────────

const DB_LEVEL_MAP: Record<string, string> = {
  lead_magnet: "lead_magnet", low_ticket: "entry",
  middle_ticket: "core", high_ticket: "premium",
};
const DB_LEVEL_REVERSE: Record<string, string> = {
  lead_magnet: "lead_magnet", entry: "low_ticket",
  core: "middle_ticket", premium: "high_ticket",
};

// ─── DB persistence ─────────────────────────────────────────────────────────

async function persistOfferPyramids(params: {
  userId: string;
  pyramids: AnyRecord[];
  pyramidRunId: string;
  selectedIndex: number | null;
  projectId?: string | null;
}): Promise<void> {
  const { userId, pyramids, pyramidRunId, selectedIndex, projectId } = params;
  if (!Array.isArray(pyramids) || pyramids.length < 1) return;

  const now = new Date().toISOString();
  const rows: AnyRecord[] = [];

  pyramids.forEach((p, idx) => {
    const setName = cleanString(p.name, 160) || `Offre ${idx + 1}`;
    const setSummary = cleanString(p.strategy_summary, 4000);
    const isSelected = typeof selectedIndex === "number" && idx === selectedIndex;

    for (const level of ["lead_magnet", "low_ticket", "middle_ticket", "high_ticket"] as const) {
      const offer = asRecord(p[level]);
      if (!offer) continue;
      rows.push({
        user_id: userId,
        ...(projectId ? { project_id: projectId } : {}),
        pyramid_run_id: pyramidRunId,
        option_index: idx,
        level: DB_LEVEL_MAP[level] ?? level,
        name: cleanString(offer.title ?? offer.name ?? "", 180),
        description: cleanString(offer.pitch ?? offer.description, 4000),
        promise: cleanString(offer.transformation ?? offer.purpose, 800),
        format: cleanString(offer.format, 180),
        delivery: cleanString(offer.cta, 800),
        ...(toNumber(offer.price) !== null ? { price_min: toNumber(offer.price), price_max: toNumber(offer.price) } : {}),
        main_outcome: cleanString(offer.transformation ?? offer.purpose, 800),
        is_flagship: false,
        is_selected: isSelected,
        ...(isSelected ? { selected_at: now } : {}),
        details: {
          pyramid: { id: cleanString(p.id, 64), name: setName, strategy_summary: setSummary },
          offer,
        },
        updated_at: now,
      });
    }
  });

  if (!rows.length) return;

  // Delete existing pyramids for this user/project, then insert fresh
  let delQuery = supabaseAdmin.from("offer_pyramids").delete().eq("user_id", userId);
  if (projectId) delQuery = delQuery.eq("project_id", projectId);
  await delQuery;
  const { error } = await supabaseAdmin.from("offer_pyramids").insert(rows);
  if (error) throw error;
}

// ─── Read pyramids from DB and reconstruct pyramid sets ─────────────────────

async function loadPyramidsFromDb(params: {
  supabase: any;
  userId: string;
  projectId?: string | null;
}): Promise<{ pyramidSets: AnyRecord[]; selectedIndex: number | null } | null> {
  const { supabase, userId, projectId } = params;

  let query = supabase
    .from("offer_pyramids")
    .select("*")
    .eq("user_id", userId)
    .order("option_index", { ascending: true })
    .order("level", { ascending: true });
  if (projectId) query = query.eq("project_id", projectId);
  const { data: rows, error } = await query;

  if (error || !rows || rows.length === 0) return null;

  // Group rows by option_index → reconstruct pyramid sets
  const grouped = new Map<number, AnyRecord[]>();
  for (const row of rows) {
    const idx = row.option_index ?? 0;
    if (!grouped.has(idx)) grouped.set(idx, []);
    grouped.get(idx)!.push(row);
  }

  let selectedIndex: number | null = null;
  const pyramidSets: AnyRecord[] = [];

  for (const [optIdx, levelRows] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
    const firstRow = levelRows[0];
    const pyramidMeta = asRecord((firstRow.details as any)?.pyramid) ?? {};

    const set: AnyRecord = {
      id: cleanString(pyramidMeta.id ?? String(optIdx), 64),
      name: cleanString(pyramidMeta.name ?? `Pyramide ${optIdx + 1}`, 200),
      strategy_summary: cleanString(pyramidMeta.strategy_summary ?? "", 4000),
    };

    for (const row of levelRows) {
      const internalLevel = DB_LEVEL_REVERSE[row.level] ?? row.level;
      const offerFromDetails = asRecord((row.details as any)?.offer);

      if (offerFromDetails) {
        set[internalLevel] = normalizeOffer(offerFromDetails);
      } else {
        set[internalLevel] = normalizeOffer({
          title: row.name,
          pitch: row.description,
          transformation: row.promise ?? row.main_outcome,
          format: row.format,
          cta: row.delivery,
          price: row.price_min,
        });
      }

      if (row.is_selected) selectedIndex = optIdx;
    }

    pyramidSets.push(set);
  }

  return { pyramidSets, selectedIndex };
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(_req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const userId = sessionData.session.user.id;
    const projectId = await getActiveProjectId(supabase, userId);

    // Primary: read from offer_pyramids table
    const dbResult = await loadPyramidsFromDb({ supabase, userId, projectId });
    if (dbResult && dbResult.pyramidSets.length > 0) {
      return NextResponse.json({
        success: true,
        offer_pyramids: dbResult.pyramidSets,
        selected_index: dbResult.selectedIndex,
      });
    }

    // Fallback: read from business_plan.plan_json (backward compat)
    let planQuery = supabase.from("business_plan").select("plan_json").eq("user_id", userId);
    if (projectId) planQuery = planQuery.eq("project_id", projectId);
    const { data: planRow } = await planQuery.maybeSingle();
    const planJson = (planRow?.plan_json ?? null) as AnyRecord | null;

    return NextResponse.json({
      success: true,
      offer_pyramids: planJson ? asArray(planJson.offer_pyramids) : [],
      selected_index: typeof planJson?.selected_offer_pyramid_index === "number"
        ? planJson.selected_offer_pyramid_index : null,
    });
  } catch (err) {
    console.error("GET /api/strategy/offer-pyramid error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH ───────────────────────────────────────────────────────────────────

export async function PATCH(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const userId = sessionData.session.user.id;
    const projectId = await getActiveProjectId(supabase, userId);
    const body = (await req.json().catch(() => ({}))) as AnyRecord;

    const selectedIndex = typeof body.selectedIndex === "number" ? body.selectedIndex : null;
    if (selectedIndex === null || selectedIndex < 0) {
      return NextResponse.json({ error: "Invalid selectedIndex" }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 1) Primary: update offer_pyramids table (reset all → mark selected)
    let resetQuery = supabaseAdmin
      .from("offer_pyramids")
      .update({ is_selected: false, selected_at: null })
      .eq("user_id", userId);
    if (projectId) resetQuery = resetQuery.eq("project_id", projectId);
    await resetQuery;

    let selectQuery = supabaseAdmin
      .from("offer_pyramids")
      .update({ is_selected: true, selected_at: now })
      .eq("user_id", userId)
      .eq("option_index", selectedIndex);
    if (projectId) selectQuery = selectQuery.eq("project_id", projectId);
    const { error: selectErr } = await selectQuery;
    if (selectErr) {
      console.error("PATCH select error:", selectErr);
      return NextResponse.json({ error: selectErr.message }, { status: 500 });
    }

    // 2) Backward compat: update business_plan.plan_json
    let planQuery = supabase.from("business_plan").select("plan_json").eq("user_id", userId);
    if (projectId) planQuery = planQuery.eq("project_id", projectId);
    const { data: planRow } = await planQuery.maybeSingle();
    const basePlan: AnyRecord = isRecord(planRow?.plan_json) ? (planRow?.plan_json as AnyRecord) : {};

    let pyramid: AnyRecord | null = asRecord(body.pyramid);
    if (!pyramid) {
      const pyramidsArr = asArray(basePlan.offer_pyramids);
      pyramid = asRecord(pyramidsArr[selectedIndex]);
    }

    if (pyramid) {
      const nextPlan: AnyRecord = {
        ...basePlan,
        selected_offer_pyramid_index: selectedIndex,
        selected_offer_pyramid: pyramid,
        selected_pyramid_index: selectedIndex,
        selected_pyramid: pyramid,
        updated_at: now,
      };

      await supabase
        .from("business_plan")
        .upsert({ user_id: userId, ...(projectId ? { project_id: projectId } : {}), plan_json: nextPlan, updated_at: now }, { onConflict: "user_id" })
        .select("id")
        .maybeSingle();
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/strategy/offer-pyramid error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST (SSE stream) ──────────────────────────────────────────────────────

export async function POST(req: Request) {
  let supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  let userId: string;
  let projectId: string | null;

  try {
    supabase = await getSupabaseServerClient();
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    userId = sessionData.session.user.id;
    projectId = await getActiveProjectId(supabase, userId);
    if (!openai) return NextResponse.json({ error: "AI client not configured" }, { status: 500 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }

  const ai = openai!;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendSSE(event: string, data: any) {
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ }
      }

      const heartbeat = setInterval(() => {
        try { sendSSE("heartbeat", { status: "generating" }); } catch { /* closed */ }
      }, 5000);

      try {
        sendSSE("progress", { step: "Lecture de ton profil..." });

        // Check existing in offer_pyramids table first
        const dbResult = await loadPyramidsFromDb({ supabase, userId, projectId });
        if (dbResult && dbResult.pyramidSets.length > 0 && offersLookUseful(dbResult.pyramidSets)) {
          sendSSE("result", { success: true, skipped: true, reason: "already_generated", offer_pyramids: dbResult.pyramidSets });
          clearInterval(heartbeat);
          controller.close();
          return;
        }

        // Fallback: check business_plan.plan_json
        let planQuery = supabase.from("business_plan").select("plan_json").eq("user_id", userId);
        if (projectId) planQuery = planQuery.eq("project_id", projectId);
        const { data: existingPlan } = await planQuery.maybeSingle();
        const existingPlanJson = (existingPlan?.plan_json ?? null) as AnyRecord | null;
        const existingOffers = existingPlanJson ? asArray(existingPlanJson.offer_pyramids) : [];

        if (offersLookUseful(existingOffers)) {
          sendSSE("result", { success: true, skipped: true, reason: "already_generated", offer_pyramids: existingOffers });
          clearInterval(heartbeat);
          controller.close();
          return;
        }

        // Load business profile
        let bpQuery = supabase.from("business_profiles").select("*").eq("user_id", userId);
        if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
        const { data: bp, error: bpErr } = await bpQuery.single();
        if (bpErr || !bp) {
          sendSSE("error", { error: `Business profile missing: ${bpErr?.message ?? "unknown"}` });
          clearInterval(heartbeat);
          controller.close();
          return;
        }

        sendSSE("progress", { step: "Analyse de tes réponses..." });

        // Load resources for context
        const { data: resources } = await supabase.from("resources").select("*");
        const { data: resourceChunks } = await supabase.from("resource_chunks").select("*");
        const contextBlock = selectRelevantContext({
          resources: (resources ?? []) as AnyRecord[],
          resourceChunks: (resourceChunks ?? []) as AnyRecord[],
          bp: bp as AnyRecord,
        });

        // Extract pyramid-specific answers from diagnostic
        const da = asRecord((bp as any).diagnostic_answers) ?? asRecord((bp as any).diagnosticAnswers) ?? {};
        const urgentProblem = cleanString(da.urgentProblem ?? da.urgent_problem, 1000);
        const quickResult = cleanString(da.quickResult ?? da.quick_result, 1000);
        const topObstacles = cleanString(da.topObstacles ?? da.top_obstacles, 2000);
        const uniqueMethods = cleanString(da.uniqueMethods ?? da.unique_methods, 2000);
        const offerFormats = asArray(da.offerFormat ?? da.offer_format).map((f) => cleanString(f, 100)).filter(Boolean);
        const uniqueness = cleanString(da.uniqueness, 2000);

        // Niche formula
        const nicheTarget = cleanString(da.nicheTarget ?? da.niche_target ?? (bp as any).niche, 200);
        const nicheObjective = cleanString(da.nicheObjective ?? da.niche_objective, 200);
        const nicheMechanism = cleanString(da.nicheMechanism ?? da.niche_mechanism, 200);
        const nicheTimeframe = cleanString(da.nicheTimeframe ?? da.niche_timeframe, 200);
        const nicheFormula = [nicheTarget, nicheObjective, nicheMechanism, nicheTimeframe].filter(Boolean).join(" — ");

        // Client profile
        const clientProblem = cleanString(da.clientProblem ?? da.client_problem, 800);
        const clientPrevAttempts = cleanString(da.clientPrevAttempts ?? da.client_prev_attempts, 800);
        const clientFailures = cleanString(da.clientFailures ?? da.client_failures, 800);
        const clientFutureLife = cleanString(da.clientFutureLife ?? da.client_future_life, 800);

        const revenueGoal = cleanString(
          (bp as any).revenue_goal_monthly ?? (bp as any).target_monthly_revenue ?? (bp as any).revenue_goal, 200
        );

        const OFFERS_COUNT = 3;

        const systemPrompt = `Tu es Tipote™, un stratège business senior (niveau mastermind) spécialisé en création d'offres irrésistibles, copywriting persuasif, et systèmes d'acquisition en 2026.

OBJECTIF : Proposer ${OFFERS_COUNT} pyramides d'offres complètes et percutantes.

Chaque pyramide = un ANGLE STRATÉGIQUE DIFFÉRENT (objectif, mécanisme, positionnement, format principal).

STRUCTURE D'UNE PYRAMIDE :
1. LEAD MAGNET (gratuit) — Résout un problème urgent du client cible.
   Formats possibles : checklist, template, étude de cas, quiz, X idées de…, planner, audit personnalisé, offre spéciale, contenu saisonnier, calculateur, workbook, podcast privé, swipe file, pack de ressources, résumé actionnable, atelier live, challenge, plan d'action, accès partiel à l'offre, pack de prompts, tirage au sort, GPT/générateur.

2. LOW TICKET (7€ – 97€) — Résout une plus grosse partie du problème avec une offre rapide et facile à consommer.

3. MIDDLE TICKET (97€ – 497€, optionnel) — Approfondit la transformation.

4. HIGH TICKET (497€ – 9 997€ ou abonnement) — Permet au client d'atteindre ses objectifs à coup sûr, avec grosse garantie, beaucoup de valeur, coaching/retour 1:1.

EXIGENCES POUR CHAQUE OFFRE DE LA PYRAMIDE :
- 3 propositions de titres accrocheurs (style : SUPERPROLIFIQUE™, EMAIL FACTORY™, LANCEMENT ACCÉLÉRÉ™, LA FORMULE DES PETITS PRODUITS™, etc.)
- Un pitch complet et percutant
- Le problème clair et urgent (vraie douleur de la cible)
- La transformation forte et désirable (résultat clair)
- Le format optimisé (adapté à la cible)
- 3 idées de bonus pour augmenter la valeur perçue
- Une garantie rassurante
- Un appel à l'action clair et direct

TRIGGERS PSYCHOLOGIQUES À INTÉGRER :
- Urgence et rareté ("Il ne reste que X places", "Offre valable jusqu'à…")
- Preuve sociale et autorité ("Utilisé par +500 entrepreneurs", "Méthode validée par…")
- Réciprocité (le lead magnet offre tellement de valeur que le prospect se sent redevable)
- Engagement progressif (chaque niveau prépare naturellement au suivant)
- Effet de contraste (montrer la valeur totale vs le prix réel)
- Aversion à la perte ("Ce que tu perds chaque jour sans cette méthode")
- Identification ("Si tu es [profil], alors cette offre est faite pour toi")

INSPIRATION POUR LES TITRES (style à reproduire) :
- SUPERPROLIFIQUE™ : La méthode pour créer 5 fois plus de contenu en travaillant 2 fois moins.
- EMAIL FACTORY™ : Le système avancé pour créer une newsletter qui vend, même avec une petite liste.
- LANCEMENT ACCÉLÉRÉ™ : Comment créer, lancer et vendre une formation en 7 jours seulement.
- OFFRE INVINCIBLE™ : Le système à recopier pour créer des offres 2 fois plus rentables.
- SIDE BUSINESS™ : Comment générer 1000€ à 3000€ par mois à côté de ton job, sans y passer tes soirées.

ANTI-GÉNÉRALITÉS :
- Interdit les titres génériques ("Formation complète", "Guide ultime")
- Chaque titre doit contenir un RÉSULTAT CONCRET + un MÉCANISME ou une CONTRAINTE
- Chaque pitch doit parler au prospect en "tu" et toucher une douleur précise
${buildRefusalsBlock(bp as AnyRecord)}

IMPORTANT : Réponds en JSON strict uniquement, sans texte autour.`;

        const userPrompt = `PROFIL DE L'UTILISATEUR :
- Formule de niche : "${nicheFormula || "non renseignée"}"
- Objectif de revenu : ${revenueGoal || "non renseigné"}

CLIENT IDÉAL :
- Problème principal : ${clientProblem || "non renseigné"}
- Ce qu'il a déjà essayé : ${clientPrevAttempts || "non renseigné"}
- Pourquoi ça n'a pas marché : ${clientFailures || "non renseigné"}
- Sa vie idéale après résolution : ${clientFutureLife || "non renseigné"}

RÉPONSES SPÉCIFIQUES PYRAMIDE :
- Problème urgent à résoudre : ${urgentProblem || "non renseigné"}
- Résultat rapide promis (effet wow 7 jours) : ${quickResult || "non renseigné"}
- 3 plus gros obstacles du client : ${topObstacles || "non renseigné"}
- Méthodes uniques/innovantes : ${uniqueMethods || "non renseigné"}
- Formats préférés : ${offerFormats.length > 0 ? offerFormats.join(", ") : "non renseigné"}
- Pourquoi l'offre est unique : ${uniqueness || "non renseigné"}

${contextBlock ? `RESSOURCES INTERNES :\n${contextBlock}` : ""}

DONNÉES COMPLÈTES DU PROFIL :
${JSON.stringify({
  first_name: (bp as any).first_name ?? null,
  niche: (bp as any).niche ?? null,
  maturity: (bp as any).maturity ?? null,
  biggest_blocker: (bp as any).biggest_blocker ?? null,
  weekly_hours: (bp as any).weekly_hours ?? null,
  preferred_content_type: (bp as any).preferred_content_type ?? null,
  tone_preference: (bp as any).tone_preference ?? null,
}, null, 2)}

STRUCTURE EXACTE À RENVOYER :
{
  "offer_pyramids": [
    {
      "id": "A",
      "name": "NOM PERCUTANT DE LA PYRAMIDE A",
      "strategy_summary": "1 phrase expliquant l'angle stratégique unique de cette pyramide",
      "lead_magnet": {
        "title": "TITRE PRINCIPAL",
        "titles": ["TITRE 1™", "TITRE 2™", "TITRE 3™"],
        "pitch": "Pitch complet et percutant du lead magnet",
        "problem": "Le problème urgent que ça résout",
        "transformation": "La transformation/résultat concret",
        "format": "checklist / template / quiz / etc.",
        "price": 0,
        "bonuses": ["Bonus 1", "Bonus 2", "Bonus 3"],
        "guarantee": "Garantie rassurante",
        "cta": "Appel à l'action clair"
      },
      "low_ticket": { ... même structure, price entre 7 et 97 },
      "middle_ticket": { ... même structure, price entre 97 et 497 (optionnel mais recommandé) },
      "high_ticket": { ... même structure, price entre 497 et 9997 }
    }
  ]
}`;

        // Credits
        await ensureUserCredits(userId);

        sendSSE("progress", { step: "Tipote crée tes 3 pyramides d'offres..." });

        const aiResponse = await ai.chat.completions.create({
          ...cachingParams("offer_pyramid"),
          model: OPENAI_MODEL,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_completion_tokens: 12000,
        } as any);

        const raw = aiResponse.choices?.[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw) as AnyRecord;
        await consumeCredits(userId, 1, { feature: "offer_pyramid" });

        const offersRaw = asArray(parsed.offer_pyramids);
        const normalizedOffers = offersRaw.map((p, idx) => normalizeOfferSet(asRecord(p), idx));

        if (!offersLookUseful(normalizedOffers)) {
          console.error("AI returned incomplete offer_pyramids:", parsed);
          sendSSE("error", { error: "AI returned incomplete pyramids" });
          clearInterval(heartbeat);
          controller.close();
          return;
        }

        sendSSE("progress", { step: "Sauvegarde de tes pyramides..." });

        // Primary: persist to offer_pyramids table
        const pyramidRunId = crypto.randomUUID();
        try {
          await persistOfferPyramids({ userId, pyramids: normalizedOffers, pyramidRunId, selectedIndex: null, projectId });
        } catch (e) {
          console.error("POST persistOfferPyramids error:", e);
        }

        // Backward compat: also save to business_plan.plan_json
        const basePlan: AnyRecord = isRecord(existingPlanJson) ? existingPlanJson : {};
        const plan_json: AnyRecord = {
          ...basePlan,
          offer_pyramids: normalizedOffers,
          offer_pyramids_run_id: pyramidRunId,
          horizon_days: toNumber(basePlan.horizon_days) ?? 90,
          selected_offer_pyramid_index: basePlan.selected_offer_pyramid_index ?? null,
          selected_offer_pyramid: basePlan.selected_offer_pyramid ?? null,
          selected_pyramid_index: basePlan.selected_pyramid_index ?? null,
          selected_pyramid: basePlan.selected_pyramid ?? null,
          updated_at: new Date().toISOString(),
        };

        await supabase
          .from("business_plan")
          .upsert({ user_id: userId, ...(projectId ? { project_id: projectId } : {}), plan_json, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
          .select("id")
          .maybeSingle();

        sendSSE("result", { success: true, offer_pyramids: normalizedOffers });
      } catch (err) {
        console.error("POST /api/strategy/offer-pyramid SSE error:", err);
        sendSSE("error", { error: err instanceof Error ? err.message : "Internal server error" });
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
