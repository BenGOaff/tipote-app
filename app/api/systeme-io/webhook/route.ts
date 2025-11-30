// app/api/systeme-io/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const WEBHOOK_SECRET = process.env.SYSTEME_IO_WEBHOOK_SECRET;

// ----- Types internes -----

type InternalPlan = 'basic' | 'essential' | 'elite';

// Mapping "fake" pour les tests simples (prod_basic_1, etc.)
function planFromProductId(productId?: string | null): InternalPlan | null {
  if (!productId) return null;

  if (productId === 'prod_basic_1') return 'basic';
  if (productId === 'prod_essential_1') return 'essential';
  if (productId === 'prod_elite_1') return 'elite';

  return null;
}

// ----- Zod schemas -----

// Webhook "réel" de Systeme.io (customer.sale.completed)
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

// Ancien format "simple" pour nos tests manuels
const simpleTestSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  sio_contact_id: z.string().optional(),
  product_id: z.string().optional(),
});

// ----- Helpers Supabase -----

async function findUserByEmail(email: string) {
  // On liste les users et on cherche celui qui a cet email
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();

  if (error) {
    console.error('Error listing users:', error);
    throw error;
  }

  const lower = email.toLowerCase();
  const user = data?.users?.find(
    (u) => u.email && u.email.toLowerCase() === lower,
  );

  return user ?? null;
}

async function getOrCreateUser(params: {
  email: string;
  firstName?: string | null;
  sioContactId?: string | null;
  plan?: InternalPlan | null;
}) {
  const { email, firstName, sioContactId, plan } = params;

  // 1) On essaie de retrouver un user existant
  const existingUser = await findUserByEmail(email);

  if (existingUser) {
    // On peut éventuellement mettre à jour ses metadata plus tard
    return existingUser.id;
  }

  // 2) Sinon on le crée
  const { data: created, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        first_name: firstName ?? undefined,
        sio_contact_id: sioContactId ?? undefined,
        plan: plan ?? undefined,
      },
    });

  if (createError || !created?.user) {
    console.error('Error creating user:', createError);
    throw createError ?? new Error('Failed to create user');
  }

  return created.user.id;
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
    console.log('Incoming Systeme.io webhook body:', rawBody);

    // 2) On essaie le vrai payload Systeme.io
    const parsedSysteme = systemeNewSaleSchema.safeParse(rawBody);

    if (parsedSysteme.success) {
      const { data } = parsedSysteme.data;

      const email = data.customer.email.toLowerCase();
      const firstName = data.customer.fields?.first_name ?? null;
      const sioContactId = String(data.customer.contact_id);

      // Pour l’instant, on ne fait PAS d’inférence de plan à partir de offer_price_plan
      // (tu pourras l’ajouter plus tard quand on aura les vrais IDs)
      const plan: InternalPlan | null = null;

      const userId = await getOrCreateUser({
        email,
        firstName,
        sioContactId,
        plan,
      });

      return NextResponse.json({
        status: 'ok',
        mode: 'systeme_real',
        email,
        user_id: userId,
        plan,
      });
    }

    // 3) Sinon, on teste notre format "simple" de debug
    const parsedSimple = simpleTestSchema.safeParse(rawBody);

    if (parsedSimple.success) {
      const { email, first_name, sio_contact_id, product_id } =
        parsedSimple.data;

      const plan = planFromProductId(product_id ?? null);

      const userId = await getOrCreateUser({
        email: email.toLowerCase(),
        firstName: first_name ?? null,
        sioContactId: sio_contact_id ?? null,
        plan,
      });

      return NextResponse.json({
        status: 'ok',
        mode: 'simple_test',
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
