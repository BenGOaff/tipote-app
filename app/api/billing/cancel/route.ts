// app/api/billing/cancel/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import {
  listSubscriptionsForContact,
  cancelSubscriptionOnSystemeIo,
} from '@/lib/systemeIoClient';
import { ensureUserCredits } from '@/lib/credits';

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
    // ✅ Auth: l'utilisateur doit être connecté pour annuler son propre abonnement
    const supabase = await getSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    // ✅ Priorité : utilise l'email de la session auth (plus fiable que le body)
    const email = session.user.email?.trim().toLowerCase() || body.email?.trim() || null;

    let contactId: number | null =
      parseContactId(body.sio_contact_id) ??
      parseContactId(body.contactId) ??
      parseContactId(body.contact);

    let profile: ProfileRow | null = null;

    // ✅ First try: find profile by auth user ID (most reliable)
    if (!profile) {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      profile = (data as ProfileRow | null) ?? null;
      if (profile?.sio_contact_id && !contactId) {
        contactId = parseContactId(profile.sio_contact_id);
      }
    }

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
        // on continue quand même, l"annulation reste possible
      } else {
        profile = (data as ProfileRow | null) ?? null;
      }
    }

    // 4) Si pas de subscriptionId, on essaye de trouver l"abo actif via Systeme.io
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

    // 6) Mise à jour du profil dans Supabase
    // ✅ FIX: Annulation => plan "free" (pas "basic"). Recalcul crédits.
    const targetUserId = profile?.id ?? session.user.id;
    const newPlan = body.newPlan || "free";

    // Log l"annulation
    try {
      await supabaseAdmin.from("plan_change_log").insert({
        target_user_id: targetUserId,
        target_email: email,
        old_plan: profile?.plan ?? null,
        new_plan: newPlan,
        reason: `billing_cancel (${cancelValue})`,
      } as any);
    } catch { /* best effort */ }

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        plan: newPlan,
        product_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetUserId);

    if (updateError) {
      console.error(
        "[Billing/cancel] Failed to update profile after cancel",
        updateError,
      );
    }

    // ✅ Recalculer les crédits pour le nouveau plan
    try {
      await ensureUserCredits(targetUserId);
    } catch (e) {
      console.error("[Billing/cancel] Failed to recalculate credits", e);
    }

    return NextResponse.json(
      {
        status: 'ok',
        subscriptionId: String(subscriptionId),
        cancel: cancelValue,
        contactId,
        profileId: targetUserId,
        newPlan,
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
