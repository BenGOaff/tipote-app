// app/api/billing/subscription/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { listSubscriptionsForContact } from '@/lib/systemeIoClient';

type ProfileRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  locale: string | null;
  plan: string | null;
  sio_contact_id: string | null;
  product_id: string | null;
  created_at?: string | null;
  updated_at?: string | null;
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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      sio_contact_id?: number | string;
      contactId?: number | string;
      contact?: number | string;
      email?: string;
      limit?: number;
    };

    const limit =
      typeof body.limit === 'number' && Number.isFinite(body.limit)
        ? body.limit
        : 50;

    const email = body.email?.trim() || null;

    // 1) Déterminer le sio_contact_id (priorité au body)
    let contactId: number | null =
      parseContactId(body.sio_contact_id) ??
      parseContactId(body.contactId) ??
      parseContactId(body.contact);

    let profile: ProfileRow | null = null;

    // 2) Si pas de contactId direct, on essaye de le récupérer via Supabase
    if (!contactId && email) {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (error) {
        console.error(
          '[Billing/subscription] Error fetching profile by email',
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
      // 3) On a déjà un contactId → on essaye quand même de récupérer le profil associé
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('sio_contact_id', String(contactId))
        .maybeSingle();

      if (error) {
        console.error(
          '[Billing/subscription] Error fetching profile by contactId',
          error,
        );
        // On ne bloque pas si le profil est introuvable, on retournera juste null
      } else {
        profile = (data as ProfileRow | null) ?? null;
      }
    }

    if (!contactId) {
      return NextResponse.json(
        {
          error:
            'Missing sio_contact_id or email, impossible de déterminer le contact Systeme.io',
        },
        { status: 400 },
      );
    }

    // 4) Récupérer les abonnements Systeme.io pour ce contact
    const collection = await listSubscriptionsForContact(contactId, {
      limit,
      order: 'desc',
    });

    // Dans ton client Systeme.io, tu renvoies { raw, subscriptions }
    const items = (collection.subscriptions ?? []) as any[];

    // On essaye d’identifier un abonnement "actif"
    const activeSubscription =
      items.find(
        (sub) =>
          String(sub.status ?? '').toLowerCase() === 'active' ||
          String(sub.status ?? '').toLowerCase() === 'trialing',
      ) ?? null;

    const latestSubscription = items[0] ?? null;

    return NextResponse.json(
      {
        contactId,
        limit,
        count: items.length,
        profile,
        subscriptions: items,
        activeSubscription,
        latestSubscription,
        raw: collection.raw ?? collection,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[Billing/subscription] Unexpected error:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Internal server error' },
      { status: 500 },
    );
  }
}
