// app/api/onboarding/complete/route.ts
// Rôle : utiliser le profil d'onboarding pour générer un plan stratégique complet via OpenAI,
// puis le sauvegarder dans la table business_plan.

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

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
        { error: 'Failed to fetch onboarding profile' },
        { status: 500 },
      );
    }

    if (!profile) {
      return NextResponse.json(
        { error: 'Onboarding profile not found' },
        { status: 400 },
      );
    }

    // 1) Appel OpenAI pour générer le plan stratégique complet
    const systemPrompt = `
Tu es une IA stratège business pour solopreneurs.
À partir des réponses d'onboarding Tipote (niche, mission, maturité, offres, audience, temps disponible, objectif 90 jours),
tu génères un plan complet sous forme de JSON valide.

Structure JSON attendue :
{
  "business_profile": { ... },       // profil business exploitable par le dashboard et les modules
  "persona": { ... },                // persona client idéal (résumés + champs clés)
  "offer_pyramids": [ ... ],         // 2 ou 3 scénarios de pyramide d'offres
  "action_plan_30_90": { ... },      // plan d'action par semaine
  "tasks": [ ... ],                  // tâches granulaires liées au plan
  "modules_recommendations": { ... } // modules Tipote à activer + templates / formations recommandés
}

Réponds STRICTEMENT en JSON, sans texte avant ni après.
`;

    const userContent = JSON.stringify({
      onboarding_profile: profile,
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

    if (upsertError) {
      console.error(
        '[POST /api/onboarding/complete] Supabase upsert error',
        upsertError,
      );
      return NextResponse.json(
        { error: 'Failed to save generated plan' },
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
      { error: 'Unexpected server error' },
      { status: 500 },
    );
  }
}
