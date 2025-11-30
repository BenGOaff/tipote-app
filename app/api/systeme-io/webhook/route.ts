// app/api/systeme-io/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Schéma minimal des données qu'on attend depuis Systeme.io.
 * À adapter une fois qu'on aura un exemple réel de payload.
 */
const systemeIoPayloadSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  // Identifiant unique du contact Systeme.io (contact_id, id, etc.)
  sio_contact_id: z.string().optional(),
  // Identifiant du produit acheté
  product_id: z.string().optional(),
  // Optionnel : un plan explicite si tu préfères l'envoyer depuis Systeme.io
  plan: z.string().optional(),
});

/**
 * Détermine le plan Tipote à partir du product_id Systeme.io
 * et éventuellement d'un champ "plan" explicite.
 */
function determinePlan(input: {
  product_id?: string;
  planFromPayload?: string;
}): 'free' | 'basic' | 'essential' | 'elite' {
  // Si le plan est explicitement envoyé par le webhook, on le truste
  if (input.planFromPayload) {
    const normalized = input.planFromPayload.toLowerCase();
    if (['free', 'basic', 'essential', 'elite'].includes(normalized)) {
      return normalized as 'free' | 'basic' | 'essential' | 'elite';
    }
  }

  const productId = input.product_id;
  if (!productId) {
    return 'basic'; // par défaut, on peut mettre "basic"
  }

  const basicIds = (process.env.PLAN_BASIC_PRODUCT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const essentialIds = (process.env.PLAN_ESSENTIAL_PRODUCT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const eliteIds = (process.env.PLAN_ELITE_PRODUCT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (eliteIds.includes(productId)) return 'elite';
  if (essentialIds.includes(productId)) return 'essential';
  if (basicIds.includes(productId)) return 'basic';

  // fallback
  return 'basic';
}

/**
 * Handler POST pour le webhook Systeme.io
 */
export async function POST(req: NextRequest) {
  // 1) Vérification du secret dans l'URL
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.SYSTEME_IO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  // 2) Lecture du body (on suppose du JSON pour la V1)
  let jsonBody: unknown;
  try {
    jsonBody = await req.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parseResult = systemeIoPayloadSchema.safeParse(jsonBody);
  if (!parseResult.success) {
    console.error('Invalid payload from Systeme.io', parseResult.error.flatten());
    return NextResponse.json(
      { error: 'Invalid payload', details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { email, first_name, sio_contact_id, product_id, plan } = parseResult.data;

  const resolvedPlan = determinePlan({
    product_id,
    planFromPayload: plan,
  });

  // 3) Vérifier si le profil existe déjà (idempotence)
  const existingProfileRes = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingProfileRes.error) {
    console.error('Error checking existing profile', existingProfileRes.error);
    return NextResponse.json(
      { error: 'Database error when checking profile' },
      { status: 500 }
    );
  }

  if (existingProfileRes.data) {
    // 4-a) Mise à jour du profil existant
    const updateRes = await supabaseAdmin
      .from('profiles')
      .update({
        plan: resolvedPlan,
        sio_contact_id: sio_contact_id ?? existingProfileRes.data.id,
        product_id: product_id ?? null,
      })
      .eq('id', existingProfileRes.data.id);

    if (updateRes.error) {
      console.error('Error updating profile', updateRes.error);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: 'ok', action: 'updated_existing_profile' });
  }

  // 4-b) Pas de profil existant → créer un nouvel utilisateur + profil
  const createdUserRes = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      first_name,
      source: 'systeme.io',
    },
  });

  if (createdUserRes.error || !createdUserRes.data.user) {
    console.error('Error creating auth user', createdUserRes.error);
    return NextResponse.json(
      { error: 'Failed to create auth user' },
      { status: 500 }
    );
  }

  const user = createdUserRes.data.user;

  const insertProfileRes = await supabaseAdmin.from('profiles').insert({
    id: user.id,
    email: user.email,
    first_name: first_name ?? null,
    locale: 'fr',
    plan: resolvedPlan,
    sio_contact_id: sio_contact_id ?? null,
    product_id: product_id ?? null,
  });

  if (insertProfileRes.error) {
    console.error('Error inserting profile', insertProfileRes.error);
    return NextResponse.json(
      { error: 'Failed to create profile' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: 'ok',
    action: 'created_user_and_profile',
    user_id: user.id,
  });
}
