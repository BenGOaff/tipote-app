// app/api/systeme-io/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const WEBHOOK_SECRET = process.env.SYSTEME_IO_WEBHOOK_SECRET;

// ----- Schéma du payload que TU reçois déjà de Systeme.io -----
const simplePayloadSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional().nullable(),
  sio_contact_id: z.string().optional().nullable(),
  product_id: z.string().optional().nullable(),
});

// ----- Plans internes -----
type InternalPlan = 'basic' | 'essential' | 'elite';

function planFromProductId(productId?: string | null): InternalPlan | null {
  if (!productId) return null;
  if (productId === 'prod_basic_1') return 'basic';
  if (productId === 'prod_essential_1') return 'essential';
  if (productId === 'prod_elite_1') return 'elite';
  return null;
}

// ----- Helper: trouver OU créer l'utilisateur Supabase -----
async function findOrCreateUser(opts: {
  email: string;
  firstName: string | null;
  sioContactId: string | null;
}): Promise<string> {
  const emailLower = opts.email.toLowerCase();

  // 1) On essaie de le trouver via listUsers
  const { data: listData, error: listError } = await (supabaseAdmin.auth
    .admin as any).listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    console.error('[Systeme.io webhook] Error listing users:', listError);
    throw new Error('Failed to list users');
  }

  const existingUser = listData?.users?.find(
    (u: any) => u.email && u.email.toLowerCase() === emailLower,
  );

  if (existingUser) {
    console.log('[Systeme.io webhook] Found existing user', {
      id: existingUser.id,
      email: existingUser.email,
    });
    return existingUser.id;
  }

  // 2) Pas trouvé → on le crée
  const { data: createData, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email: emailLower,
      email_confirm: true,
      user_metadata: {
        first_name: opts.firstName,
        sio_contact_id: opts.sioContactId,
      },
    });

  if (createError || !createData?.user) {
    console.error('[Systeme.io webhook] Error creating user:', createError);
    throw new Error('Failed to create user');
  }

  console.log('[Systeme.io webhook] Created new user', {
    id: createData.user.id,
    email: createData.user.email,
  });

  return createData.user.id;
}

// ----- Handler principal -----
export async function POST(req: NextRequest) {
  try {
    // 1) Vérif du secret
    const secret = req.nextUrl.searchParams.get('secret');

    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      console.warn('[Systeme.io webhook] Invalid or missing secret', {
        got: secret,
      });
      return NextResponse.json(
        { error: 'Invalid or missing secret' },
        { status: 401 },
      );
    }

    const rawBody = await req.json();

    console.log('[Systeme.io webhook] Incoming payload', {
      topLevelKeys: Object.keys(rawBody),
      rawBody,
    });

    // 2) On parse le payload SIMPLE (celui que tu envoies déjà depuis Systeme.io)
    const parsed = simplePayloadSchema.safeParse(rawBody);

    if (!parsed.success) {
      console.error(
        '[Systeme.io webhook] Payload does not match expected schema',
        parsed.error.format(),
      );
      return NextResponse.json(
        { error: 'Unsupported payload' },
        { status: 400 },
      );
    }

    const { email, first_name, sio_contact_id, product_id } = parsed.data;

    const plan = planFromProductId(product_id) ?? 'basic';

    // 3) On trouve ou crée l'utilisateur auth.users
    const userId = await findOrCreateUser({
      email,
      firstName: first_name ?? null,
      sioContactId: sio_contact_id ?? null,
    });

    // 4) Upsert dans profiles (avec product_id et sio_contact_id)
    const { error: upsertError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: userId,
          email,
          first_name: first_name ?? null,
          locale: 'fr',
          plan,
          sio_contact_id,
          product_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );

    if (upsertError) {
      console.error('[Systeme.io webhook] Error upserting profile:', {
        details: upsertError.details,
        message: upsertError.message,
        hint: upsertError.hint,
        code: upsertError.code,
      });

      return NextResponse.json(
        { error: 'Failed to upsert profile' },
        { status: 500 },
      );
    }

    console.log('[Systeme.io webhook] Success', {
      email,
      userId,
      plan,
      product_id,
      sio_contact_id,
    });

    return NextResponse.json({
      status: 'ok',
      mode: 'simple_test',
      email,
      user_id: userId,
      plan,
      product_id,
      sio_contact_id,
    });
  } catch (err) {
    console.error('[Systeme.io webhook] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
