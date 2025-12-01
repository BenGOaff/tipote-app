// app/api/systeme-io/subscriptions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { listSubscriptionsForContact } from '@/lib/systemeIoClient';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({} as any));

    const rawContactId =
      body.sio_contact_id ??
      body.contactId ??
      body.contact ??
      null;

    if (rawContactId === null || rawContactId === undefined) {
      return NextResponse.json(
        {
          error:
            'Missing sio_contact_id (or contactId/contact) in request body',
        },
        { status: 400 }
      );
    }

    const contactIdNumber =
      typeof rawContactId === 'string'
        ? parseInt(rawContactId, 10)
        : Number(rawContactId);

    if (!Number.isFinite(contactIdNumber) || contactIdNumber < 1) {
      return NextResponse.json(
        {
          error: `Invalid contact id value: ${rawContactId}`,
        },
        { status: 400 }
      );
    }

    const limitBody =
      typeof body.limit === 'number' && Number.isFinite(body.limit)
        ? body.limit
        : undefined;

    const { raw, subscriptions } = await listSubscriptionsForContact(
      contactIdNumber,
      { limit: limitBody ?? 50 }
    );

    return NextResponse.json(
      {
        contactId: contactIdNumber,
        subscriptions,
        raw,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error(
      '[API] /api/systeme-io/subscriptions failed',
      error
    );

    const status =
      typeof error?.status === 'number' &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 500;

    return NextResponse.json(
      {
        error: 'Failed to list subscriptions from Systeme.io',
        details: error?.responseBody ?? error?.message ?? String(error),
      },
      { status }
    );
  }
}
