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

// Ancien payload simple qu’on utilisait pour les tests manuels
const simpleTestSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  sio_contact_id: z.string().optional(),
  product_id: z.string().optional(),
});

// ----- Mapping offres Systeme.io -> plan Tipote -----

export type InternalPlan = 'basic' | 'essential' | 'elite';

// ⚠️ À ADAPTER avec les vrais IDs d’offer_price_plan de tes offres Systeme.io.
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
  // 1) mapping par ID si tu l’as rempli
  if (offer.id in OFFER_PRICE_PLAN_ID_TO_PLAN) {
    return OFFER_PRICE_PLAN_ID_TO_PLAN[offer.id];
  }

  // 2) fallback : on essaie de deviner à partir du nom
  const name = `${offer.inner_name ?? ''} ${offer.name}`.toLowerCase();

  if (name.includes('basic')) return 'basic';
  if (name.includes('essential')) return 'essential';
  if (name.includes('elite')) return 'elite';

  return null;
}

// ----- Helper Supabase : trouver un user par email -----

async function findUserByEmail(email: string) {
  // On prend une grosse page et on filtre côté JS.
  // Pour ton projet, 1000 users par page c’est largement suffisant.
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    return { user: null as any, error };
  }

  const user =
    data?.users?.find(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase(),
    ) ?? null;

  return { user, error: null as any };
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

    // 2) On essaie d’abord de parser comme un vrai webhook Systeme.io
    const parsedSysteme = systemeNewSaleSchema.safeParse(rawBody);

    if (parsedSysteme.success) {
      const { data } = parsedSysteme.data;

      const email = data.customer.email.toLowerCase();
      const firstName = data.customer.fields?.first_name ?? null;
      const sioContactId = String(data.customer.contact_id);
      const plan = inferPlanFromOffer(data.offer_price_plan);

      // 3) Création / récupération de l’utilisateur Supabase
      const { user: existingUser, error: getUserError } =
        await findUserByEmail(email);

      if (getUserError) {
        console.error('Error fetching user by email:', getUserError);
        return NextResponse.json(
          { error: 'Failed to fetch user' },
          { status: 500 },
        );
      }

      let userId: string;

      if (existingUser) {
        userId = existingUser.id;
      } else {
        const { data: createdUser, error: createUserError } =
          await supabaseAdmin.auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: {
              first_name: firstName,
              sio_contact_id: sioContactId,
            },
          });

        if (createUserError || !createdUser?.user) {
          console.error('Error creating user:', createUserError);
          return NextResponse.json(
            { error: 'Failed to create user' },
            { status: 500 },
          );
        }

        userId = createdUser.user.id;
      }

      // 4) Upsert du profil dans la table profiles
      const { error: upsertProfileError } = await supabaseAdmin
        .from('profiles')
        .upsert(
          {
            id: userId,
            email,
            full_name: firstName,
            sio_contact_id: sioContactId,
            plan, // "basic" | "essential" | "elite" ou null
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        );

      if (upsertProfileError) {
        console.error('Error upserting profile:', upsertProfileError);
        return NextResponse.json(
          { error: 'Failed to upsert profile' },
          { status: 500 },
        );
      }

      return NextResponse.json({
        status: 'ok',
        action: 'systeme_new_sale',
        email,
        user_id: userId,
        plan,
      });
    }

    // 3) Sinon, on tente l’ancien format “simple” (tests manuels)
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

      const { user: existingUser, error: getUserError } =
        await findUserByEmail(email);

      if (getUserError) {
        console.error('Error fetching user by email (simple):', getUserError);
        return NextResponse.json(
          { error: 'Failed to fetch user' },
          { status: 500 },
        );
      }

      let userId: string;

      if (existingUser) {
        userId = existingUser.id;
      } else {
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
          console.error('Error creating user (simple):', createUserError);
          return NextResponse.json(
            { error: 'Failed to create user' },
            { status: 500 },
          );
        }

        userId = createdUser.user.id;
      }

      const { error: upsertProfileError } = await supabaseAdmin
        .from('profiles')
        .upsert(
          {
            id: userId,
            email,
            full_name: first_name,
            sio_contact_id,
            plan,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        );

      if (upsertProfileError) {
        console.error('Error upserting profile (simple):', upsertProfileError);
        return NextResponse.json(
          { error: 'Failed to upsert profile' },
          { status: 500 },
        );
      }

      return NextResponse.json({
        status: 'ok',
        action: 'simple_test',
        email,
        user_id: userId,
        plan,
      });
    }

    console.error('Payload does not match any known schema', rawBody);

    return NextResponse.json(
      { error: 'Unsupported payload' },
      { status: 400 },
    );
  } catch (err) {
    console.error('Unexpected error in Systeme.io webhook:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
