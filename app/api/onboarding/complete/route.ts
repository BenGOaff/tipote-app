// app/api/onboarding/complete/route.ts
// Rôle : utiliser le profil d'onboarding pour générer un plan stratégique complet via OpenAI,
// en s'appuyant aussi sur les ressources internes (resources + resource_chunks),
// puis le sauvegarder dans la table business_plan.
// ✅ Suite logique cahier des charges : création automatique des tâches (project_tasks) depuis plan_json

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { syncStrategyTasksFromPlanJson } from '@/lib/tasksSync';

type UnknownPlan = unknown;

function normalizeOfferPyramids(planJson: UnknownPlan): UnknownPlan {
  if (!planJson || typeof planJson !== 'object') {
    return planJson;
  }

  const obj = planJson as Record<string, unknown>;

  const pyramids = obj.offer_pyramids;
  if (!Array.isArray(pyramids)) return planJson;

  // Ex: certains modèles renvoient des champs vides ou des formats différents
  const normalized = pyramids
    .map((p) => {
      if (!p || typeof p !== 'object') return null;
      const r = p as Record<string, unknown>;
      return {
        lead_magnet: r.lead_magnet ?? r.leadMagnet ?? null,
        entry_offer: r.entry_offer ?? r.entryOffer ?? null,
        core_offer: r.core_offer ?? r.coreOffer ?? null,
        premium_offer: r.premium_offer ?? r.premiumOffer ?? null,
      };
    })
    .filter(Boolean);

  return { ...obj, offer_pyramids: normalized };
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
    'Voici des chunks de ressources internes (peuvent aider à enrichir / cadrer) :',
    JSON.stringify(resourceChunks ?? [], null, 2),
    '',
    "Génère un plan stratégique complet et actionnable pour 90 jours, incluant :",
    "- positionnement, promesse, avatar/persona, diagnostic, objectifs, pyramide d'offres, plan 30/60/90,",
    "- et surtout une liste de tâches actionnables (avec title + due_date) pour alimenter le système de tâches.",
    '',
    'Réponds STRICTEMENT en JSON.',
  ].join('\n');
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Charger profil onboarding
    const { data: profileRow, error: profileError } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[POST /api/onboarding/complete] profile fetch error', profileError);
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
    }

    // Ressources internes
    const { data: resources, error: resourcesError } = await supabase
      .from('resources')
      .select('*');

    if (resourcesError) {
      console.error('[POST /api/onboarding/complete] resources error', resourcesError);
    }

    const { data: resourceChunks, error: chunksError } = await supabase
      .from('resource_chunks')
      .select('*');

    if (chunksError) {
      console.error('[POST /api/onboarding/complete] resource_chunks error', chunksError);
    }

    // OpenAI (niveau stratégie)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 });
    }

    const client = new OpenAI({ apiKey });

    const systemPrompt = [
      'Tu es Tipote™, un assistant stratégique expert en business pour entrepreneurs.',
      'Tu produis un plan extrêmement concret, actionnable, structuré.',
      'Tu réponds en français.',
      'Tu réponds STRICTEMENT en JSON valide.',
    ].join('\n');

    const userPrompt = buildUserPrompt({
      profile: (profileRow ?? null) as Record<string, unknown> | null,
      resources: resources ?? null,
      resourceChunks: resourceChunks ?? null,
    });

    const aiResponse = await client.chat.completions.create({
      model: process.env.OPENAI_STRATEGY_MODEL ?? 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
    });

    const content = aiResponse.choices[0]?.message?.content;
    if (!content) {
      console.error('[POST /api/onboarding/complete] Empty AI response');
      return NextResponse.json({ error: 'Empty AI response' }, { status: 500 });
    }

    let planJson: UnknownPlan;
    try {
      planJson = JSON.parse(content);
    } catch (e) {
      console.error('[POST /api/onboarding/complete] JSON parse error', e, content);
      return NextResponse.json({ error: 'Invalid AI JSON' }, { status: 500 });
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
        { error: 'Failed to save business plan' },
        { status: 500 },
      );
    }

    // ✅ Suite logique : sync des tâches de stratégie (non bloquant)
    try {
      const syncRes = await syncStrategyTasksFromPlanJson({
        supabase,
        userId: session.user.id,
        planJson: (planJson && typeof planJson === 'object'
          ? (planJson as Record<string, unknown>)
          : null),
      });

      if (!syncRes.ok) {
        console.error('[POST /api/onboarding/complete] tasks sync error', syncRes.error);
      }
    } catch (e) {
      console.error('[POST /api/onboarding/complete] tasks sync exception', e);
    }

    return NextResponse.json({ ok: true, planId: planRow.id }, { status: 200 });
  } catch (err) {
    console.error('[POST /api/onboarding/complete] Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
