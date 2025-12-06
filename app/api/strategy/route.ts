// src/app/api/strategy/route.ts
// API pour lire / générer la stratégie avancée d'un utilisateur

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServerClient";
import { openai } from "@/lib/openaiClient";

type StrategyPayload = {
  userId: string;
  businessName?: string;
  businessStage?: string;
  industry?: string;
  targetMarket?: string;
  context?: string; // infos complémentaires ou réponses d'onboarding (texte libre)
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId query parameter" },
        { status: 400 }
      );
    }

    // Récupérer la stratégie principale
    const { data: strategies, error: strategyError } = await supabaseServer
      .from("strategies")
      .select(
        `
        *,
        personas (*),
        offer_pyramids (*),
        strategy_goals (*)
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (strategyError) {
      console.error(strategyError);
      return NextResponse.json(
        { error: "Error fetching strategy" },
        { status: 500 }
      );
    }

    const strategy = strategies?.[0] ?? null;

    return NextResponse.json({ strategy });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as StrategyPayload;

    if (!body.userId) {
      return NextResponse.json(
        { error: "Missing userId in body" },
        { status: 400 }
      );
    }

    // 1) Appel IA pour générer une stratégie structurée
    const aiResult = await generateStrategyWithAI(body);

    // 2) Sauvegarder en base : stratégie + personas + offres + objectifs
    const { strategyId } = await saveStrategyToDatabase(body.userId, aiResult);

    // 3) Relire la stratégie complète pour la renvoyer au front
    const { data: strategies, error: strategyError } = await supabaseServer
      .from("strategies")
      .select(
        `
        *,
        personas (*),
        offer_pyramids (*),
        strategy_goals (*)
      `
      )
      .eq("id", strategyId)
      .single();

    if (strategyError) {
      console.error(strategyError);
      return NextResponse.json(
        { error: "Error fetching created strategy" },
        { status: 500 }
      );
    }

    return NextResponse.json({ strategy: strategies });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}

// =========================
// Helpers IA & base de données
// =========================

type AiStrategy = {
  business_name: string;
  business_stage: string;
  industry: string;
  target_market: string;
  mission: string;
  vision: string;
  positioning: string;
  value_proposition: string;
  ai_summary: string;
  personas: Array<{
    name: string;
    role?: string;
    description?: string;
    pains?: string;
    desires?: string;
    objections?: string;
    current_situation?: string;
    desired_situation?: string;
    awareness_level?: string;
    budget_level?: string;
  }>;
  offers: Array<{
    level: "lead_magnet" | "entry" | "core" | "premium" | "backend";
    name: string;
    description?: string;
    promise?: string;
    format?: string;
    delivery?: string;
    price_min?: number;
    price_max?: number;
    main_outcome?: string;
    is_flagship?: boolean;
  }>;
  goals: Array<{
    horizon: "30d" | "90d" | "12m";
    title: string;
    description?: string;
    metric?: string;
    target_value?: number;
    current_value?: number;
    deadline?: string;
    status?: "not_started" | "in_progress" | "done" | "blocked";
    priority?: number;
  }>;
};

async function generateStrategyWithAI(
  payload: StrategyPayload
): Promise<AiStrategy> {
  const {
    businessName = "Business de coaching",
    businessStage = "débutant",
    industry = "coaching / formation en ligne",
    targetMarket = "freelances et solopreneurs",
    context = "",
  } = payload;

  const systemPrompt = `
Tu es un expert en stratégie business, spécialisé pour les solopreneurs, coachs et créateurs de contenu.
Tu dois générer une STRATÉGIE BUSINESS STRUCTURÉE pour une application SaaS.
Tu dois répondre STRICTEMENT au format JSON demandé, sans texte additionnel.
  `;

  const userPrompt = `
Génère une stratégie business avancée pour ce business :

- Nom du business : ${businessName}
- Stade actuel : ${businessStage}
- Industrie / niche : ${industry}
- Marché cible : ${targetMarket}
- Contexte / infos supplémentaires :
${context}

La stratégie doit inclure :
1) Un socle de stratégie (mission, vision, positionnement, proposition de valeur).
2) 1 à 3 personas détaillés avec pains, désirs, objections.
3) Une pyramide d'offres complète (lead magnet, entry, core, premium, backend si pertinent).
4) 3 à 7 objectifs à 30 jours / 90 jours / 12 mois.
5) Un résumé global "ai_summary" expliquant la logique de la stratégie.

Réponds STRICTEMENT dans ce format JSON :

{
  "business_name": string,
  "business_stage": string,
  "industry": string,
  "target_market": string,
  "mission": string,
  "vision": string,
  "positioning": string,
  "value_proposition": string,
  "ai_summary": string,
  "personas": [...],
  "offers": [...],
  "goals": [...]
}
  `;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.6,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";

  let parsed: AiStrategy;
  try {
    parsed = JSON.parse(raw) as AiStrategy;
  } catch (e) {
    console.error("Error parsing AI JSON", e, raw);
    throw new Error("AI returned an invalid JSON");
  }

  return parsed;
}

async function saveStrategyToDatabase(userId: string, ai: AiStrategy) {
  // 1) Insérer la stratégie principale
  const { data: strategyInsert, error: strategyError } = await supabaseServer
    .from("strategies")
    .insert({
      user_id: userId,
      business_name: ai.business_name,
      business_stage: ai.business_stage,
      industry: ai.industry,
      target_market: ai.target_market,
      mission: ai.mission,
      vision: ai.vision,
      positioning: ai.positioning,
      value_proposition: ai.value_proposition,
      ai_summary: ai.ai_summary,
    })
    .select("id")
    .single();

  if (strategyError || !strategyInsert) {
    console.error(strategyError);
    throw new Error("Error inserting strategy");
  }

  const strategyId = strategyInsert.id as string;

  // 2) Insérer les personas
  if (ai.personas && ai.personas.length > 0) {
    const personasPayload = ai.personas.map((p) => ({
      user_id: userId,
      strategy_id: strategyId,
      name: p.name,
      role: p.role ?? null,
      description: p.description ?? null,
      pains: p.pains ?? null,
      desires: p.desires ?? null,
      objections: p.objections ?? null,
      current_situation: p.current_situation ?? null,
      desired_situation: p.desired_situation ?? null,
      awareness_level: p.awareness_level ?? null,
      budget_level: p.budget_level ?? null,
    }));

    const { error: personasError } = await supabaseServer
      .from("personas")
      .insert(personasPayload);

    if (personasError) {
      console.error(personasError);
      // On logue l'erreur mais on ne bloque pas tout pour la V1
    }
  }

  // 3) Insérer les offres
  if (ai.offers && ai.offers.length > 0) {
    const offersPayload = ai.offers.map((o) => ({
      user_id: userId,
      strategy_id: strategyId,
      level: o.level,
      name: o.name,
      description: o.description ?? null,
      promise: o.promise ?? null,
      format: o.format ?? null,
      delivery: o.delivery ?? null,
      price_min: o.price_min ?? null,
      price_max: o.price_max ?? null,
      main_outcome: o.main_outcome ?? null,
      is_flagship: o.is_flagship ?? false,
    }));

    const { data: offersInserted, error: offersError } = await supabaseServer
      .from("offer_pyramids")
      .insert(offersPayload)
      .select("id, is_flagship");

    if (offersError) {
      console.error(offersError);
    } else {
      // Facultatif : mettre à jour main_offer_id avec l'offre flagship si elle existe
      const flagship = offersInserted?.find((o) => o.is_flagship);

      if (flagship) {
        const { error: updateStrategyError } = await supabaseServer
          .from("strategies")
          .update({ main_offer_id: flagship.id })
          .eq("id", strategyId);

        if (updateStrategyError) {
          console.error(updateStrategyError);
        }
      }
    }
  }

  // 4) Insérer les objectifs
  if (ai.goals && ai.goals.length > 0) {
    const goalsPayload = ai.goals.map((g) => ({
      user_id: userId,
      strategy_id: strategyId,
      horizon: g.horizon,
      title: g.title,
      description: g.description ?? null,
      metric: g.metric ?? null,
      target_value: g.target_value ?? null,
      current_value: g.current_value ?? null,
      deadline: g.deadline ? g.deadline : null,
      status: g.status ?? "not_started",
      priority: g.priority ?? 2,
    }));

    const { error: goalsError } = await supabaseServer
      .from("strategy_goals")
      .insert(goalsPayload);

    if (goalsError) {
      console.error(goalsError);
    }
  }

  return { strategyId };
}
