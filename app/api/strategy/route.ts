// app/api/strategy/route.ts

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai } from "@/lib/openaiClient";

export async function POST() {
  try {
    // 🔧 CORRECTION ICI : on attend le client
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Error getting session:", sessionError);
      return NextResponse.json(
        { error: "Failed to get session" },
        { status: 500 }
      );
    }

    if (!session?.user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // 0. Vérifier si une stratégie existe déjà pour cet utilisateur
    const {
      data: existingStrategies,
      error: existingStrategyError,
    } = await supabase
      .from("strategies")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    if (existingStrategyError) {
      console.error("Error checking existing strategy:", existingStrategyError);
      return NextResponse.json(
        { error: "Failed to check existing strategy" },
        { status: 500 }
      );
    }

    if (existingStrategies && existingStrategies.length > 0) {
      // Stratégie déjà générée → on renvoie juste son id
      return NextResponse.json({
        success: true,
        strategyId: existingStrategies[0].id,
        alreadyExists: true,
      });
    }

    // 1. Lire le business profile
    const {
      data: businessProfile,
      error: profileError,
    } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (profileError || !businessProfile) {
      console.error("Business profile error:", profileError);
      return NextResponse.json(
        { error: "Business profile missing" },
        { status: 400 }
      );
    }

    // 2. Lire les ressources internes (resources + resource_chunks)
    const { data: resources, error: resourcesError } = await supabase
      .from("resources")
      .select("*");

    if (resourcesError) {
      console.error("Error loading resources:", resourcesError);
      // On log, mais on ne bloque pas forcément la génération
    }

    const { data: resourceChunks, error: chunksError } = await supabase
      .from("resource_chunks")
      .select("*");

    if (chunksError) {
      console.error("Error loading resource_chunks:", chunksError);
      // On log, mais on ne bloque pas forcément la génération
    }

    // On limite le volume envoyé à l'IA pour éviter les prompts gigantesques
    const MAX_CHUNKS = 50;
    const limitedChunks =
      resourceChunks && resourceChunks.length > MAX_CHUNKS
        ? resourceChunks.slice(0, MAX_CHUNKS)
        : resourceChunks || [];

    // 3. Construire le prompt stratégique (on force un retour JSON)
    const systemPrompt = `
Tu es un stratège business senior. Tu aides des solopreneurs et petites équipes
à clarifier leur stratégie, leur pyramide d'offres et leurs priorités.

Tu dois STRICTEMENT répondre au format JSON valide, sans texte autour.
`;

    const userPrompt = `
Voici le profil business de l'utilisateur (réponses d'onboarding) :
${JSON.stringify(businessProfile, null, 2)}

Voici des ressources internes (frameworks, méthodologies, exemples) :
- resources (métadonnées) : ${JSON.stringify(resources || [], null, 2)}
- resource_chunks (contenu découpé, max ${MAX_CHUNKS} chunks) : ${JSON.stringify(
      limitedChunks,
      null,
      2
    )}

À partir de ces informations, génère une stratégie complète avec la structure JSON suivante :

{
  "mission": "string",
  "promise": "string",
  "positioning": "string",
  "summary": "string",
  "offer_pyramid": {
    "lead_magnet": "string",
    "entry_offer": "string",
    "core_offer": "string",
    "premium_offer": "string"
  },
  "goals": [
    {
      "horizon": "30j | 90j | 12m",
      "goal": "string"
    }
  ],
  "personas": [
    {
      "name": "string",
      "description": "string"
    }
  ],
  "plan_30_60_90": {
    "days_30": ["tâche 1", "tâche 2", "..."],
    "days_60": ["tâche 1", "tâche 2", "..."],
    "days_90": ["tâche 1", "tâche 2", "..."]
  }
}

Contraintes :
- Utilise un français clair et concret.
- Sois cohérent avec le niveau de maturité du business et l'audience.
- Appuie-toi sur les ressources internes lorsque c'est pertinent.
- Ne renvoie QUE un JSON valide qui respecte cette structure (clés en minuscules, snake_case).
`;

    // 4. Appel au modèle OpenAI (clé propriétaire = IA stratégique)
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4.1",
      // si jamais TypeScript râle ici, tu peux supprimer response_format
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
        { error: "Empty AI response" },
        { status: 500 }
      );
    }

    let strategyJson: any;
    try {
      strategyJson = JSON.parse(content);
    } catch (parseError) {
      console.error("Error parsing AI JSON:", parseError, content);
      return NextResponse.json(
        { error: "Failed to parse AI JSON" },
        { status: 500 }
      );
    }

    // 5. Insérer la stratégie principale
    const {
      data: insertedStrategies,
      error: strategyError,
    } = await supabase
      .from("strategies")
      .insert({
        user_id: userId,
        mission: strategyJson.mission,
        positioning: strategyJson.positioning,
        promise: strategyJson.promise,
        summary: strategyJson.summary,
      })
      .select("id")
      .limit(1);

    if (strategyError || !insertedStrategies || insertedStrategies.length === 0) {
      console.error("Error inserting strategy:", strategyError);
      return NextResponse.json(
        { error: "Failed to insert strategy" },
        { status: 500 }
      );
    }

    const strategyId = insertedStrategies[0].id;

    // 6. Insérer objectifs (strategy_goals)
    if (Array.isArray(strategyJson.goals) && strategyJson.goals.length > 0) {
      const goalsToInsert = strategyJson.goals.map((g: any) => ({
        user_id: userId,
        strategy_id: strategyId,
        horizon: g.horizon,
        goal: g.goal,
      }));

      const { error: goalsError } = await supabase
        .from("strategy_goals")
        .insert(goalsToInsert);

      if (goalsError) {
        console.error("Error inserting strategy_goals:", goalsError);
        // On n'échoue pas toute la requête, mais on log
      }
    }

    // 7. Pyramide d’offres (offer_pyramids)
    if (strategyJson.offer_pyramid) {
      const { error: pyramidError } = await supabase
        .from("offer_pyramids")
        .insert({
          user_id: userId,
          strategy_id: strategyId,
          lead_magnet: strategyJson.offer_pyramid.lead_magnet,
          entry_offer: strategyJson.offer_pyramid.entry_offer,
          core_offer: strategyJson.offer_pyramid.core_offer,
          premium_offer: strategyJson.offer_pyramid.premium_offer,
        });

      if (pyramidError) {
        console.error("Error inserting offer_pyramids:", pyramidError);
      }
    }

    // 8. Personas
    if (Array.isArray(strategyJson.personas) && strategyJson.personas.length > 0) {
      const personasToInsert = strategyJson.personas.map((p: any) => ({
        user_id: userId,
        strategy_id: strategyId,
        name: p.name,
        description: p.description,
      }));

      const { error: personasError } = await supabase
        .from("personas")
        .insert(personasToInsert);

      if (personasError) {
        console.error("Error inserting personas:", personasError);
      }
    }

    // 9. TODO : Project tasks (plan 30/60/90) → à brancher après validation du schéma de project_tasks

    return NextResponse.json({ success: true, strategyId });
  } catch (err) {
    console.error("Unhandled error in /api/strategy:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
