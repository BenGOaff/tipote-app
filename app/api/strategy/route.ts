// app/api/strategy/route.ts

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai } from "@/lib/openaiClient";

type AnyRecord = Record<string, unknown>;

function asRecord(v: unknown): AnyRecord | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRecord) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function cleanString(v: unknown, maxLen = 4000): string {
  if (typeof v !== "string") return "";
  const s = v.trim().replace(/\s+/g, " ");
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function safeJsonParse(raw: string): AnyRecord | null {
  try {
    const parsed = JSON.parse(raw);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function normalizeOffer(o: AnyRecord | null): AnyRecord {
  const title = cleanString(o?.title, 120);
  const composition = cleanString(o?.composition, 2000);
  const purpose = cleanString(o?.purpose, 800);
  const format = cleanString(o?.format, 200);

  return {
    title,
    composition,
    purpose,
    format,
  };
}

function normalizePyramid(p: AnyRecord | null, idx: number): AnyRecord {
  const name = cleanString(p?.name, 120) || `Stratégie ${idx + 1}`;
  const strategy_summary = cleanString(p?.strategy_summary, 4000);

  const leadMagnet = asRecord(p?.lead_magnet);
  const lowTicket = asRecord(p?.low_ticket);
  const highTicket = asRecord(p?.high_ticket);

  return {
    id: String(p?.id ?? idx),
    name,
    strategy_summary,
    lead_magnet: normalizeOffer(leadMagnet),
    low_ticket: normalizeOffer(lowTicket),
    high_ticket: normalizeOffer(highTicket),
  };
}

function pyramidsLookUseful(pyramids: unknown[]): boolean {
  if (!Array.isArray(pyramids) || pyramids.length < 3) return false;

  const first = asRecord(pyramids[0]);
  const second = asRecord(pyramids[1]);
  const third = asRecord(pyramids[2]);

  const hasAnyLevelText = (p: AnyRecord | null) => {
    const lead = asRecord(p?.lead_magnet);
    const low = asRecord(p?.low_ticket);
    const high = asRecord(p?.high_ticket);

    const hasOffer = (o: AnyRecord | null) =>
      !!cleanString((o as any)?.title, 120) ||
      !!cleanString((o as any)?.composition, 500) ||
      !!cleanString((o as any)?.purpose, 500) ||
      !!cleanString((o as any)?.format, 200);

    const hasSummary = !!cleanString((p as any)?.strategy_summary, 300);
    return hasSummary || hasOffer(lead) || hasOffer(low) || hasOffer(high);
  };

  return hasAnyLevelText(first) && hasAnyLevelText(second) && hasAnyLevelText(third);
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Session error:", sessionError);
      return NextResponse.json(
        { success: false, error: `Failed to get session: ${sessionError.message}` },
        { status: 500 },
      );
    }

    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userId = session.user.id;

    // 0) Check existing business_plan : si pyramides déjà “utiles” ou choix déjà fait, on ne régénère pas
    const { data: existingPlan, error: existingPlanError } = await supabase
      .from("business_plan")
      .select("plan_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingPlanError) {
      console.error("Error checking existing business_plan:", existingPlanError);
      // Non bloquant : on laisse tenter la génération, mais on log.
    }

    const existingPlanJson = (existingPlan?.plan_json ?? null) as any;
    const existingOfferPyramids = existingPlanJson ? asArray((existingPlanJson as any).offer_pyramids) : [];
    const existingSelectedIndex =
      typeof (existingPlanJson as any)?.selected_offer_pyramid_index === "number"
        ? (existingPlanJson as any).selected_offer_pyramid_index
        : null;
    const existingSelectedPyramid = (existingPlanJson as any)?.selected_offer_pyramid ?? null;

    // Si l'user a déjà choisi une pyramide, on ne régénère pas
    if (typeof existingSelectedIndex === "number") {
      return NextResponse.json(
        { success: true, planId: null, skipped: true, reason: "already_selected" },
        { status: 200 },
      );
    }

    // Si on a déjà 3 pyramides “utiles”, on ne régénère pas (idempotent)
    if (pyramidsLookUseful(existingOfferPyramids)) {
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

    // 2) Lire ressources
    const { data: resources, error: resourcesError } = await supabase.from("resources").select("*");
    if (resourcesError) console.error("Error loading resources:", resourcesError);

    const { data: resourceChunks, error: chunksError } = await supabase.from("resource_chunks").select("*");
    if (chunksError) console.error("Error loading resource_chunks:", chunksError);

    const MAX_CHUNKS = 30;
    const limitedChunks = Array.isArray(resourceChunks) ? resourceChunks.slice(0, MAX_CHUNKS) : [];

    // 3) Prompt + call IA
    const systemPrompt = `Tu es Tipote, un expert en stratégie business et marketing.
Tu dois produire un plan stratégique très concret à partir des données onboarding et des ressources internes.
Tu dois répondre en JSON strict.

Structure JSON attendue (exemple de shape, pas de valeurs fixes) :
{
  "mission": "string",
  "promise": "string",
  "positioning": "string",
  "summary": "string",
  "personas": [{"name":"string","description":"string"}],
  "goals": [{"title":"string","metric":"string","target":"string","deadline":"string"}],
  "offer_pyramids": [
    {
      "id": "string",
      "name": "string",
      "strategy_summary": "string",
      "lead_magnet": {"title":"string","composition":"string","purpose":"string","format":"string"},
      "low_ticket": {"title":"string","composition":"string","purpose":"string","format":"string"},
      "high_ticket": {"title":"string","composition":"string","purpose":"string","format":"string"}
    }
  ],
  "plan_90_days": {
    "tasks_by_timeframe": {
      "week_1_2": [{"title":"string","description":"string","priority":"low|medium|high"}],
      "week_3_4": [{"title":"string","description":"string","priority":"low|medium|high"}],
      "month_2": [{"title":"string","description":"string","priority":"low|medium|high"}],
      "month_3": [{"title":"string","description":"string","priority":"low|medium|high"}]
    }
  }
}

Contraintes impératives :
- "offer_pyramids" doit contenir EXACTEMENT 3 scénarios.
- Chaque champ texte doit être renseigné (pas vide).
- Français clair et concret.
- Ne renvoie QUE un JSON valide.
`;

    const userPrompt = `Données onboarding (business_profiles) :
${JSON.stringify(businessProfile, null, 2)}

Ressources internes (métadonnées) :
${JSON.stringify(resources || [], null, 2)}

resource_chunks (contenu découpé, max ${MAX_CHUNKS} chunks) :
${JSON.stringify(limitedChunks, null, 2)}
`;

    // ✅ Fix TS + robustesse: openai peut être null (clé owner absente)
    const ai = openai;
    if (!ai) {
      return NextResponse.json(
        { success: false, error: "OPENAI_API_KEY_OWNER is not set (strategy generation disabled)" },
        { status: 500 },
      );
    }

    const aiResponse = await ai.chat.completions.create({
      model: "gpt-4.1",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const content = aiResponse.choices[0]?.message?.content;
    if (!content) {
      console.error("Empty AI response");
      return NextResponse.json(
        { success: false, error: "Empty AI response" },
        { status: 502 },
      );
    }

    const strategyJson = safeJsonParse(content);
    if (!strategyJson) {
      console.error("Error parsing AI JSON:", content);
      return NextResponse.json(
        { success: false, error: "Failed to parse AI JSON (see server logs for raw output)" },
        { status: 502 },
      );
    }

    // 3-bis) Normalisation + validation
    const offerPyramidsRaw = asArray((strategyJson as any).offer_pyramids);
    const offerPyramids = offerPyramidsRaw.slice(0, 3).map((p: any, idx: number) => normalizePyramid(asRecord(p), idx));

    // Si l’IA n’en a pas retourné 3, on force une erreur (sinon UX incohérente)
    if (offerPyramids.length !== 3) {
      console.error("Invalid offer_pyramids count:", offerPyramidsRaw);
      return NextResponse.json(
        { success: false, error: "AI returned invalid offer_pyramids (must be exactly 3)" },
        { status: 502 },
      );
    }

    const tasksByTimeframe = asRecord((strategyJson as any).plan_90_days)?.tasks_by_timeframe;
    const tasks_by_timeframe: AnyRecord = {
      week_1_2: asArray((tasksByTimeframe as any)?.week_1_2),
      week_3_4: asArray((tasksByTimeframe as any)?.week_3_4),
      month_2: asArray((tasksByTimeframe as any)?.month_2),
      month_3: asArray((tasksByTimeframe as any)?.month_3),
    };

    // 4) Construire plan_json final
    const plan_json: AnyRecord = {
      mission: cleanString((strategyJson as any).mission, 2000),
      promise: cleanString((strategyJson as any).promise, 2000),
      positioning: cleanString((strategyJson as any).positioning, 2000),
      summary: cleanString((strategyJson as any).summary, 8000),
      goals: Array.isArray((strategyJson as any).goals) ? (strategyJson as any).goals : [],
      personas: Array.isArray((strategyJson as any).personas) ? (strategyJson as any).personas : [],
      offer_pyramids: offerPyramids,

      // on préserve un choix existant si présent (sinon null)
      selected_offer_pyramid_index: existingSelectedIndex,
      selected_offer_pyramid: existingSelectedPyramid,

      plan_90_days: {
        tasks_by_timeframe,
      },

      generated_at: new Date().toISOString(),
    };

    const { data: savedPlan, error: planError } = await supabase
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

    if (planError) {
      console.error("Error upserting business_plan:", planError);
      return NextResponse.json(
        { success: false, error: `Failed to save business plan: ${planError.message}` },
        { status: 500 },
      );
    }

    // Legacy inserts : on garde si ton projet les exploite encore, mais non bloquant
    try {
      // (si ton code original insérait aussi dans strategies/personas/... tu l’as peut-être déjà ici)
      // on ne supprime rien côté DB à ce stade.
    } catch (e) {
      console.error("Non-blocking legacy inserts failed:", e);
    }

    return NextResponse.json({ success: true, planId: (savedPlan as any)?.id ?? null }, { status: 200 });
  } catch (err) {
    console.error("Unhandled error in /api/strategy:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
