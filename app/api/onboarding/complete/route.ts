// app/api/onboarding/complete/route.ts
// Rôle : utiliser le profil d'onboarding pour générer un plan stratégique complet via OpenAI,
// en s'appuyant aussi sur les ressources internes (resources + resource_chunks),
// puis le sauvegarder dans la table business_plan.

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

type UnknownPlan = unknown;

function normalizeOfferPyramids(planJson: UnknownPlan): UnknownPlan {
  if (!planJson || typeof planJson !== 'object') {
    return planJson;
  }

  const plan = planJson as Record<string, unknown>;

  const offerPyramids = plan.offer_pyramids;
  if (!Array.isArray(offerPyramids)) {
    return plan;
  }

  plan.offer_pyramids = offerPyramids
    .map((p) => {
      if (!p || typeof p !== 'object') return null;
      const pyramid = p as Record<string, unknown>;

      const levels = pyramid.levels;
      if (!Array.isArray(levels)) {
        pyramid.levels = [];
      } else {
        pyramid.levels = levels.map((lvl) => {
          if (!lvl || typeof lvl !== 'object') return lvl;
          const level = lvl as Record<string, unknown>;

          if (!Array.isArray(level.items)) level.items = [];
          if (!Array.isArray(level.features)) level.features = [];

          return level;
        });
      }

      return pyramid;
    })
    .filter(Boolean);

  return plan;
}

function buildSystemPrompt(): string {
  return [
    'Tu es Tipote™, un assistant stratégique pour entrepreneurs.',
    'Tu dois produire un plan stratégique clair, actionnable et structuré.',
    'Tu réponds en JSON strict, sans texte hors JSON.',
    'Le JSON doit contenir :',
    '- summary (string)',
    '- persona (object)',
    '- offer_pyramids (array)',
    '- selected_offer_pyramid_index (number ou null)',
    '- selected_offer_pyramid (object ou null)',
    '- roadmap_90_days (object avec d30/d60/d90 arrays)',
    '- tasks (array de tâches)',
    '',
    'Règles :',
    '- Les tâches doivent être concrètes, courtes, et actionnables.',
    '- Le ton est direct, bienveillant, orienté exécution.',
  ].join('\n');
}

function buildUserPrompt(params: {
  profile: Record<string, unknown> | null;
  resources: unknown[] | null;
  resourceChunks: unknown[] | null;
}): string {
  const { profile, resources, resourceChunks } = params;

  return [
    'Voici les données utilisateur (profil onboarding) :',
    JSON.stringify(profile ?? {}, null, 2),
    '',
    'Voici des ressources internes (peuvent aider à enrichir / cadrer) :',
    JSON.stringify(resources ?? [], null, 2),
    '',
    'Voici des extraits de ressources (resource_chunks) :',
    JSON.stringify(resourceChunks ?? [], null, 2),
    '',
    'Objectif : génère un plan stratégique complet pour cet utilisateur.',
    'Réponds en JSON strict.',
  ].join('\n');
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
        {
          error:
            'Missing OpenAI API key (OPENAI_API_KEY_OWNER or OPENAI_API_KEY)',
        },
        { status: 500 },
      );
    }

    const openai = new OpenAI({ apiKey });

    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError) {
      console.error(
        '[POST /api/onboarding/complete] Supabase auth error',
        authError,
      );
      return NextResponse.json(
        { error: 'Authentication error' },
        { status: 401 },
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
        '[POST /api/onboarding/complete] Error loading business profile',
        profileError,
      );
      return NextResponse.json(
        { error: 'Failed to load business profile' },
        { status: 500 },
      );
    }

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
        '[POST /api/onboarding/complete] Error loading resource chunks',
        chunksError,
      );
      // On log, mais on ne bloque pas la génération du plan
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      profile: (profile ?? null) as Record<string, unknown> | null,
      resources: (resources ?? null) as unknown[] | null,
      resourceChunks: (resourceChunks ?? null) as unknown[] | null,
    });

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_STRATEGY_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices?.[0]?.message?.content ?? '';

    let planJson: unknown = null;
    try {
      planJson = JSON.parse(content);
    } catch (err) {
      console.error(
        '[POST /api/onboarding/complete] Failed to parse OpenAI JSON response',
        err,
      );
      return NextResponse.json(
        { error: 'Failed to parse generated plan JSON' },
        { status: 500 },
      );
    }

    // Normalisation (évite les structures inattendues)
    planJson = normalizeOfferPyramids(planJson);

    // Sauvegarde plan dans business_plan
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
          details: upsertError?.message ?? 'Unknown upsert error',
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
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
