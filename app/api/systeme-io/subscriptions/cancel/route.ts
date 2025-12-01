// app/api/systeme-io/subscriptions/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  cancelSubscriptionOnSystemeIo,
  SystemeIoCancelMode,
} from '@/lib/systemeIoClient';

function normalizeCancelValue(raw: string): SystemeIoCancelMode | null {
  const trimmed = raw.trim();

  // Valeurs EXACTES attendues par Systeme.io
  if (trimmed === 'Now' || trimmed === 'WhenBillingCycleEnds') {
    return trimmed;
  }

  // Alias possibles pour ton UI (facultatif)
  const lower = trimmed.toLowerCase();
  if (lower === 'immediately' || lower === 'now') {
    return 'Now';
  }
  if (
    lower === 'whenbillingcycleends' ||
    lower === 'when_billing_cycle_ends' ||
    lower === 'at_period_end' ||
    lower === 'end_of_period'
  ) {
    return 'WhenBillingCycleEnds';
  }

  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({} as any));

    const rawId =
      body.subscriptionId ??
      body.subscription_id ??
      body.id ??
      null;

    if (rawId === null || rawId === undefined) {
      return NextResponse.json(
        {
          error:
            'Missing subscriptionId (or subscription_id/id) in request body',
        },
        { status: 400 }
      );
    }

    const subscriptionId =
      typeof rawId === 'string' ? rawId.trim() : String(rawId);

    if (!subscriptionId) {
      return NextResponse.json(
        {
          error: `Empty subscription id value: ${rawId}`,
        },
        { status: 400 }
      );
    }

    const rawCancel =
      body.cancel ??
      body.cancelMode ??
      body.cancel_mode ??
      null;

    if (rawCancel === null || rawCancel === undefined) {
      return NextResponse.json(
        {
          error:
            'Missing cancel (or cancelMode/cancel_mode) in request body',
        },
        { status: 400 }
      );
    }

    const normalized = normalizeCancelValue(String(rawCancel));
    if (!normalized) {
      return NextResponse.json(
        {
          error:
            "Invalid cancel value. Allowed: 'Now', 'WhenBillingCycleEnds'.",
        },
        { status: 400 }
      );
    }

    await cancelSubscriptionOnSystemeIo({
      id: subscriptionId,
      cancel: normalized,
    });

    return NextResponse.json(
      {
        status: 'ok',
        subscriptionId,
        cancel: normalized,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error(
      '[API] /api/systeme-io/subscriptions/cancel failed',
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
        error: 'Failed to cancel subscription on Systeme.io',
        details: error?.responseBody ?? error?.message ?? String(error),
      },
      { status }
    );
  }
}
