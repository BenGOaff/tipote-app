// lib/compta/syncEngine.ts
//
// Sync engine générique pour les connexions PSP. Une seule fonction
// `syncConnection` qui sait dispatcher selon le provider, déclencher
// le bon lister, persister en base de manière idempotente, mettre à
// jour la connexion (last_sync_at, errors).
//
// Stratégie de fenêtre :
//   • Pas de initial_sync_done_at  → sync depuis (now - INITIAL_WINDOW_MONTHS)
//   • Sinon                         → sync depuis (last_sync_at - OVERLAP_HOURS)
// L'overlap d'1h sur le delta couvre les charges qui auraient été
// `pending` lors du dernier run et qui sont devenues `succeeded`
// entre-temps.
//
// Idempotence : `transactions.UNIQUE (user_id, provider,
// provider_transaction_id)` + upsert avec `onConflict` → re-rouler le
// sync ne duplique jamais.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import {
  fetchAllStripeCharges,
  type NormalizedTransaction,
} from "@/lib/compta/providers/stripe";
import {
  fetchAllPaypalTransactions,
  type PaypalCredentials,
} from "@/lib/compta/providers/paypal";
import { fetchAllMolliePayments } from "@/lib/compta/providers/mollie";

/** Combien de mois on remonte au tout premier sync d'une connexion.
 *  24 mois = 12 mois pour la jauge franchise TVA glissante + 12 mois
 *  N-1 pour les comparaisons et les déclarations rétroactives. */
const INITIAL_WINDOW_MONTHS = 24;

/** Chevauchement appliqué au delta pour rattraper les charges qui
 *  étaient pending lors du précédent sync. */
const OVERLAP_HOURS = 1;

export interface PaymentConnectionRow {
  id: string;
  user_id: string;
  project_id: string | null;
  provider: string;
  api_key_encrypted: string;
  last_sync_at: string | null;
  initial_sync_done_at: string | null;
  disabled_at: string | null;
}

export interface SyncOutcome {
  connectionId: string;
  provider: string;
  ok: boolean;
  fetched: number;
  upserted: number;
  initialSync: boolean;
  error?: string;
}

/** Synchronise une connexion. Ne throw jamais — encapsule l'erreur
 *  dans le retour pour que le cron puisse continuer avec les autres
 *  connexions même si une casse. */
export async function syncConnection(
  admin: SupabaseClient,
  connection: PaymentConnectionRow,
): Promise<SyncOutcome> {
  const out: SyncOutcome = {
    connectionId: connection.id,
    provider: connection.provider,
    ok: false,
    fetched: 0,
    upserted: 0,
    initialSync: !connection.initial_sync_done_at,
  };

  if (connection.disabled_at) {
    return { ...out, ok: true, error: "connection disabled — skipped" };
  }

  // Décryptage : pour Stripe c'est une simple string (la Restricted
  // Key). Pour PayPal c'est un JSON {clientId, secret, mode}. Le
  // chiffrement traite les deux pareil — la sémantique est gérée ici.
  let decryptedSecret: string;
  try {
    decryptedSecret = decrypt(connection.api_key_encrypted);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Decrypt failed";
    await admin
      .from("payment_connections")
      .update({ last_sync_error: msg, updated_at: new Date().toISOString() })
      .eq("id", connection.id);
    return { ...out, error: msg };
  }

  const sinceMs = computeSinceMs(connection);
  const sinceUnix = Math.floor(sinceMs / 1000);

  let transactions: NormalizedTransaction[] = [];
  try {
    if (connection.provider === "stripe") {
      transactions = await fetchAllStripeCharges(decryptedSecret, sinceUnix);
    } else if (connection.provider === "paypal") {
      const creds = parsePaypalCredentials(decryptedSecret);
      transactions = await fetchAllPaypalTransactions(creds, sinceUnix);
    } else if (connection.provider === "mollie") {
      transactions = await fetchAllMolliePayments(decryptedSecret, sinceUnix);
    } else {
      throw new Error(`Provider non géré : ${connection.provider}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    await admin
      .from("payment_connections")
      .update({ last_sync_error: msg, updated_at: new Date().toISOString() })
      .eq("id", connection.id);
    return { ...out, error: msg };
  }
  out.fetched = transactions.length;

  // Upsert idempotent. `onConflict` cible la contrainte UNIQUE
  // (user_id, provider, provider_transaction_id). En cas de conflit,
  // on met à jour les champs qui peuvent évoluer (status, refund…)
  // mais pas paid_at / amount qui sont immuables côté provider.
  if (transactions.length > 0) {
    const rows = transactions.map((t) => ({
      user_id: connection.user_id,
      project_id: connection.project_id,
      connection_id: connection.id,
      // Le provider est dérivé de la connexion (source autoritaire),
      // pas de la transaction normalisée — qui ne le connait pas.
      provider: connection.provider,
      provider_transaction_id: t.providerTransactionId,
      amount_cents: t.amountCents,
      currency: t.currency,
      status: t.status,
      refunded_cents: t.refundedCents,
      customer_email: t.customerEmail,
      customer_name: t.customerName,
      description: t.description,
      paid_at: t.paidAt,
      refunded_at: t.refundedAt,
      metadata: t.metadata,
      synced_at: new Date().toISOString(),
    }));

    const { error: upErr, count } = await admin
      .from("transactions")
      .upsert(rows, {
        onConflict: "user_id,provider,provider_transaction_id",
        count: "exact",
      });
    if (upErr) {
      await admin
        .from("payment_connections")
        .update({
          last_sync_error: upErr.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);
      return { ...out, error: upErr.message };
    }
    out.upserted = count ?? rows.length;
  }

  // Sync OK — on stamp last_sync_at + (si applicable) initial_sync_done_at
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    last_sync_at: now,
    last_sync_error: null,
    updated_at: now,
  };
  if (!connection.initial_sync_done_at) {
    patch.initial_sync_done_at = now;
  }
  await admin.from("payment_connections").update(patch).eq("id", connection.id);

  return { ...out, ok: true };
}

/** Itère sur toutes les connexions actives et les sync. Utilisé par
 *  le cron `/api/cron/sync-payments` ET par la route "sync now"
 *  côté user. */
export async function syncAllActiveConnections(
  admin: SupabaseClient,
  filter?: { userId?: string; connectionId?: string },
): Promise<{ outcomes: SyncOutcome[]; total: number; failed: number }> {
  let query = admin
    .from("payment_connections")
    .select("id, user_id, project_id, provider, api_key_encrypted, last_sync_at, initial_sync_done_at, disabled_at")
    .is("disabled_at", null);
  if (filter?.userId) query = query.eq("user_id", filter.userId);
  if (filter?.connectionId) query = query.eq("id", filter.connectionId);

  const { data: connections, error } = await query;
  if (error) {
    return { outcomes: [], total: 0, failed: 0 };
  }

  const outcomes: SyncOutcome[] = [];
  let failed = 0;
  // Sync séquentiel pour ne pas tomber sur les rate-limits Stripe
  // (100 req/sec en théorie, mais avec plusieurs users qui sync en
  // parallèle on est vite à la limite — séquentiel + bornes par
  // provider via maxPages dans le lister suffit).
  for (const c of (connections ?? []) as PaymentConnectionRow[]) {
    const outcome = await syncConnection(admin, c);
    outcomes.push(outcome);
    if (!outcome.ok) failed += 1;
  }
  return { outcomes, total: outcomes.length, failed };
}

/** Pour PayPal, la "clé" stockée est un JSON {clientId, secret, mode}.
 *  Cette fonction le parse en throw si le format est cassé (ne devrait
 *  pas arriver — le POST /paypal valide avant d'encrypt). */
function parsePaypalCredentials(decrypted: string): PaypalCredentials {
  try {
    const parsed = JSON.parse(decrypted) as Partial<PaypalCredentials>;
    if (!parsed.clientId || !parsed.secret) {
      throw new Error("Credentials PayPal incomplets en base.");
    }
    return {
      clientId: parsed.clientId,
      secret: parsed.secret,
      mode: parsed.mode === "sandbox" ? "sandbox" : "live",
    };
  } catch (e) {
    throw new Error(
      "Format de credentials PayPal invalide en base — reconnecte ton compte.",
    );
  }
}

function computeSinceMs(connection: PaymentConnectionRow): number {
  if (!connection.initial_sync_done_at) {
    // Sync initial → 24 mois en arrière
    const d = new Date();
    d.setMonth(d.getMonth() - INITIAL_WINDOW_MONTHS);
    return d.getTime();
  }
  // Delta sync → depuis last_sync_at - 1h (overlap)
  const last = connection.last_sync_at
    ? new Date(connection.last_sync_at).getTime()
    : Date.now() - 24 * 60 * 60 * 1000;
  return last - OVERLAP_HOURS * 60 * 60 * 1000;
}
