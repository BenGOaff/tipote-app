// lib/compta/providers/stripe.ts
//
// Client minimal pour l'API Stripe — uniquement la lecture des charges
// (pas de write, pas de payouts pour l'instant). On utilise une
// "Restricted Key" en lecture seule fournie par l'user, donc même un
// dump de notre DB ne donne aucun pouvoir sur son compte Stripe (il
// peut révoquer la clé en 1 clic depuis son dashboard).
//
// Stratégie de pagination : on demande des pages de 100 (max Stripe)
// et on suit le curseur `has_more` + `data[last].id`. Pour le sync
// initial (24 mois) on filtre via `created[gte]=...`. Pour le delta
// quotidien, on utilise `created[gte]=last_sync_at - 1h` (overlap de
// sécurité au cas où une charge était en pending lors du dernier run).

import "server-only";

const STRIPE_BASE = "https://api.stripe.com/v1";
const PAGE_SIZE = 100;

export interface NormalizedTransaction {
  provider: "stripe";
  providerTransactionId: string; // ch_xxx
  amountCents: number;
  currency: string; // ISO 4217
  status: "paid" | "refunded" | "partial_refund" | "failed" | "pending";
  refundedCents: number;
  customerEmail: string | null;
  customerName: string | null;
  description: string | null;
  paidAt: string; // ISO
  refundedAt: string | null;
  /** Champs bruts qu'on stocke en JSONB pour debug / extensions futures. */
  metadata: Record<string, unknown>;
}

interface StripeCharge {
  id: string;
  object: string;
  amount: number;
  amount_refunded: number;
  currency: string;
  paid: boolean;
  status: string; // 'succeeded' | 'pending' | 'failed'
  refunded: boolean;
  created: number; // unix seconds
  description: string | null;
  customer: string | null;
  billing_details?: {
    email?: string | null;
    name?: string | null;
  };
  metadata?: Record<string, string>;
  refunds?: {
    data?: Array<{ created: number; amount: number }>;
  };
}

interface StripeListResponse<T> {
  object: "list";
  data: T[];
  has_more: boolean;
}

interface FetchOpts {
  /** Date plancher (Unix seconds). Charges dont `created >= sinceUnix`. */
  sinceUnix: number;
  /** Curseur Stripe : ID de la dernière charge de la page précédente. */
  startingAfter?: string;
}

/** Une seule page de charges. Renvoie les transactions normalisées
 *  + un curseur pour la page suivante (null = fini). */
export async function fetchStripeChargesPage(
  apiKey: string,
  opts: FetchOpts,
): Promise<{ transactions: NormalizedTransaction[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  params.set("limit", String(PAGE_SIZE));
  params.set("created[gte]", String(opts.sinceUnix));
  if (opts.startingAfter) params.set("starting_after", opts.startingAfter);
  // expand[] permet d'inclure les refunds dans la même réponse, on
  // évite ainsi un round-trip par charge remboursée.
  params.append("expand[]", "data.refunds");

  const res = await fetch(`${STRIPE_BASE}/charges?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Stripe-Version": "2024-06-20",
    },
    // On ne cache JAMAIS un appel à Stripe — les chiffres comptables
    // doivent toujours refléter l'état actuel.
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Stripe ${res.status}: ${txt.slice(0, 300)}`);
  }

  const json = (await res.json()) as StripeListResponse<StripeCharge>;
  const transactions = (json.data ?? []).map(normalizeCharge);
  const last = json.data?.[json.data.length - 1];
  const nextCursor = json.has_more && last ? last.id : null;
  return { transactions, nextCursor };
}

/** Récupère TOUTES les charges depuis sinceUnix, en boucle. Cap à
 *  100 pages = 10 000 transactions par sync pour rester bornés
 *  même sur un compte hyper actif. Au-delà, le run suivant continuera
 *  via le curseur `last_sync_at` mis à jour. */
export async function fetchAllStripeCharges(
  apiKey: string,
  sinceUnix: number,
  maxPages = 100,
): Promise<NormalizedTransaction[]> {
  const all: NormalizedTransaction[] = [];
  let cursor: string | undefined;
  let safety = maxPages;
  while (safety-- > 0) {
    const { transactions, nextCursor } = await fetchStripeChargesPage(apiKey, {
      sinceUnix,
      startingAfter: cursor,
    });
    all.push(...transactions);
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return all;
}

/** Vérifie qu'une clé est valide en faisant un appel léger. Utilisé
 *  au moment où l'user pose sa clé : on échoue immédiatement avec un
 *  message clair plutôt que d'avoir un sync qui tombe 12 heures plus
 *  tard sans que l'user comprenne. */
export async function probeStripeKey(apiKey: string): Promise<{ ok: boolean; error?: string; livemode?: boolean }> {
  try {
    const res = await fetch(`${STRIPE_BASE}/charges?limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (res.ok) {
      const json = (await res.json()) as { livemode?: boolean };
      return { ok: true, livemode: json.livemode === true };
    }
    if (res.status === 401) {
      return { ok: false, error: "Clé Stripe invalide ou révoquée." };
    }
    if (res.status === 403) {
      return {
        ok: false,
        error:
          "Clé Stripe sans permission de lecture sur les paiements. Crée une Restricted Key avec accès Read sur Charges, Customers et Balance.",
      };
    }
    const txt = await res.text().catch(() => "");
    return { ok: false, error: `Stripe ${res.status}: ${txt.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau" };
  }
}

function normalizeCharge(c: StripeCharge): NormalizedTransaction {
  // Stripe renvoie status='succeeded' pour une charge réussie. On
  // mappe sur notre vocabulaire plus parlant : paid / refunded /
  // partial_refund / failed / pending.
  let status: NormalizedTransaction["status"] = "paid";
  if (c.status === "failed") status = "failed";
  else if (c.status === "pending") status = "pending";
  else if (c.refunded) status = "refunded";
  else if (c.amount_refunded > 0) status = "partial_refund";

  // Date de paiement : Stripe `created` correspond à la création de
  // la charge, qui pour une charge succeeded est ~= date de paiement.
  // Pour les charges pending → created.
  const paidAt = new Date(c.created * 1000).toISOString();

  // Date de remboursement = max(refunds[].created)
  let refundedAt: string | null = null;
  const refunds = c.refunds?.data ?? [];
  if (refunds.length > 0) {
    const maxCreated = Math.max(...refunds.map((r) => r.created));
    refundedAt = new Date(maxCreated * 1000).toISOString();
  }

  return {
    provider: "stripe",
    providerTransactionId: c.id,
    amountCents: c.amount,
    currency: (c.currency || "eur").toUpperCase(),
    status,
    refundedCents: c.amount_refunded ?? 0,
    customerEmail: c.billing_details?.email ?? null,
    customerName: c.billing_details?.name ?? null,
    description: c.description ?? null,
    paidAt,
    refundedAt,
    metadata: {
      stripe_status: c.status,
      stripe_paid: c.paid,
      stripe_customer: c.customer ?? null,
      ...(c.metadata ?? {}),
    },
  };
}
