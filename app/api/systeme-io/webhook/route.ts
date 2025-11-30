// app/api/systeme-io/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const WEBHOOK_SECRET = process.env.SYSTEME_IO_WEBHOOK_SECRET;

// ---------------- Zod schemas ----------------

// Vrai payload “NEW SALE” de Systeme.io (on le prépare pour plus tard)
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

// Ancien payload simple qu’on utilise pour les tests manuels (Invoke-RestMethod)
const simpleTestSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  sio_contact_id: z.string().optional(),
  product_id: z.string().optional(),
});

// ---------------- Types internes ----------------

type InternalPlan = 'basic' | 'essential' | 'elite';

// Si un jour tu récupères les vrais IDs de offer_price_plan, tu peux les mapper ici.
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
  if (offer.id in OFFER_PRICE_PLAN_ID_TO_PLAN) {
    return OFFER_PRICE_PLAN_ID_TO_PLAN[offer.id];
  }

  const name = `${offer.inner_name ?? ''} ${offer.name}`.toLowerCase();

  if (name.includes('basic')) return 'basic';
  if (name.includes('essential')) return 'essential';
  if (name.includes('elite')) return 'elite';

  return null;
}

// ---------------- Helpers réutilisables ----------------

async function getOrCreateUserByEmail(opts: {
  email: string;
  firstName: string | null;
  sioContactId: string | null;
}): Promise<string> {
  const { email, firstName, sioContactId } = opts;

  // getUserByEmail existe bien dans supabase-js,
  // mais les typings ne le connaissent pas -> on caste en any.
  const adminApi: any = supabaseAdmin.auth.admin;

  const { data: existingUserData, error: getUserError } =
    await adminApi.getUserByEmail(email);

  if (getUserError) {
    console.error('[Systeme.io webhook] Error fetching user by email:', getUserError);
    throw new Error('Failed to fetch user');
  }

  if (existingUserData?.user) {
    return existingUserData.user.id;
  }

  const { data: createdUser, error: createUserError } =
    await adminApi.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        sio_contact_id: sioContactId,
      },
    });

  if (createUserError || !createdUser?.user) {
    console.error('[Systeme.io webhook] Error creating user:', createUserError);
    throw new Error('Failed to create user');
  }

  return createdUser.user.id;
}

async function upsertProfile(opts: {
  userId: string;
  email: string;
  firstName: string | null;
  plan: InternalPlan | null;
  sioContactId: string | null;
  productId: string | null;
}) {
  const { userId, email, firstName, plan, sioContactId, productId } = opts;

  const { error } = await supabaseAdmin
    .from('profiles')
    .upsert(
      {
        id: userId,
        email,
        first_name: firstName,
        // locale a un défaut 'fr' dans la table
        // plan a un défaut 'basic' : on envoie celui déduit si dispo
        ...(plan ? { plan } : {}),
        sio_contact_id: sioContactId,
        product_id: productId,
        // on laisse Postgres gérer created_at / updated_at
      },
      { onConflict: 'id' },
    );

  if (error) {
    console.error('[Systeme.io webhook] Error upserting profile:', error);
    throw new Error('Failed to upsert profile');
  }
}

// ---------------- Handler principal ----------------

export async function POST(req: NextRequest) {
  try {
    // 1) Vérif du secret dans l’URL
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

    // 2) On essaie d’abord de parser comme un vrai webhook Systeme.io
    const parsedSysteme = systemeNewSaleSchema.safeParse(rawBody);

    if (parsedSysteme.success) {
      const { data } = parsedSysteme.data;

      const email = data.customer.email.toLowerCase();
      const firstName = data.customer.fields?.first_name ?? null;
      const sioContactId = String(data.customer.contact_id);
      const plan = inferPlanFromOffer(data.offer_price_plan);
      const productId = String(data.offer_price_plan.id);

      const userId = await getOrCreateUserByEmail({
        email,
        firstName,
        sioContactId,
      });

      await upsertProfile({
        userId,
        email,
        firstName,
        plan,
        sioContactId,
        productId,
      });

      return NextResponse.json({
        status: 'ok',
        mode: 'systeme_new_sale',
        email,
        user_id: userId,
        plan: plan ?? 'basic',
        product_id: productId,
      });
    }

    // 3) Sinon, on tente l’ancien format “simple” (tests manuels)
    const parsedSimple = simpleTestSchema.safeParse(rawBody);

    if (parsedSimple.success) {
      const { email, first_name, sio_contact_id, product_id } =
        parsedSimple.data;

      const lowerEmail = email.toLowerCase();

      const plan: InternalPlan | null =
        product_id === 'prod_basic_1'
          ? 'basic'
          : product_id === 'prod_essential_1'
          ? 'essential'
          : product_id === 'prod_elite_1'
          ? 'elite'
          : null;

      const userId = await getOrCreateUserByEmail({
        email: lowerEmail,
        firstName: first_name ?? null,
        sioContactId: sio_contact_id ?? null,
      });

      await upsertProfile({
        userId,
        email: lowerEmail,
        firstName: first_name ?? null,
        plan,
        sioContactId: sio_contact_id ?? null,
        productId: product_id ?? null,
      });

      return NextResponse.json({
        status: 'ok',
        mode: 'simple_test',
        email: lowerEmail,
        user_id: userId,
        plan: plan ?? 'basic',
        product_id,
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
