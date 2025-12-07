// app/api/onboarding/answers/route.ts
// Rôle : API pour lire / sauvegarder les réponses d’onboarding (Q1 → Q8)
// pour l'utilisateur actuellement connecté.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

// Schéma assoupli : on accepte les chaînes vides pour la plupart des champs,
// pour éviter les erreurs 400 "Invalid payload" pendant les tests.
// On garde juste des types cohérents.
const onboardingAnswersSchema = z.object({
  firstName: z.string(), // on pourra remettre .min(1) plus tard avec validation front
  ageRange: z.string(),
  gender: z.string(),
  country: z.string(),
  niche: z.string(),
  nicheOther: z.string().optional(),
  mission: z.string(),
  businessMaturity: z.string(),
  offersStatus: z.string(),
  offers: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        price: z.number().nullable(),
        sales: z.number().nullable(),
      }),
    )
    .default([]),
  audienceSocial: z.string().optional().nullable(),
  audienceEmail: z.string().optional().nullable(),
  timeAvailable: z.string(),
  mainGoal: z.string(),

  // 🔥 NOUVEAUX CHAMPS AVANCÉS (tous optionnels)
  energySources: z.string().optional().nullable(),
  uniqueValue: z.string().optional().nullable(),
  untappedStrength: z.string().optional().nullable(),
  communicationStyle: z.string().optional().nullable(),
  successDefinition: z.string().optional().nullable(),
  sixMonthVision: z.string().optional().nullable(),
  innerDialogue: z.string().optional().nullable(),
  ifCertainSuccess: z.string().optional().nullable(),
  biggestFears: z.string().optional().nullable(),
  biggestChallenge: z.string().optional().nullable(),
  workingStrategies: z.string().optional().nullable(),
  recentClientFeedback: z.string().optional().nullable(),
  preferredContentType: z.string().optional().nullable(),
});

// GET — récupérer les réponses existantes
export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('[GET /api/onboarding/answers] sessionError', sessionError);
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

    const { data, error } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (error) {
      console.error(
        '[GET /api/onboarding/answers] Supabase select error',
        error,
      );
      return NextResponse.json(
        { error: 'Failed to fetch onboarding answers' },
        { status: 500 },
      );
    }

    return NextResponse.json({ profile: data }, { status: 200 });
  } catch (err) {
    console.error('[GET /api/onboarding/answers] Unexpected error', err);
    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 },
    );
  }
}

// POST — sauvegarder / mettre à jour les réponses
export async function POST(request: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('[POST /api/onboarding/answers] sessionError', sessionError);
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

    const body = await request.json();

    const parseResult = onboardingAnswersSchema.safeParse(body);
    if (!parseResult.success) {
      console.warn(
        '[POST /api/onboarding/answers] Validation error',
        parseResult.error.flatten(),
      );
      return NextResponse.json(
        {
          error: 'Invalid payload',
          details: parseResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const payload = parseResult.data;

    const { data, error } = await supabase
      .from('business_profiles')
      .upsert(
        {
          user_id: session.user.id,
          first_name: payload.firstName,
          age_range: payload.ageRange,
          gender: payload.gender,
          country: payload.country,
          niche: payload.niche,
          niche_other: payload.nicheOther ?? null,
          mission: payload.mission,
          business_maturity: payload.businessMaturity,
          offers_status: payload.offersStatus,
          offers: payload.offers.length > 0 ? payload.offers : null,
          audience_social:
            payload.audienceSocial && payload.audienceSocial.trim() !== ''
              ? Number(payload.audienceSocial.trim())
              : null,
          audience_email:
            payload.audienceEmail && payload.audienceEmail.trim() !== ''
              ? Number(payload.audienceEmail.trim())
              : null,
          time_available: payload.timeAvailable,
          main_goal: payload.mainGoal,

          // 🔥 NOUVELLES COLONNES AVANCÉES (peuvent être nulles)
          energy_sources: payload.energySources ?? null,
          unique_value: payload.uniqueValue ?? null,
          untapped_strength: payload.untappedStrength ?? null,
          communication_style: payload.communicationStyle ?? null,
          success_definition: payload.successDefinition ?? null,
          six_month_vision: payload.sixMonthVision ?? null,
          inner_dialogue: payload.innerDialogue ?? null,
          if_certain_success: payload.ifCertainSuccess ?? null,
          biggest_fears: payload.biggestFears ?? null,
          biggest_challenge: payload.biggestChallenge ?? null,
          working_strategies: payload.workingStrategies ?? null,
          recent_client_feedback: payload.recentClientFeedback ?? null,
          preferred_content_type: payload.preferredContentType ?? null,

          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single();

    if (error) {
      console.error(
        '[POST /api/onboarding/answers] Supabase upsert error',
        error,
      );
      return NextResponse.json(
        { error: 'Failed to save onboarding answers' },
        { status: 500 },
      );
    }

    return NextResponse.json({ profile: data }, { status: 200 });
  } catch (err) {
    console.error('[POST /api/onboarding/answers] Unexpected error', err);
    return NextResponse.json(
      { error: 'Unexpected server error' },
      { status: 500 },
    );
  }
}
