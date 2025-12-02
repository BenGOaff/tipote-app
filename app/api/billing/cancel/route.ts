// app/api/billing/cancel/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  listSubscriptionsForContact,
  cancelSubscriptionOnSystemeIo,
} from '@/lib/systemeIoClient';

type ProfileRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  locale: string | null;
  plan: string | null;
  sio_contact_id: string | null;
  product_id: string | null;
};

function parseContactId(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function normalizeCancelMode(
  raw: unknown,
): 'Now' | 'WhenBillingCycleEnds' | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();

  if (
    v === 'now' ||
    v === 'immediately' ||
    v === 'immediate' ||
    v === 'instant'
  ) {
    return 'Now';
  }

  if (
    v === 'whenbillingcycleends' ||
    v === 'endofperiod' ||
    v === 'end' ||
    v === 'at_period_end'
  ) {
    return 'WhenBillingCycleEnds';
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      subscriptionId?: string;
      id?: string;
      subscription_id?: string;
      cancel?: string;
      cancelMode?: string;
      sio_contact_id?: number | string;
      contactId?: number | string;
      contact?: number | string;
      email?: string;
      newPlan?: string;
    };

    // 1) Normalisation du cancel mode -> "Now" | "WhenBillingCycleEnds"
    const cancelValue =
      normalizeCancelMode(body.cancel) ??
      normalizeCancelMode(body.cancelMode) ??
      'Now'; // défaut : annulation immédiate

    // 2) Récupérer un éventuel subscriptionId direct
    let subscriptionId =
      body.subscriptionId || body.id || body.subscription_id || null;

    // 3) Déterminer le contact Systeme.io et le profil Supabase
    const email = body.email?.trim() || null;

    let contactId: number | null =
      parseContactId(body.sio_contact_id) ??
      parseContactId(body.contactId) ??
      parseContactId(body.contact);

    let profile: ProfileRow | null = null;

    if (!contactId && email) {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (error) {
        console.error(
          '[Billing/cancel] Error fetching profile by email',
          error,
        );
        return NextResponse.json(
          { error: 'Failed to fetch profile by email' },
          { status: 500 },
        );
      }

      profile = (data as ProfileRow | null) ?? null;

      if (profile?.sio_contact_id) {
        contactId = parseContactId(profile.sio_contact_id);
      }
    } else if (contactId) {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('sio_contact_id', String(contactId))
        .maybeSingle();

      if (error) {
        console.error(
          '[Billing/cancel] Error fetching profile by contactId',
          error,
        );
        // on continue quand même, l’annulation reste possible
      } else {
        profile = (data as ProfileRow | null) ?? null;
      }
    }

    // 4) Si pas de subscriptionId, on essaye de trouver l’abo actif via Systeme.io
    if (!subscriptionId) {
      if (!contactId) {
        return NextResponse.json(
          {
            error:
              'Missing subscriptionId and unable to determine contact (provide sio_contact_id or email)',
          },
          { status: 400 },
        );
      }

      const collection = await listSubscriptionsForContact(contactId, {
        limit: 50,
        order: 'desc',
      });
      const items = (collection.subscriptions ?? []) as any[];

      const active =
        items.find(
          (sub) =>
            String(sub.status ?? '').toLowerCase() === 'active' ||
            String(sub.status ?? '').toLowerCase() === 'trialing',
        ) ?? null;

      if (!active) {
        return NextResponse.json(
          {
            error:
              'No active subscription found for this contact, nothing to cancel',
            contactId,
          },
          { status: 400 },
        );
      }

      subscriptionId = String((active as any).id);
    }

    // 5) Annulation sur Systeme.io
    await cancelSubscriptionOnSystemeIo({
      id: String(subscriptionId),
      cancel: cancelValue,
    });

    // 6) Mise à jour éventuelle du profil dans Supabase
    // -> par défaut on repasse sur un plan "basic", sauf si newPlan fourni.
    if (profile?.id) {
      const newPlan = body.newPlan || 'basic';

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          plan: newPlan,
          product_id: null,
        })
        .eq('id', profile.id);

      if (updateError) {
        console.error(
          '[Billing/cancel] Failed to update profile after cancel',
          updateError,
        );
        // on ne remonte pas en erreur HTTP, l’annulation Systeme.io a déjà eu lieu
      }
    }

    return NextResponse.json(
      {
        status: 'ok',
        subscriptionId: String(subscriptionId),
        cancel: cancelValue,
        contactId,
        profileId: profile?.id ?? null,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[Billing/cancel] Unexpected error:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Internal server error' },
      { status: 500 },
    );
  }
}
