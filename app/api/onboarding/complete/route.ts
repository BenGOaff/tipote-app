// app/api/onboarding/complete/route.ts
// Rôle : utiliser le profil d'onboarding pour générer un plan stratégique complet via OpenAI,
// puis le sauvegarder dans la table business_plan.

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

type UnknownPlan = unknown;

function normalizeOfferPyramids(planJson: UnknownPlan): UnknownPlan {
  if (!planJson || typeof planJson !== 'object') {
    return planJson;
  }

  const plan: any = planJson as any;
  const rawPyramids = Array.isArray(plan.offer_pyramids)
    ? plan.offer_pyramids.filter(Boolean)
    : [];

  if (rawPyramids.length === 0) {
    return planJson;
  }

  let normalized = [...rawPyramids];

  if (normalized.length > 3) {
    normalized = normalized.slice(0, 3);
  }

  while (normalized.length < 3) {
    const base = normalized[normalized.length - 1] || {};
    const index = normalized.length;

    normalized.push({
      ...base,
      id:
        typeof base.id === 'string'
          ? `${base.id}-copy-${index + 1}`
          : `pyramid-${index + 1}`,
      label:
        typeof base.label === 'string'
          ? `${base.label} (variante)`
          : `Scénario ${index + 1}`,
    });
  }

  plan.offer_pyramids = normalized;
  return plan;
}

export async function POST() {
  try {
    // On récupère la clé OpenAI côté serveur.
    // On accepte OPENAI_API_KEY_OWNER en priorité, puis OPENAI_API_KEY en fallback.
    const apiKey =
      process.env.OPENAI_API_KEY_OWNER || process.env.OPENAI_API_KEY || '';

    if (!apiKey) {
      console.error(
        '[POST /api/onboarding/complete] Missing OpenAI API key (OPENAI_API_KEY_OWNER or OPENAI_API_KEY)',
      );
      return NextResponse.json(
        { error: 'Server misconfiguration (OpenAI key missing)' },
        { status: 500 },
      );
    }

    const openai = new OpenAI({ apiKey });

    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error(
        '[POST /api/onboarding/complete] sessionError',
        sessionError,
      );
      return NextResponse.json(
        { error: 'Authentication error' },
        { status: 500 },
      );
    }

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (profileError) {
      console.error(
        '[POST /api/onboarding/complete] Supabase select error',
        profileError,
      );
      return NextResponse.json(
        { error: 'Failed to fetch onboarding profile', details: profileError },
        { status: 500 },
      );
    }

    if (!profile) {
      return NextResponse.json(
        { error: 'Onboarding profile not found' },
        { status: 400 },
      );
    }

    // 1) Lire les ressources internes (resources + resource_chunks)
    const { data: resources, error: resourcesError } = await supabase
      .from('resources')
      .select('*');

    if (resourcesError) {
      console.error(
        '[POST /api/onboarding/complete] Error loading resources',
        resourcesError,
      );
      // On log, mais on ne bloque pas la génération du plan
    }

    const { data: resourceChunks, error: chunksError } = await supabase
      .from('resource_chunks')
      .select('*');

    if (chunksError) {
      console.error(
        '[POST /api/onboarding/complete] Error loading resource_chunks',
        chunksError,
      );
      // On log, mais on ne bloque pas la génération du plan
    }

    // On limite le volume envoyé à l'IA pour éviter les prompts gigantesques
    const MAX_CHUNKS = 50;
    const limitedChunks =
      resourceChunks && resourceChunks.length > MAX_CHUNKS
        ? resourceChunks.slice(0, MAX_CHUNKS)
        : resourceChunks || [];

    // 2) Appel OpenAI pour générer le plan stratégique complet
    const systemPrompt = `
Tu es une IA stratège business pour solopreneurs.
À partir des réponses d'onboarding Tipote (niche, mission, maturité, offres, audience, temps disponible, objectif 90 jours)
ET des ressources internes (playbooks, frameworks, guides de Tipote), tu génères un plan stratégique complet sous forme de JSON valide.

Le plan doit contenir :
- "business_profile" : profil business exploitable par le dashboard et les modules,
- "persona" : persona client idéal (résumés + champs clés),
- "offer_pyramids" : EXACTEMENT 3 scénarios de pyramide d'offres (3 niveaux de stratégie différents),
- "action_plan_30_90" : plan d'action sur 30 à 90 jours,
- "tasks" : tâches granulaires liées au plan,
- "modules_recommendations" : modules Tipote à activer + contenus / formations recommandés.

Structure JSON attendue (exemple de forme, à adapter au cas de l'utilisateur) :
{
  "business_profile": { ... },
  "persona": { ... },
  "offer_pyramids": [
    {
      "id": "light | standard | aggressive",
      "name": "string",
      "label": "string",
      "description": "string",
      "offers": [
        {
          "level": "lead_magnet | entry_offer | core_offer | premium_offer | other",
          "title": "string",
          "description": "string",
          "price_range": "string"
        }
      ]
    }
  ],
  "action_plan_30_90": { ... },
  "tasks": [ ... ],
  "modules_recommendations": { ... }
}

Contraintes :
- Utilise un français clair, concret, orienté actions.
- Sois cohérent avec le niveau de maturité du business et l'audience.
- Appuie-toi sur les ressources internes lorsque c'est pertinent.
- Réponds STRICTEMENT en JSON valide, sans texte avant ni après.
`;
    const userContent = JSON.stringify({
      onboarding_profile: profile,
      resources: resources ?? [],
      resource_chunks: limitedChunks,
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userContent,
        },
      ],
    });

    const message = completion.choices[0]?.message?.content;
    if (!message) {
      console.error(
        '[POST /api/onboarding/complete] Empty completion message',
      );
      return NextResponse.json(
        { error: 'Failed to generate plan (no content)' },
        { status: 500 },
      );
    }

    let planJson: unknown;
    try {
      planJson = JSON.parse(message);
      planJson = normalizeOfferPyramids(planJson);
    } catch (parseError) {
      console.error(
        '[POST /api/onboarding/complete] JSON parse error',
        parseError,
        'raw message=',
        message,
      );
      return NextResponse.json(
        { error: 'Failed to parse AI response as JSON' },
        { status: 500 },
      );
    }

    // Petit log de debug (type de l'objet que l'on sauvegarde)
    console.log(
      '[POST /api/onboarding/complete] planJson type:',
      typeof planJson,
    );

    // 2) Sauvegarde dans business_plan (upsert par user_id)
    const { data: planRow, error: upsertError } = await supabase
      .from('business_plan')
      .upsert(
        {
          user_id: session.user.id,
          plan_json: planJson as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single();

    if (upsertError || !planRow) {
      console.error(
        '[POST /api/onboarding/complete] Supabase upsert error',
        upsertError,
      );
      return NextResponse.json(
        {
          error: 'Failed to save generated plan',
          details: upsertError,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        plan: planRow,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[POST /api/onboarding/complete] Unexpected error', err);
    return NextResponse.json(
      { error: 'Unexpected server error', details: `${err}` },
      { status: 500 },
    );
  }
}
