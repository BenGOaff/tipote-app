// app/api/strategy/offer-pyramid/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai } from "@/lib/openaiClient";

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

function pickRevenueGoalLabel(businessProfile: AnyRecord): string {
  /**
   * ✅ Priorités (suite logique)
   * 1) business_profiles.revenue_goal_monthly (champ onboarding ajouté, TEXT)
   * 2) business_profiles.target_monthly_revenue / revenue_goal (anciens champs)
   * 3) business_profiles.main_goal (objectif 90 jours)
   * 4) business_profiles.main_goals[0] (objectif "symbolique")
   */
  const monthly = cleanString(businessProfile.revenue_goal_monthly, 64);
  if (monthly) return monthly;

  const direct =
    cleanString(businessProfile.target_monthly_revenue, 64) || cleanString(businessProfile.revenue_goal, 240);
  if (direct) return direct;

  const mg = cleanString(businessProfile.main_goal, 240) || cleanString(businessProfile.mainGoal90Days, 240);
  if (mg) return mg;

  const goals = asArray(businessProfile.main_goals);
  if (goals.length) return cleanString(goals[0], 240);

  return "";
}

/**
 * ✅ Best-effort: garde la table strategies sync (si présente) sans bloquer le flux
 */
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
      parseMoneyFromText(planJson.target_monthly_rev) ??
      parseMoneyFromText(planJson.target_monthly_revenue) ??
      parseMoneyFromText(planJson.revenue_goal) ??
      parseMoneyFromText(planJson.goal_revenue) ??
      parseMoneyFromText(planJson.main_goal) ??
      parseMoneyFromText(businessProfile.revenue_goal_monthly) ??
      parseMoneyFromText(businessProfile.target_monthly_revenue) ??
      parseMoneyFromText(businessProfile.revenue_goal);

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

    if (upsertRes?.error) {
      const insRes = await supabase.from("strategies").insert(payload).select("id").maybeSingle();
      if (insRes?.error) console.error("persistStrategyRow failed:", insRes.error);
    }
  } catch (e) {
    console.error("persistStrategyRow unexpected error:", e);
  }
}

/**
 * ✅ NEW (anti-régression): récupérer un strategy_id best-effort
 * - si table strategies absente / pas de row, on retourne null (et on continue sans bloquer)
 */
async function getOrCreateStrategyIdBestEffort(params: {
  supabase: any;
  userId: string;
  businessProfile: AnyRecord;
  planJson: AnyRecord;
}): Promise<string | null> {
  const { supabase, userId, businessProfile, planJson } = params;
  try {
    // 1) essayer de lire
    const readRes = await supabase.from("strategies").select("id").eq("user_id", userId).maybeSingle();
    if (readRes?.data?.id) return String(readRes.data.id);

    // 2) tenter de créer via persist, puis relire
    await persistStrategyRow({ supabase, userId, businessProfile, planJson });

    const readRes2 = await supabase.from("strategies").select("id").eq("user_id", userId).maybeSingle();
    if (readRes2?.data?.id) return String(readRes2.data.id);
  } catch (e) {
    // table peut ne pas exister => on ignore
    console.error("getOrCreateStrategyIdBestEffort error:", e);
  }
  return null;
}

function normalizeOffer(offer: AnyRecord | null): AnyRecord | null {
  if (!offer) return null;
  const title = cleanString(offer.title ?? offer.nom ?? offer.name, 160);
  const composition = cleanString(offer.composition ?? offer.contenu ?? "", 1200);
  const purpose = cleanString(offer.purpose ?? offer.objectif ?? offer.benefit ?? "", 500);
  const format = cleanString(offer.format ?? offer.type ?? "", 180);
  const insight = cleanString(offer.insight ?? offer.angle ?? "", 500);
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
    asRecord(p?.lead_magnet) ?? asRecord(p?.leadMagnet) ?? asRecord(p?.lead) ?? asRecord(p?.lead_offer) ?? null;

  const low =
    asRecord(p?.low_ticket) ?? asRecord(p?.lowTicket) ?? asRecord(p?.mid) ?? asRecord(p?.middle_offer) ?? null;

  const high =
    asRecord(p?.high_ticket) ?? asRecord(p?.highTicket) ?? asRecord(p?.high) ?? asRecord(p?.high_offer) ?? null;

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
 * ✅ Best-effort: persister les offres (par niveau) dans public.offer_pyramids
 * IMPORTANT :
 * - Ta table actuelle est “par niveau” (lead/low/high), pas “pyramide complète”.
 * - Sans colonne de groupement (pyramid_id), on fait un stockage pragmatique :
 *   - 3 lignes par pyramide, name = "${pyramid.name} — Lead magnet|Low ticket|High ticket"
 *   - description/composition/purpose/insight mappés au mieux.
 * - Si la table / enum / colonnes diffèrent en prod => on ignore sans bloquer.
 */
async function persistOfferPyramidsBestEffort(params: {
  supabase: any;
  userId: string;
  strategyId: string | null;
  pyramids: AnyRecord[];
  selectedIndex: number | null;
}): Promise<void> {
  const { supabase, userId, strategyId, pyramids, selectedIndex } = params;
  if (!Array.isArray(pyramids) || pyramids.length < 1) return;

  // si pas de strategyId, on essaie quand même avec null (si la colonne est nullable)
  const now = new Date().toISOString();

  function mkRow(args: {
    pyramidName: string;
    pyramidSummary: string;
    level: "lead_magnet" | "low_ticket" | "high_ticket";
    offer: AnyRecord;
    isFlagship: boolean;
  }): AnyRecord {
    const title = cleanString(args.offer.title, 160);
    const format = cleanString(args.offer.format, 180);
    const composition = cleanString(args.offer.composition, 1200);
    const purpose = cleanString(args.offer.purpose, 500);
    const insight = cleanString(args.offer.insight, 500);
    const price = toNumber(args.offer.price);

    // mapping "pragmatique" vers ta table
    return {
      user_id: userId,
      ...(strategyId ? { strategy_id: strategyId } : {}),
      level: args.level, // ⚠️ doit matcher ton enum offer_level (sinon catch)
      name: cleanString(`${args.pyramidName} — ${title || args.level}`, 240),
      description: cleanString(`${args.pyramidSummary}\n\n${composition}`, 2000),
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
    const pyramidName = cleanString(p.name, 160) || `Pyramide ${idx + 1}`;
    const pyramidSummary = cleanString(p.strategy_summary, 800);

    const lead = asRecord(p.lead_magnet);
    const low = asRecord(p.low_ticket);
    const high = asRecord(p.high_ticket);

    const isSelected = typeof selectedIndex === "number" && idx === selectedIndex;

    if (lead) rows.push(mkRow({ pyramidName, pyramidSummary, level: "lead_magnet", offer: lead, isFlagship: isSelected }));
    if (low) rows.push(mkRow({ pyramidName, pyramidSummary, level: "low_ticket", offer: low, isFlagship: isSelected }));
    if (high) rows.push(mkRow({ pyramidName, pyramidSummary, level: "high_ticket", offer: high, isFlagship: isSelected }));
  });

  if (!rows.length) return;

  try {
    // best-effort insert (pas d’upsert car on ne connait pas tes uniques)
    const ins = await supabase.from("offer_pyramids").insert(rows);
    if (ins?.error) {
      // si enum/colonnes ne matchent pas => on ignore
      console.error("persistOfferPyramidsBestEffort insert error:", ins.error);
    }
  } catch (e) {
    console.error("persistOfferPyramidsBestEffort unexpected error:", e);
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userId = session.user.id;

    const body = (await req.json().catch(() => ({}))) as AnyRecord;

    const selectedIndexRaw = body?.selectedIndex;
    const pyramidRaw = body?.pyramid;

    const selectedIndex =
      typeof selectedIndexRaw === "number"
        ? selectedIndexRaw
        : typeof selectedIndexRaw === "string"
          ? Number(selectedIndexRaw)
          : null;

    if (selectedIndex === null || !Number.isFinite(selectedIndex) || selectedIndex < 0) {
      return NextResponse.json({ success: false, error: "Invalid selectedIndex" }, { status: 400 });
    }

    const pyramid = asRecord(pyramidRaw);
    if (!pyramid) {
      return NextResponse.json({ success: false, error: "Invalid pyramid" }, { status: 400 });
    }

    // Lire le plan existant (si présent), puis fusionner sans casser l’existant.
    const { data: planRow, error: planErr } = await supabase
      .from("business_plan")
      .select("plan_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (planErr) console.error("Error reading business_plan for PATCH:", planErr);

    const basePlan: AnyRecord = isRecord(planRow?.plan_json) ? (planRow?.plan_json as AnyRecord) : {};

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

    if (saveErr) {
      console.error("Error saving selection in business_plan:", saveErr);
      return NextResponse.json({ success: false, error: saveErr.message }, { status: 500 });
    }

    // Opportuniste : garder la table strategies sync (best-effort)
    try {
      const { data: businessProfile } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (businessProfile) {
        // ensure strategy exists
        const strategyId = await getOrCreateStrategyIdBestEffort({
          supabase,
          userId,
          businessProfile: businessProfile as AnyRecord,
          planJson: nextPlan,
        });

        // best-effort: écrire aussi la pyramide choisie dans offer_pyramids
        // (on réécrit seulement la pyramide choisie, marquée is_flagship)
        const normalizedSelected = normalizePyramid(pyramid, 0);
        await persistOfferPyramidsBestEffort({
          supabase,
          userId,
          strategyId,
          pyramids: [normalizedSelected],
          selectedIndex: 0,
        });
      }
    } catch (e) {
      console.error("PATCH best-effort sync unexpected error:", e);
    }

    return NextResponse.json({ success: true, planId: saved?.id ?? null }, { status: 200 });
  } catch (err) {
    console.error("Unhandled error in PATCH /api/strategy/offer-pyramid:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
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

    const { data: existingPlan, error: existingPlanError } = await supabase
      .from("business_plan")
      .select("plan_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingPlanError) console.error("Error checking existing business_plan:", existingPlanError);

    const existingPlanJson = (existingPlan?.plan_json ?? null) as AnyRecord | null;

    const existingOfferPyramids = existingPlanJson ? asArray(existingPlanJson.offer_pyramids) : [];
    const existingSelectedIndex =
      typeof existingPlanJson?.selected_offer_pyramid_index === "number"
        ? existingPlanJson.selected_offer_pyramid_index
        : typeof existingPlanJson?.selected_pyramid_index === "number"
          ? existingPlanJson.selected_pyramid_index
          : null;

    const hasSelected = typeof existingSelectedIndex === "number";
    const hasUsefulPyramids = pyramidsLookUseful(existingOfferPyramids);

    // Si déjà choisi => ici, on ne fait que générer les pyramides si elles n'existent pas.
    // (La stratégie complète est générée par /api/strategy/route.ts dans ton flow)
    if (!hasSelected && hasUsefulPyramids) {
      return NextResponse.json({ success: true, planId: null, skipped: true, reason: "already_generated" }, { status: 200 });
    }

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

    const { data: resources, error: resourcesError } = await supabase.from("resources").select("*");
    if (resourcesError) console.error("Error loading resources:", resourcesError);

    const { data: resourceChunks, error: chunksError } = await supabase.from("resource_chunks").select("*");
    if (chunksError) console.error("Error loading resource_chunks:", chunksError);

    const MAX_CHUNKS = 24;
    const limitedChunks = Array.isArray(resourceChunks) ? resourceChunks.slice(0, MAX_CHUNKS) : [];

    const ai = openai;
    if (!ai) {
      return NextResponse.json(
        { success: false, error: "OPENAI_API_KEY_OWNER is not set (strategy generation disabled)" },
        { status: 500 },
      );
    }

    // ✅ Générer les pyramides si pas utiles
    if (!hasUsefulPyramids) {
      const PYRAMIDS_COUNT = 5; // ton process = 5 pyramides

      const systemPrompt = `Tu es Tipote™, un coach business senior (niveau mastermind) spécialisé en offre, positionnement, acquisition et systèmes.

OBJECTIF :
Proposer ${PYRAMIDS_COUNT} pyramides d'offres (lead magnet → low ticket → high ticket) adaptées à l'utilisateur.

SOURCE DE VÉRITÉ (ordre de priorité) :
1) business_profile.diagnostic_profile (si présent) = vérité terrain.
2) diagnostic_summary + diagnostic_answers (si présents).
3) Champs onboarding “cases” = fallback.

EXIGENCES :
- Zéro blabla : actionnable, spécifique, niché.
- Chaque pyramide = une stratégie distincte (angle, mécanisme, promesse, canal, format).
- Respecte contraintes & non-négociables (temps, énergie, budget, formats refusés).
- Chaque pyramide doit inclure un quick win 7 jours dans sa logique (via lead/low/angle).

IMPORTANT :
Réponds en JSON strict uniquement, sans texte autour.`;

      const userPrompt = `SOURCE PRIORITAIRE — Diagnostic (si présent) :
- diagnostic_profile :
${JSON.stringify((businessProfile as any).diagnostic_profile ?? (businessProfile as any).diagnosticProfile ?? null, null, 2)}

- diagnostic_summary :
${JSON.stringify((businessProfile as any).diagnostic_summary ?? (businessProfile as any).diagnosticSummary ?? null, null, 2)}

- diagnostic_answers :
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

Ressources internes (si utiles) :
${JSON.stringify(resources ?? [], null, 2)}

Chunks (extraits) :
${JSON.stringify(limitedChunks ?? [], null, 2)}

Contraintes :
- Génère ${PYRAMIDS_COUNT} pyramides complètes.
- Chaque pyramide contient : lead_magnet, low_ticket, high_ticket.
- Pour chaque offre, renseigne :
  - title
  - format
  - price (nombre)
  - composition (livrables concrets)
  - purpose (objectif/transformation)
  - insight (1 phrase: pourquoi ça convertit)
- La logique globale de chaque pyramide = strategy_summary (1 phrase)

STRUCTURE EXACTE À RENVOYER :
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
      const plan_json: AnyRecord = {
        ...basePlan,
        offer_pyramids: normalizedOfferPyramids,
        ...(cleanString(basePlan.revenue_goal, 240) || revenueGoalLabel
          ? { revenue_goal: cleanString(basePlan.revenue_goal, 240) || revenueGoalLabel }
          : {}),
        horizon_days: toNumber(basePlan.horizon_days) ?? 90,
        ...(targetMonthlyRevGuess !== null ? { target_monthly_rev: targetMonthlyRevGuess } : {}),
        selected_offer_pyramid_index:
          typeof basePlan.selected_offer_pyramid_index === "number" ? basePlan.selected_offer_pyramid_index : null,
        selected_offer_pyramid: basePlan.selected_offer_pyramid ?? null,
        // compat legacy
        selected_pyramid_index: typeof basePlan.selected_pyramid_index === "number" ? basePlan.selected_pyramid_index : null,
        selected_pyramid: basePlan.selected_pyramid ?? null,
        updated_at: new Date().toISOString(),
      };

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

      // ✅ Best-effort: sync strategies + offer_pyramids table
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
          selectedIndex: null,
        });
      } catch (e) {
        console.error("POST best-effort sync unexpected error:", e);
      }

      return NextResponse.json({ success: true, planId: saved?.id ?? null }, { status: 200 });
    }

    // Si on arrive ici, les pyramides existent déjà : on renvoie OK (idempotent)
    return NextResponse.json({ success: true, planId: null, skipped: true, reason: "already_generated" }, { status: 200 });
  } catch (err) {
    console.error("Unhandled error in POST /api/strategy/offer-pyramid:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
