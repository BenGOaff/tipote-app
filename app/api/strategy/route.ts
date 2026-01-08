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

function cleanString(v: unknown, max = 4000): string {
  const s = typeof v === "string" ? v : v == null ? "" : String(v);
  return s.trim().slice(0, max);
}

function normalizeOfferPyramids(raw: unknown): AnyRecord[] {
  const arr = asArray(raw).slice(0, 3);
  return arr.map((p, idx) => {
    const r = asRecord(p) ?? {};
    const lead = asRecord(r.lead_magnet) ?? {};
    const low = asRecord(r.low_ticket) ?? {};
    const high = asRecord(r.high_ticket) ?? {};

    return {
      id: cleanString(r.id ?? `p${idx + 1}`, 50) || `p${idx + 1}`,
      name: cleanString(r.name ?? `Stratégie ${idx + 1}`, 120) || `Stratégie ${idx + 1}`,
      strategy_summary: cleanString(r.strategy_summary ?? r.summary, 600),

      lead_magnet: {
        title: cleanString(lead.title ?? lead.name, 160),
        composition: cleanString(lead.composition, 1200),
        purpose: cleanString(lead.purpose, 800),
        format: cleanString(lead.format, 200),
        price_range: cleanString(lead.price_range ?? lead.price, 80),
      },

      low_ticket: {
        title: cleanString(low.title ?? low.name, 160),
        composition: cleanString(low.composition, 1200),
        purpose: cleanString(low.purpose, 800),
        format: cleanString(low.format, 200),
        price_range: cleanString(low.price_range ?? low.price, 80),
      },

      high_ticket: {
        title: cleanString(high.title ?? high.name, 160),
        composition: cleanString(high.composition, 1200),
        purpose: cleanString(high.purpose, 800),
        format: cleanString(high.format, 200),
        price_range: cleanString(high.price_range ?? high.price, 80),
      },
    };
  });
}

function tasksByTimeframeFromPlan(plan_30_60_90: unknown) {
  const r = asRecord(plan_30_60_90) ?? {};
  const d30 = asArray(r.days_30).map((t) => ({ title: cleanString(t, 220) })).filter((x) => x.title);
  const d60 = asArray(r.days_60).map((t) => ({ title: cleanString(t, 220) })).filter((x) => x.title);
  const d90 = asArray(r.days_90).map((t) => ({ title: cleanString(t, 220) })).filter((x) => x.title);
  return { d30, d60, d90 };
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Error getting session:", sessionError);
      return NextResponse.json({ success: false, error: "Failed to get session" }, { status: 200 });
    }

    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userId = session.user.id;

    // ✅ pas de 500 “réseau” en front : on renvoie un JSON explicite
    if (!openai) {
      console.error("OPENAI_API_KEY_OWNER is not set (strategy generation disabled)");
      return NextResponse.json(
        { success: false, disabled: true, error: "OPENAI_API_KEY_OWNER is not set" },
        { status: 200 },
      );
    }

    // 0) Si business_plan existe déjà et contient 3 pyramides → pas de regen
    const { data: existingPlan, error: existingPlanError } = await supabase
      .from("business_plan")
      .select("id, plan_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingPlanError) {
      console.error("Error checking business_plan:", existingPlanError);
    }

    const existingPlanJson = asRecord(existingPlan?.plan_json) ?? null;
    const existingOfferPyramids = existingPlanJson ? asArray(existingPlanJson.offer_pyramids) : [];

    if (existingPlan && existingOfferPyramids.length >= 3) {
      return NextResponse.json({
        success: true,
        alreadyExists: true,
        planId: existingPlan.id,
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

    // 2) Ressources
    const { data: resources, error: resourcesError } = await supabase.from("resources").select("*");
    if (resourcesError) console.error("Error loading resources:", resourcesError);

    const { data: resourceChunks, error: chunksError } = await supabase.from("resource_chunks").select("*");
    if (chunksError) console.error("Error loading resource_chunks:", chunksError);

    const MAX_CHUNKS = 50;
    const limitedChunks =
      resourceChunks && resourceChunks.length > MAX_CHUNKS ? resourceChunks.slice(0, MAX_CHUNKS) : resourceChunks || [];

    // 3) Prompt (3 pyramides obligatoires)
    const systemPrompt = `
Tu es un stratège business senior.
Tu dois STRICTEMENT répondre au format JSON valide, sans texte autour.
`;

    const userPrompt = `
Voici le profil business de l'utilisateur (réponses d'onboarding) :
${JSON.stringify(businessProfile, null, 2)}

Voici des ressources internes :
- resources : ${JSON.stringify(resources || [], null, 2)}
- resource_chunks (max ${MAX_CHUNKS}) : ${JSON.stringify(limitedChunks, null, 2)}

Génère un JSON avec EXACTEMENT cette structure :

{
  "mission": "string",
  "promise": "string",
  "positioning": "string",
  "summary": "string",

  "offer_pyramids": [
    {
      "id": "string",
      "name": "string",
      "strategy_summary": "string",
      "lead_magnet": { "title":"string","composition":"string","purpose":"string","format":"string","price_range":"string" },
      "low_ticket": { "title":"string","composition":"string","purpose":"string","format":"string","price_range":"string" },
      "high_ticket": { "title":"string","composition":"string","purpose":"string","format":"string","price_range":"string" }
    }
  ],

  "goals": [{ "horizon": "30j | 90j | 12m", "goal": "string" }],
  "personas": [{ "name": "string", "description": "string" }],
  "plan_30_60_90": { "days_30": ["tâche"], "days_60": ["tâche"], "days_90": ["tâche"] }
}

Contraintes :
- EXACTEMENT 3 éléments dans offer_pyramids.
- Français clair, concret.
- Snake_case.
- JSON uniquement.
`;

    const aiResponse = await openai.chat.completions.create({
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

    let strategyJson: any;
    try {
      strategyJson = JSON.parse(content);
    } catch (e) {
      console.error("Error parsing AI JSON:", e, content);
      return NextResponse.json({ success: false, error: "Failed to parse AI JSON" }, { status: 200 });
    }

    const offerPyramids = normalizeOfferPyramids(strategyJson.offer_pyramids);
    const tasks_by_timeframe = tasksByTimeframeFromPlan(strategyJson.plan_30_60_90);

    // 4) Upsert business_plan (source de vérité pour UI + tasks sync)
    const plan_json: AnyRecord = {
      mission: cleanString(strategyJson.mission, 2000),
      promise: cleanString(strategyJson.promise, 2000),
      positioning: cleanString(strategyJson.positioning, 2000),
      summary: cleanString(strategyJson.summary, 5000),
      goals: Array.isArray(strategyJson.goals) ? strategyJson.goals : [],
      personas: Array.isArray(strategyJson.personas) ? strategyJson.personas : [],
      offer_pyramids: offerPyramids,

      // choix final (nul tant que l'user n'a pas choisi)
      selected_offer_pyramid_index: null,
      selected_offer_pyramid: null,

      // pour /api/tasks/sync (lib/tasksSync.ts)
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

    // 5) (Non bloquant) garder tes tables historiques
    try {
      const { data: existingStrategies } = await supabase.from("strategies").select("id").eq("user_id", userId).limit(1);

      if (!existingStrategies || existingStrategies.length === 0) {
        const { data: insertedStrategies, error: strategyError } = await supabase
          .from("strategies")
          .insert({
            user_id: userId,
            mission: cleanString(strategyJson.mission, 2000),
            positioning: cleanString(strategyJson.positioning, 2000),
            promise: cleanString(strategyJson.promise, 2000),
            summary: cleanString(strategyJson.summary, 5000),
          })
          .select("id")
          .limit(1);

        if (strategyError || !insertedStrategies?.length) {
          console.error("Error inserting strategy:", strategyError);
        } else {
          const strategyId = insertedStrategies[0].id;

          if (Array.isArray(strategyJson.goals) && strategyJson.goals.length) {
            const goalsToInsert = strategyJson.goals.map((g: any) => ({
              user_id: userId,
              strategy_id: strategyId,
              horizon: g.horizon,
              goal: g.goal,
            }));
            const { error: goalsError } = await supabase.from("strategy_goals").insert(goalsToInsert);
            if (goalsError) console.error("Error inserting strategy_goals:", goalsError);
          }

          if (Array.isArray(strategyJson.personas) && strategyJson.personas.length) {
            const personasToInsert = strategyJson.personas.map((p: any) => ({
              user_id: userId,
              strategy_id: strategyId,
              name: p.name,
              description: p.description,
            }));
            const { error: personasError } = await supabase.from("personas").insert(personasToInsert);
            if (personasError) console.error("Error inserting personas:", personasError);
          }

          // offer_pyramids table (optionnel)
          if (offerPyramids.length) {
            const rows = offerPyramids.map((p) => ({
              user_id: userId,
              strategy_id: strategyId,
              lead_magnet: (p.lead_magnet as any)?.title ?? null,
              entry_offer: (p.low_ticket as any)?.title ?? null,
              core_offer: (p.high_ticket as any)?.title ?? null,
              premium_offer: null,
            }));
            const { error: pyramidsError } = await supabase.from("offer_pyramids").insert(rows);
            if (pyramidsError) console.error("Error inserting offer_pyramids:", pyramidsError);
          }
        }
      }
    } catch (e) {
      console.error("Non-blocking legacy inserts failed:", e);
    }

    return NextResponse.json({ success: true, planId: savedPlan?.id ?? null }, { status: 200 });
  } catch (err) {
    console.error("Unhandled error in /api/strategy:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 200 },
    );
  }
}
