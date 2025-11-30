// app/api/systeme-io/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const WEBHOOK_SECRET = process.env.SYSTEME_IO_WEBHOOK_SECRET;

type InternalPlan = 'basic' | 'essential' | 'elite';

// À adapter si Systeme.io utilise d'autres IDs, mais d'après tes captures :
const OFFER_PRICE_PLAN_ID_TO_PLAN: Record<number, InternalPlan> = {
  2962438: 'basic',
  2962440: 'essential',
  2962442: 'elite',
};

function extractFields(body: any) {
  const email: string | undefined =
    body.email ??
    body.customer?.email ??
    body.contact?.email ??
    body.data?.customer?.email ??
    body.data?.contact?.email;

  const firstName: string | undefined =
    body.first_name ??
    body.firstname ??
    body.customer?.first_name ??
    body.data?.customer?.first_name ??
    body.data?.customer?.fields?.first_name;

  const sioContactId: string | undefined =
    body.sio_contact_id ??
    body.customer?.contact_id?.toString?.() ??
    body.data?.customer?.contact_id?.toString?.();

  let offerId: string | number | undefined =
    body.offer_price_plan_id ??
    body.offer_price_plan?.id ??
    body.data?.offer_price_plan?.id ??
    body.product_id ??
    body.data?.product_id;

  // "123456" -> 123456
  if (typeof offerId === 'string' && /^\d+$/.test(offerId)) {
    offerId = Number(offerId);
  }

  let plan: InternalPlan | null = null;

  if (typeof offerId === 'number' && OFFER_PRICE_PLAN_ID_TO_PLAN[offerId]) {
    plan = OFFER_PRICE_PLAN_ID_TO_PLAN[offerId];
  } else if (typeof offerId === 'string') {
    const pid = offerId.toLowerCase();
    if (pid.includes('basic')) plan = 'basic';
    else if (pid.includes('essential')) plan = 'essential';
    else if (pid.includes('elite')) plan = 'elite';
  }

  if (!plan) {
    const label =
      body.offer_price_plan?.name ??
      body.data?.offer_price_plan?.name ??
      body.name ??
      body.data?.name;

    if (typeof label === 'string') {
      const lower = label.toLowerCase();
      if (lower.includes('basic')) plan = 'basic';
      else if (lower.includes('essential')) plan = 'essential';
      else if (lower.includes('elite')) plan = 'elite';
    }
  }

  return { email, firstName, sioContactId, plan };
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get('secret');

    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: 'Invalid or missing secret' },
        { status: 401 },
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      console.error('[Systeme.io webhook] Failed to parse JSON body', e);
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    console.log('[Systeme.io webhook] Incoming payload', {
      topLevelKeys: Object.keys(body ?? {}),
      type: body?.type,
    });

    // On essaie d'extraire email / prénom / contact / plan
    const { email, firstName, sioContactId, plan } = extractFields(body);

    if (!email) {
      console.error(
        '[Systeme.io webhook] Could not find email in payload, aborting',
        body,
      );
      return NextResponse.json(
        { error: 'Missing email in payload' },
        { status: 400 },
      );
    }

    // Client admin Supabase (on passe par "any" pour avoir getUserByEmail)
    const admin = supabaseAdmin.auth.admin as any;

    const { data: existingUserData, error: getUserError } =
      await admin.getUserByEmail(email);

    if (getUserError) {
      console.error(
        '[Systeme.io webhook] Error fetching user by email:',
        getUserError,
      );
      return NextResponse.json(
        { error: 'Failed to fetch user' },
        { status: 500 },
      );
    }

    let userId: string;

    if (existingUserData?.user) {
      userId = existingUserData.user.id;
    } else {
      const { data: createdUser, error: createUserError } =
        await admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            first_name: firstName,
            sio_contact_id: sioContactId,
          },
        });

      if (createUserError || !createdUser?.user) {
        console.error(
          '[Systeme.io webhook] Error creating user:',
          createUserError,
        );
        return NextResponse.json(
          { error: 'Failed to create user' },
          { status: 500 },
        );
      }

      userId = createdUser.user.id;
    }

    // Upsert dans profiles
    const { error: upsertProfileError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: userId,
          email,
          first_name: firstName ?? null,
          sio_contact_id: sioContactId ?? null,
          plan,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );

    if (upsertProfileError) {
      console.error(
        '[Systeme.io webhook] Error upserting profile:',
        upsertProfileError,
      );
      return NextResponse.json(
        { error: 'Failed to upsert profile' },
        { status: 500 },
      );
    }

    const mode =
      body?.type === 'customer.sale.completed' ? 'systeme_sale' : 'simple_test';

    return NextResponse.json({
      status: 'ok',
      mode,
      email,
      user_id: userId,
      plan,
    });
  } catch (err) {
    console.error('[Systeme.io webhook] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
