// lib/compta/providers/mollie.ts
//
// Client minimal pour l'API Mollie. Plus simple que PayPal (pas
// d'OAuth — juste une API key Bearer comme Stripe), mais avec une
// pagination différente : Mollie est curseur-based (pas d'offset)
// et trie DESC par createdAt par défaut.
//
// Stratégie : on suit `_links.next.href` (URL pré-construite par
// Mollie). Comme les paiements arrivent du plus récent au plus
// ancien, on s'arrête dès qu'on rencontre un paiement plus vieux
// que notre fenêtre `sinceUnix` — pas besoin d'aller plus loin.
//
// ⚠️ Sécurité : contrairement à Stripe, Mollie n'a pas de "Restricted
// Key" en lecture seule. La Live API key donne accès en lecture ET
// écriture (y compris créer des paiements, des refunds…). On le
// précise dans le guide UI pour que l'user comprenne le périmètre.

import "server-only";
import type { NormalizedTransaction } from "./stripe";

const BASE = "https://api.mollie.com/v2";
const PAGE_LIMIT = 250;
// Cap de safety : 100 pages * 250 paiements = 25 000. Au-delà, le
// run suivant continuera depuis le delta. Mollie n'a pas de rate-limit
// publique stricte mais on évite de tirer 500 pages d'un coup.
const MAX_PAGES = 100;

interface MollieAmount {
  currency: string;
  value: string; // "10.00" — string décimale
}

interface MolliePayment {
  resource: string;
  id: string;
  status: string;
  createdAt: string;
  paidAt?: string | null;
  amount: MollieAmount;
  amountRefunded?: MollieAmount;
  description?: string | null;
  customerId?: string | null;
  metadata?: Record<string, unknown> | null;
  details?: {
    consumerEmail?: string;
    consumerName?: string;
    cardHolder?: string;
  };
}

interface MollieListResponse {
  count?: number;
  _embedded?: { payments?: MolliePayment[] };
  _links?: {
    next?: { href: string } | null;
  };
}

/** Détecte les clés Mollie qui n'ont pas le bon préfixe (toutes les
 *  clés Mollie commencent par live_ ou test_). Sécurité côté UI : on
 *  rejette tôt plutôt que de partir en probe. */
export function isLikelyMollieKey(s: string): boolean {
  return /^(live|test)_[A-Za-z0-9]{20,}/.test(s.trim());
}

export async function probeMollieKey(apiKey: string): Promise<{ ok: boolean; error?: string; mode?: "live" | "test" }> {
  try {
    // /v2/methods est l'endpoint le plus léger qui demande une auth :
    // ne charge pas la base mais valide la clé + ses permissions de
    // base.
    const res = await fetch(`${BASE}/methods`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (res.ok) {
      const mode = apiKey.startsWith("test_") ? "test" : "live";
      return { ok: true, mode };
    }
    if (res.status === 401) {
      return { ok: false, error: "Clé Mollie invalide ou révoquée." };
    }
    if (res.status === 403) {
      return {
        ok: false,
        error: "Clé Mollie sans permissions suffisantes pour lire les paiements.",
      };
    }
    const txt = await res.text().catch(() => "");
    return { ok: false, error: `Mollie ${res.status}: ${txt.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau" };
  }
}

export async function fetchAllMolliePayments(
  apiKey: string,
  sinceUnix: number,
): Promise<NormalizedTransaction[]> {
  const sinceMs = sinceUnix * 1000;
  const all: NormalizedTransaction[] = [];
  let nextUrl: string | null = `${BASE}/payments?limit=${PAGE_LIMIT}`;
  let safety = MAX_PAGES;

  while (nextUrl && safety-- > 0) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Mollie payments ${res.status}: ${txt.slice(0, 300)}`);
    }
    const json = (await res.json()) as MollieListResponse;
    const payments = json._embedded?.payments ?? [];

    for (const p of payments) {
      const createdMs = Date.parse(p.createdAt);
      if (Number.isFinite(createdMs) && createdMs < sinceMs) {
        // On a dépassé la fenêtre. Comme Mollie trie DESC par
        // createdAt, tous les paiements suivants sont plus vieux —
        // on peut sortir tout de suite.
        return all;
      }
      const tx = normalizeMolliePayment(p);
      if (tx) all.push(tx);
    }

    nextUrl = json._links?.next?.href ?? null;
  }

  return all;
}

function normalizeMolliePayment(p: MolliePayment): NormalizedTransaction | null {
  if (!p.id) return null;

  const amountCents = parseAmountToCents(p.amount);
  const refundedCents = parseAmountToCents(p.amountRefunded);

  // Mapping des statuts Mollie sur notre vocabulaire interne.
  // Mollie statuts : open / canceled / pending / authorized / expired
  // / failed / paid.
  let status: NormalizedTransaction["status"] = "paid";
  if (p.status === "failed" || p.status === "canceled" || p.status === "expired") {
    status = "failed";
  } else if (p.status === "open" || p.status === "pending" || p.status === "authorized") {
    status = "pending";
  } else if (p.status === "paid") {
    if (refundedCents >= amountCents && refundedCents > 0) status = "refunded";
    else if (refundedCents > 0) status = "partial_refund";
    else status = "paid";
  }

  // Pour les paiements pending/expired/etc, paidAt n'existe pas →
  // on retombe sur createdAt. Pour les paid, paidAt est l'horodatage
  // qui compte côté compta.
  const paidAt = p.paidAt ?? p.createdAt;

  const customerName = p.details?.consumerName ?? p.details?.cardHolder ?? null;

  return {
    providerTransactionId: p.id,
    amountCents,
    currency: (p.amount?.currency ?? "EUR").toUpperCase(),
    status,
    refundedCents,
    customerEmail: p.details?.consumerEmail ?? null,
    customerName,
    description: p.description ?? null,
    paidAt,
    // Mollie n'expose pas la date exacte du remboursement sur le
    // payment object — il faudrait pull /v2/payments/:id/refunds.
    // Pas critique pour le dashboard, on laisse null.
    refundedAt: null,
    metadata: {
      mollie_status: p.status,
      mollie_customer_id: p.customerId ?? null,
      ...(p.metadata ?? {}),
    },
  };
}

function parseAmountToCents(a: MollieAmount | undefined): number {
  if (!a || !a.value) return 0;
  const f = parseFloat(a.value);
  if (!Number.isFinite(f)) return 0;
  return Math.round(f * 100);
}
