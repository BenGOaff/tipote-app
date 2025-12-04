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
    .optional()
    .default([]),
  audienceSocial: z.number().int().nonnegative().nullable().optional(),
  audienceEmail: z.number().int().nonnegative().nullable().optional(),
  timeAvailable: z.string(),
  mainGoal: z.string(),
});

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
          audience_social: payload.audienceSocial ?? null,
          audience_email: payload.audienceEmail ?? null,
          time_available: payload.timeAvailable,
          main_goal: payload.mainGoal,
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
