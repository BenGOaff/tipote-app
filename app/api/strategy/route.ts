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

function cleanString(v: unknown, max = 5000): string {
  const s = typeof v === "string" ? v : v == null ? "" : String(v);
  return s.trim().slice(0, max);
}

function safeJsonParse(s: string): AnyRecord | null {
  try {
    const o = JSON.parse(s);
    return asRecord(o);
  } catch {
    return null;
  }
}

function isMeaningfulOfferPyramid(p: unknown): boolean {
  const r = asRecord(p);
  if (!r) return false;

  const name = cleanString((r as any).name ?? (r as any).label, 200);
  if (!name) return false;

  const lead = asRecord((r as any).lead_magnet);
  const low = asRecord((r as any).low_ticket);
  const core = asRecord((r as any).core_offer);
  const premium = asRecord((r as any).premium_offer);

  const hasAnyLevelText =
    !!cleanString((lead as any)?.composition, 500) ||
    !!cleanString((lead as any)?.goal, 500) ||
    !!cleanString((lead as any)?.format, 200) ||
    !!cleanString((low as any)?.composition, 500) ||
    !!cleanString((low as any)?.goal, 500) ||
    !!cleanString((low as any)?.format, 200) ||
    !!cleanString((core as any)?.composition, 500) ||
    !!cleanString((core as any)?.goal, 500) ||
    !!cleanString((core as any)?.format, 200) ||
    !!cleanString((premium as any)?.composition, 500) ||
    !!cleanString((premium as any)?.goal, 500) ||
    !!cleanString((premium as any)?.format, 200);

  return hasAnyLevelText;
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    // ⚠️ Important : cette route est appelée en “non-bloquant” depuis l'onboarding.
    // On renvoie toujours 200 avec { success:false } plutôt qu’un 500 dur, pour ne pas bloquer l'UX.
    if (sessionError) {
      console.error("Error getting session:", sessionError);
      return NextResponse.json({ success: false, error: "Failed to get session" }, { status: 200 });
    }

    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 200 });
    }

    const userId = session.user.id;

    // 0) Check existing business_plan : si pyramides déjà “utiles” ou choix déjà fait, on ne régénère pas
    const { data: existingPlan, error: existingPlanError } = await supabase
      .from("business_plan")
      .select("id, plan_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingPlanError) {
      console.error("Error checking existing business_plan:", existingPlanError);
    }

    const existingPlanJson = asRecord(existingPlan?.plan_json);
    const existingOfferPyramids = existingPlanJson ? asArray((existingPlanJson as any).offer_pyramids) : [];

    const existingSelectedIndex =
      typeof (existingPlanJson as any)?.selected_offer_pyramid_index === "number"
        ? ((existingPlanJson as any).selected_offer_pyramid_index as number)
        : null;

    const existingSelectedPyramid =
      (existingPlanJson as any)?.selected_offer_pyramid && typeof (existingPlanJson as any).selected_offer_pyramid === "object"
        ? ((existingPlanJson as any).selected_offer_pyramid as AnyRecord)
        : null;

    const hasUsableOfferPyramids =
      existingOfferPyramids.length >= 3 && existingOfferPyramids.some((p) => isMeaningfulOfferPyramid(p));

    if (existingPlan && (existingSelectedIndex !== null || hasUsableOfferPyramids)) {
      return NextResponse.json({
        success: true,
        alreadyExists: true,
        planId: (existingPlan as any)?.id ?? null,
      });
    }

    // 1) Lire business profile
    const { data: businessProfile, error: profileError } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (profileError || !businessProfile) {
      console.error("Business profile error:", profileError);
      return NextResponse.json({ success: false, error: "Business profile missing" }, { status: 200 });
    }

    // 2) Lire ressources
    const { data: resources, error: resourcesError } = await supabase.from("resources").select("*");
    if (resourcesError) console.error("Error loading resources:", resourcesError);

    const { data: resourceChunks, error: chunksError } = await supabase.from("resource_chunks").select("*");
    if (chunksError) console.error("Error loading resource_chunks:", chunksError);

    const MAX_CHUNKS = 50;
    const limitedChunks =
      resourceChunks && resourceChunks.length > MAX_CHUNKS ? resourceChunks.slice(0, MAX_CHUNKS) : resourceChunks || [];

    // 3) Prompt JSON strict (inclut les 3 pyramides)
    const systemPrompt = `
Tu es un stratège business senior. Tu aides des solopreneurs et petites équipes
à clarifier leur stratégie, leurs offres et leurs priorités.

Tu dois STRICTEMENT répondre au format JSON valide, sans texte autour.
`;

    const userPrompt = `
Voici le profil business de l'utilisateur (réponses d'onboarding) :
${JSON.stringify(businessProfile, null, 2)}

Voici des ressources internes (frameworks, méthodologies, exemples) :
- resources (métadonnées) : ${JSON.stringify(resources || [], null, 2)}
- resource_chunks (contenu découpé, max ${MAX_CHUNKS} chunks) : ${JSON.stringify(limitedChunks, null, 2)}

Génère un plan stratégique complet au format JSON avec exactement cette structure :

{
  "mission": "string",
  "promise": "string",
  "positioning": "string",
  "summary": "string",
  "personas": [{"name":"string","description":"string"}],
  "goals": [{"horizon":"30j | 90j | 12m","goal":"string"}],

  "offer_pyramids": [
    {
      "name": "string",
      "strategy_summary": "string",
      "lead_magnet": {"composition":"string","goal":"string","format":"string"},
      "low_ticket": {"composition":"string","goal":"string","format":"string"},
      "core_offer": {"composition":"string","goal":"string","format":"string"},
      "premium_offer": {"composition":"string","goal":"string","format":"string"}
    }
  ],

  "plan_90_days": {
    "tasks_by_timeframe": {
      "7d": [{"title":"string","due_date":"YYYY-MM-DD"}],
      "30d": [{"title":"string","due_date":"YYYY-MM-DD"}],
      "90d": [{"title":"string","due_date":"YYYY-MM-DD"}]
    }
  }
}

Contraintes impératives :
- "offer_pyramids" doit contenir EXACTEMENT 3 scénarios.
- Chaque champ texte doit être renseigné (pas vide).
- Français clair et concret.
- Ne renvoie QUE un JSON valide.
`;

    // ✅ Fix TS + robustesse: openai peut être null (clé owner absente)
    const ai = openai;
    if (!ai) {
      return NextResponse.json(
        { success: false, error: "OPENAI_API_KEY_OWNER is not set (strategy generation disabled)" },
        { status: 200 },
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
      return NextResponse.json({ success: false, error: "Empty AI response" }, { status: 200 });
    }

    const strategyJson = safeJsonParse(content);
    if (!strategyJson) {
      console.error("Error parsing AI JSON:", content);
      return NextResponse.json({ success: false, error: "Failed to parse AI JSON" }, { status: 200 });
    }

    // Normalisation pyramides
    const offerPyramidsRaw = asArray((strategyJson as any).offer_pyramids);
    const offerPyramids = offerPyramidsRaw.slice(0, 3).map((p) => {
      const r = asRecord(p) ?? {};
      const lead = asRecord((r as any).lead_magnet) ?? {};
      const low = asRecord((r as any).low_ticket) ?? {};
      const core = asRecord((r as any).core_offer) ?? {};
      const prem = asRecord((r as any).premium_offer) ?? {};

      return {
        name: cleanString((r as any).name, 200),
        strategy_summary: cleanString((r as any).strategy_summary, 1200),

        lead_magnet: {
          composition: cleanString((lead as any).composition, 2000),
          goal: cleanString((lead as any).goal, 1200),
          format: cleanString((lead as any).format, 300),
        },
        low_ticket: {
          composition: cleanString((low as any).composition, 2000),
          goal: cleanString((low as any).goal, 1200),
          format: cleanString((low as any).format, 300),
        },
        core_offer: {
          composition: cleanString((core as any).composition, 2000),
          goal: cleanString((core as any).goal, 1200),
          format: cleanString((core as any).format, 300),
        },
        premium_offer: {
          composition: cleanString((prem as any).composition, 2000),
          goal: cleanString((prem as any).goal, 1200),
          format: cleanString((prem as any).format, 300),
        },
      };
    });

    const tasks_by_timeframe = (strategyJson as any).plan_90_days?.tasks_by_timeframe || {};

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
      return NextResponse.json({ success: false, error: "Failed to save business plan" }, { status: 200 });
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
      { status: 200 },
    );
  }
}
