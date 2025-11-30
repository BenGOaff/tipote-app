// app/api/systeme-io/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const WEBHOOK_SECRET = process.env.SYSTEME_IO_WEBHOOK_SECRET;

// ----- Zod schemas -----

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

// Ancien payload simple pour les tests manuels
const simpleTestSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  sio_contact_id: z.string().optional(),
  product_id: z.string().optional(),
});

// ----- Mapping offres Systeme.io -> plan interne Tipote -----

type InternalPlan = 'basic' | 'essential' | 'elite';

// À remplir plus tard si tu veux du mapping 100% sûr par ID :
const OFFER_PRICE_PLAN_ID_TO_PLAN: Record<number, InternalPlan> = {
  // Exemple :
  // 2962438: 'basic',
  // 2962440: 'essential',
  // 2962442: 'elite',
};

function inferPlanFromOffer(offer: {
  id: number;
  name: string;
  inner_name?: string | null;
}): InternalPlan | null {
  // 1) mapping direct par ID si renseigné
  if (offer.id in OFFER_PRICE_PLAN_ID_TO_PLAN) {
    return OFFER_PRICE_PLAN_ID_TO_PLAN[offer.id];
  }

  // 2) fallback : on devine à partir du nom
  const name = `${offer.inner_name ?? ''} ${offer.name}`.toLowerCase();

  if (name.includes('basic')) return 'basic';
  if (name.includes('essential')) return 'essential';
  if (name.includes('elite')) return 'elite';

  return null;
}

// ----- Helpers réutilisables -----

type FindOrCreateUserOpts = {
  email: string;
  firstName: string | null;
  sioContactId: string | null;
};

/**
 * Essaie de créer l'utilisateur dans Supabase Auth.
 * - Si création OK → retourne le nouvel id d'utilisateur.
 * - Si l'utilisateur existe déjà → on récupère l'id via la table profiles (colonne email unique).
 */
async function findOrCreateUser(
  opts: FindOrCreateUserOpts,
): Promise<string> {
  const { email, firstName, sioContactId } = opts;

  // 1) Tentative de création
  const { data: createdUser, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        sio_contact_id: sioContactId,
      },
    });

  if (!createError && createdUser?.user) {
    return createdUser.user.id;
  }

  // 2) Si autre erreur que "User already registered" → on remonte l'erreur
  if (
    createError &&
    !/user already registered/i.test(createError.message ?? '')
  ) {
    console.error('[Systeme.io webhook] createUser error:', createError);
    throw createError;
  }

  // 3) L'utilisateur existe déjà → on va chercher son id dans profiles via l'email
  const { data: profiles, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .limit(1);

  if (profileError) {
    console.error(
      '[Systeme.io webhook] Error fetching profile by email:',
      profileError,
    );
    throw profileError;
  }

  const existingProfile = profiles?.[0];

  if (!existingProfile) {
    throw new Error(
      'Existing auth user but no profile row found for email ' + email,
    );
  }

  return existingProfile.id as string;
}

// ----- Handler principal -----

export async function POST(req: NextRequest) {
  try {
    // 1) Vérif du "secret" dans l’URL
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
      // Pour avoir quelque chose d’utile dans Supabase : l’ID numérique du plan (ex: 2962438)
      const productId = String(data.offer_price_plan.id);

      // 3) Création / récupération de l’utilisateur
      const userId = await findOrCreateUser({
        email,
        firstName,
        sioContactId,
      });

      // 4) Upsert du profil dans la table profiles
      const { error: upsertProfileError } = await supabaseAdmin
        .from('profiles')
        .upsert(
          {
            id: userId,
            email,
            first_name: firstName,
            locale: 'fr',
            plan: plan ?? 'basic',
            sio_contact_id: sioContactId,
            product_id: productId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        );

      if (upsertProfileError) {
        console.error(
          '[Systeme.io webhook] Error upserting profile (systeme):',
          upsertProfileError,
        );
        return NextResponse.json(
          { error: 'Failed to upsert profile' },
          { status: 500 },
        );
      }

      return NextResponse.json({
        status: 'ok',
        mode: 'systeme',
        email,
        user_id: userId,
        plan,
        product_id: productId,
      });
    }

    // 3) Sinon, on tente l’ancien format “simple” (tests manuels)
    const parsedSimple = simpleTestSchema.safeParse(rawBody);

    if (parsedSimple.success) {
      const { email, first_name, sio_contact_id, product_id } =
        parsedSimple.data;

      const normalizedEmail = email.toLowerCase();

      const plan: InternalPlan | null =
        product_id === 'prod_basic_1'
          ? 'basic'
          : product_id === 'prod_essential_1'
          ? 'essential'
          : product_id === 'prod_elite_1'
          ? 'elite'
          : null;

      const userId = await findOrCreateUser({
        email: normalizedEmail,
        firstName: first_name ?? null,
        sioContactId: sio_contact_id ?? null,
      });

      const { error: upsertProfileError } = await supabaseAdmin
        .from('profiles')
        .upsert(
          {
            id: userId,
            email: normalizedEmail,
            first_name: first_name,
            locale: 'fr',
            plan: plan ?? 'basic',
            sio_contact_id,
            product_id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        );

      if (upsertProfileError) {
        console.error(
          '[Systeme.io webhook] Error upserting profile (simple):',
          upsertProfileError,
        );
        return NextResponse.json(
          { error: 'Failed to upsert profile' },
          { status: 500 },
        );
      }

      return NextResponse.json({
        status: 'ok',
        mode: 'simple_test',
        email: normalizedEmail,
        user_id: userId,
        plan,
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
