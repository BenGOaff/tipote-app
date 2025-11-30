// app/api/systeme-io/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const WEBHOOK_SECRET = process.env.SYSTEME_IO_WEBHOOK_SECRET;

// ---------- Zod schemas ----------

// Vrai payload "NEW SALE" de Systeme.io
const systemeNewSaleSchema = z.object({
  type: z.literal('customer.sale.completed'),
  data: z.object({
    customer: z.object({
      id: z.number(),
      contact_id: z.number(),
      email: z.string().email(),
      fields: z
        .object({
          first_name: z.string().optional(),
          surname: z.string().optional(),
        })
        .catchall(z.any())
        .optional(),
    }),
    offer_price_plan: z.object({
      id: z.number(),
      name: z.string(),
      inner_name: z.string().optional().nullable(),
      type: z.string(),
    }),
    order: z
      .object({
        id: z.number(),
        created_at: z.string().optional(),
      })
      .partial()
      .optional(),
  }),
});

// Ancien payload simple pour nos tests manuels
const simpleTestSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  sio_contact_id: z.string().optional(),
  product_id: z.string().optional(),
});

// ---------- Mapping offres Systeme.io -> plan interne ----------

type InternalPlan = 'basic' | 'essential' | 'elite';

// À remplir si un jour tu veux mapper par ID d’offer_price_plan
const OFFER_PRICE_PLAN_ID_TO_PLAN: Record<number, InternalPlan> = {
  // 2962438: 'basic',
  // 2962440: 'essential',
  // 2962442: 'elite',
};

function inferPlanFromOffer(offer: {
  id: number;
  name: string;
  inner_name?: string | null;
}): InternalPlan | null {
  // 1) mapping direct par ID si tu l’as configuré
  if (offer.id in OFFER_PRICE_PLAN_ID_TO_PLAN) {
    return OFFER_PRICE_PLAN_ID_TO_PLAN[offer.id];
  }

  // 2) fallback par nom
  const name = `${offer.inner_name ?? ''} ${offer.name}`.toLowerCase();

  if (name.includes('basic')) return 'basic';
  if (name.includes('essential')) return 'essential';
  if (name.includes('elite')) return 'elite';

  return null;
}

// ---------- Helpers Supabase ----------

/**
 * Cherche un user Supabase par email via auth.admin.listUsers()
 * (getUserByEmail n’existe pas dans ta version de supabase-js)
 */
async function findUserByEmail(email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    console.error('[Systeme.io webhook] listUsers error:', error);
    throw error;
  }

  const users = (data as any)?.users ?? [];
  const lower = email.toLowerCase();

  return (
    users.find(
      (u: any) => typeof u.email === 'string' && u.email.toLowerCase() === lower,
    ) ?? null
  );
}

/**
 * Crée un user Supabase (auth) si besoin, sinon renvoie l’existant.
 * Retourne toujours l’id du user.
 */
async function getOrCreateSupabaseUser(params: {
  email: string;
  first_name: string | null;
  sio_contact_id: string | null;
}) {
  const { email, first_name, sio_contact_id } = params;

  // 1) on essaie de trouver un user existant
  const existingUser = await findUserByEmail(email);

  if (existingUser) {
    return existingUser.id as string;
  }

  // 2) sinon on le crée
  const { data: createdUser, error: createUserError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        first_name,
        sio_contact_id,
      },
    });

  if (createUserError || !createdUser?.user) {
    console.error('[Systeme.io webhook] Error creating user:', createUserError);
    throw new Error('Failed to create user');
  }

  return createdUser.user.id as string;
}

/**
 * Upsert du profil dans la table public.profiles
 */
async function upsertProfile(params: {
  userId: string;
  email: string;
  first_name: string | null;
  sio_contact_id: string | null;
  plan: InternalPlan | null;
}) {
  const { userId, email, first_name, sio_contact_id, plan } = params;

  const { error: upsertError } = await supabaseAdmin
    .from('profiles')
    .upsert(
      {
        id: userId,
        email,
        first_name,
        sio_contact_id,
        plan,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

  if (upsertError) {
    console.error('[Systeme.io webhook] Error upserting profile:', upsertError);
    throw upsertError;
  }
}

// ---------- Handler principal ----------

export async function POST(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get('secret');

    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: 'Invalid or missing secret' },
        { status: 401 },
      );
    }

    const rawBody = await req.json();
    console.log('[Systeme.io webhook] Incoming payload', {
      topLevelKeys: Object.keys(rawBody ?? {}),
      type: rawBody?.type,
    });

    // 1) Essai avec le vrai payload Systeme.io
    const parsedSysteme = systemeNewSaleSchema.safeParse(rawBody);

    if (parsedSysteme.success) {
      const { data } = parsedSysteme.data;

      const email = data.customer.email.toLowerCase();
      const firstName = data.customer.fields?.first_name ?? null;
      const sioContactId = String(data.customer.contact_id);
      const plan = inferPlanFromOffer(data.offer_price_plan);

      const userId = await getOrCreateSupabaseUser({
        email,
        first_name: firstName,
        sio_contact_id: sioContactId,
      });

      await upsertProfile({
        userId,
        email,
        first_name: firstName,
        sio_contact_id: sioContactId,
        plan,
      });

      return NextResponse.json({
        status: 'ok',
        mode: 'systeme_new_sale',
        email,
        user_id: userId,
        plan,
      });
    }

    // 2) Sinon, essai avec le format simple pour tests manuels
    const parsedSimple = simpleTestSchema.safeParse(rawBody);

    if (parsedSimple.success) {
      const { email, first_name, sio_contact_id, product_id } =
        parsedSimple.data;

      const plan: InternalPlan | null =
        product_id === 'prod_basic_1'
          ? 'basic'
          : product_id === 'prod_essential_1'
          ? 'essential'
          : product_id === 'prod_elite_1'
          ? 'elite'
          : null;

      const userId = await getOrCreateSupabaseUser({
        email: email.toLowerCase(),
        first_name: first_name ?? null,
        sio_contact_id: sio_contact_id ?? null,
      });

      await upsertProfile({
        userId,
        email: email.toLowerCase(),
        first_name: first_name ?? null,
        sio_contact_id: sio_contact_id ?? null,
        plan,
      });

      return NextResponse.json({
        status: 'ok',
        mode: 'simple_test',
        email: email.toLowerCase(),
        user_id: userId,
        plan,
      });
    }

    console.error(
      '[Systeme.io webhook] Payload does not match any known schema',
      rawBody,
    );

    return NextResponse.json(
      { error: 'Unsupported payload' },
      { status: 400 },
    );
  } catch (err) {
    console.error('[Systeme.io webhook] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
