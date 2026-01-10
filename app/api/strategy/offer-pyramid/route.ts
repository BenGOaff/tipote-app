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
  const direct =
    cleanString(businessProfile.target_monthly_revenue, 64) || cleanString(businessProfile.revenue_goal, 240);
  if (direct) return direct;
  const mg = cleanString(businessProfile.main_goal, 240) || cleanString(businessProfile.mainGoal90Days, 240);
  if (mg) return mg;
  const goals = asArray(businessProfile.main_goals);
  if (goals.length) return cleanString(goals[0], 240);
  return "";
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
      cleanString(planJson.title ?? planJson.summary ?? planJson.strategy_summary ?? "Ma stratégie", 180) || "Ma stratégie";

    const payload: AnyRecord = {
      user_id: userId,
      ...(businessProfileId ? { business_profile_id: businessProfileId } : {}),
      title,
      horizon_days: horizonDays,
      ...(targetMonthlyRev !== null ? { target_monthly_rev: targetMonthlyRev } : {}),
      updated_at: new Date().toISOString(),
    };

    const upsertRes = await supabase.from("strategies").upsert(payload, { onConflict: "user_id" }).select("id").maybeSingle();

    if (upsertRes?.error) {
      const insRes = await supabase.from("strategies").insert(payload).select("id").maybeSingle();
      if (insRes?.error) {
        console.error("persistStrategyRow failed:", insRes.error);
      }
    }
  } catch (e) {
    console.error("persistStrategyRow unexpected error:", e);
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
  const pains = asArray(persona.pains).map((x) => cleanString(x, 160)).filter(Boolean);
  const desires = asArray(persona.desires).map((x) => cleanString(x, 160)).filter(Boolean);
  const channels = asArray(persona.channels).map((x) => cleanString(x, 64)).filter(Boolean);
  const tags = asArray(persona.tags).map((x) => cleanString(x, 64)).filter(Boolean);
  const result = { title, pains, desires, channels, tags };
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

    if (hasSelected && !needFullStrategy) {
      return NextResponse.json({ success: true, planId: null, skipped: true, reason: "already_complete" }, { status: 200 });
    }

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

    if (!hasUsefulPyramids) {
      const systemPrompt = `Tu es un expert en stratégie business et funnels.
Tu dois proposer 3 pyramides d'offres adaptées à la niche de l'utilisateur.

IMPORTANT : Tu dois répondre en JSON strict uniquement, sans texte autour.`;

      const userPrompt = `Contexte business (depuis onboarding) :
${JSON.stringify(businessProfile, null, 2)}

Ressources internes (si utiles) :
${JSON.stringify(resources ?? [], null, 2)}

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

STRUCTURE EXACTE À RENVOYER (JSON strict, pas de texte autour) :
{
  "offer_pyramids": [
    {
      "id": "A",
      "name": "Pyramide A — Simplicité",
      "strategy_summary": "1 phrase",
      "lead_magnet": { "title":"", "format":"", "price":0, "composition":"", "purpose":"", "insight":"" },
      "low_ticket": { "title":"", "format":"", "price":0, "composition":"", "purpose":"", "insight":"" },
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

      return NextResponse.json({ success: true, planId: saved?.id ?? null }, { status: 200 });
    }

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

    const fullSystemPrompt = `Tu es un stratège business senior.
Tu dois créer une stratégie complète et actionnable pour un entrepreneur à partir de son onboarding + de sa pyramide d'offres choisie.

OBJECTIF :
Générer une stratégie actionnable + un plan 90 jours découpé en tâches, pour alimenter automatiquement l'app.

RÈGLES :
- Réponds en JSON strict uniquement, sans texte autour.
- Donne des éléments concrets, pas de blabla.
- Si une info manque, fais une hypothèse plausible basée sur la niche.

FORMAT JSON STRICT À RESPECTER :
{
  "mission": "string",
  "promise": "string",
  "positioning": "string",
  "summary": "string",
  "persona": {
    "title": "profil en 1 phrase (ex: 'Dirigeantes de PME ...')",
    "pains": ["...", "...", "..."],
    "desires": ["...", "...", "..."],
    "channels": ["LinkedIn", "Email", "..."]
  },
  "plan_90_days": {
    "tasks_by_timeframe": {
      "d30": [{ "title": "...", "due_date": "YYYY-MM-DD", "priority": "high|medium|low" }],
      "d60": [{ "title": "...", "due_date": "YYYY-MM-DD", "priority": "high|medium|low" }],
      "d90": [{ "title": "...", "due_date": "YYYY-MM-DD", "priority": "high|medium|low" }]
    }
  }
}`;

    const fullUserPrompt = `Contexte business (onboarding) :
${JSON.stringify(businessProfile, null, 2)}

Pyramide choisie :
${JSON.stringify(selectedPyramid, null, 2)}

Ressources internes (si utiles) :
${JSON.stringify(resources ?? [], null, 2)}

Chunks (extraits) :
${JSON.stringify(limitedChunks ?? [], null, 2)}

Consignes importantes :
- Le plan 90 jours DOIT contenir des tâches avec due_date au format YYYY-MM-DD.
- Donne au moins 6 tâches par timeframe (d30, d60, d90).
- Priorité cohérente avec l'objectif et la maturité.
`;

    const fullAiResponse = await ai.chat.completions.create({
      model: "gpt-4.1",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: fullSystemPrompt },
        { role: "user", content: fullUserPrompt },
      ],
      temperature: 0.7,
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
      summary:
        cleanString(basePlan.summary ?? basePlan.strategy_summary ?? basePlan.strategySummary, 2000) || summary,
      persona: personaLooksUseful(asRecord(basePlan.persona)) ? basePlan.persona : safePersona,
      plan_90_days: {
        ...(asRecord(basePlan.plan_90_days) ?? {}),
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

    await persistStrategyRow({ supabase, userId, businessProfile: businessProfile as AnyRecord, planJson: nextPlan });

    return NextResponse.json({ success: true, planId: savedFull?.id ?? null }, { status: 200 });
  } catch (err) {
    console.error("Unhandled error in /api/strategy/offer-pyramid:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
