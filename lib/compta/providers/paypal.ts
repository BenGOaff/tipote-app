// lib/compta/providers/paypal.ts
//
// Client minimal pour l'API PayPal. Plus complexe que Stripe parce
// que PayPal exige un OAuth 2.0 client_credentials flow :
//
//   1. L'user crée une "app" sur developer.paypal.com → on récupère
//      un (client_id, secret) qu'il colle dans Tipote
//   2. À chaque sync, on échange (client_id, secret) contre un access
//      token (valable 9h ; on en demande un nouveau à chaque run pour
//      ne pas se trimballer un cache token côté DB)
//   3. Avec l'access token, on call /v1/reporting/transactions par
//      fenêtres de ≤31 jours (limite PayPal). Pour 24 mois = 24
//      requêtes paginées max.
//
// Important : l'app PayPal de l'user doit avoir la feature
// "Transaction Search" activée côté Live API features. On le précise
// dans le guide UI et on lit le 403 que PayPal renvoie si elle ne
// l'est pas pour expliquer l'erreur clairement.
//
// Les "transactions" PayPal incluent les ventes ET les remboursements
// (en lignes séparées avec amount négatif). On stocke tout, le
// dashboard fera SUM(amount_cents - refunded_cents) sur les rows
// status IN ('paid','partial_refund','refunded') pour le net réel.

import "server-only";
import type { NormalizedTransaction } from "./stripe";

const LIVE_BASE = "https://api-m.paypal.com";
const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

export type PaypalMode = "live" | "sandbox";

export interface PaypalCredentials {
  clientId: string;
  secret: string;
  mode: PaypalMode;
}

function baseUrl(mode: PaypalMode): string {
  return mode === "sandbox" ? SANDBOX_BASE : LIVE_BASE;
}

/** Échange (client_id, secret) contre un access_token valable 9h.
 *  Throw si auth foire — le syncEngine catch et stocke l'erreur. */
async function getAccessToken(creds: PaypalCredentials): Promise<string> {
  const auth = Buffer.from(`${creds.clientId}:${creds.secret}`).toString("base64");
  const res = await fetch(`${baseUrl(creds.mode)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error("Identifiants PayPal invalides (Client ID ou Secret incorrect).");
    }
    throw new Error(`PayPal auth ${res.status}: ${txt.slice(0, 300)}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("PayPal n'a pas renvoyé d'access_token.");
  return json.access_token;
}

/** Vérifie qu'on peut s'authentifier ET que la feature "Transaction
 *  Search" est activée. Sans cette feature, l'app PayPal renvoie 403
 *  sur /v1/reporting/transactions. On le détecte ici pour donner un
 *  message d'erreur lisible plutôt que de laisser le sync échouer
 *  silencieusement plus tard. */
export async function probePaypalCredentials(
  creds: PaypalCredentials,
): Promise<{ ok: boolean; error?: string }> {
  let token: string;
  try {
    token = await getAccessToken(creds);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }

  // Probe transaction search avec une fenêtre suffisamment large.
  // PayPal renvoie "Data for the given start date is not available"
  // si la fenêtre est trop courte ou trop récente (problème observé
  // avec une fenêtre de 60 secondes). 30 jours est sûr et le 200
  // OK confirme que la feature Transaction Search est bien activée.
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    start_date: start.toISOString(),
    end_date: end.toISOString(),
    page_size: "1",
    page: "1",
  });
  const res = await fetch(`${baseUrl(creds.mode)}/v1/reporting/transactions?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.ok) return { ok: true };
  const txt = await res.text().catch(() => "");
  if (res.status === 403) {
    return {
      ok: false,
      error:
        "Ton app PayPal n'a pas la feature \"Transaction Search\" activée. Va sur developer.paypal.com → ton app → Live API features → coche Transaction Search → enregistre.",
    };
  }
  // Le 404 INVALID_REQUEST sur une fenêtre récente peut signifier que
  // le compte PayPal est trop récent (compte créé il y a moins de 30
  // jours) ou n'a aucune transaction. On laisse passer comme un OK —
  // l'auth fonctionne, le sync vrai retentera avec sa propre logique
  // de fallback de fenêtre.
  if (
    res.status === 404 &&
    txt.includes("Data for the given start date is not available")
  ) {
    return { ok: true };
  }
  return { ok: false, error: `PayPal ${res.status}: ${txt.slice(0, 200)}` };
}

interface PaypalTransactionDetail {
  transaction_info?: {
    transaction_id?: string;
    transaction_event_code?: string;
    transaction_initiation_date?: string;
    transaction_updated_date?: string;
    transaction_amount?: { value?: string; currency_code?: string };
    transaction_status?: string;
    transaction_subject?: string;
    transaction_note?: string;
  };
  payer_info?: {
    email_address?: string;
    payer_name?: { alternate_full_name?: string; given_name?: string; surname?: string };
  };
}

interface PaypalSearchResponse {
  transaction_details?: PaypalTransactionDetail[];
  total_pages?: number;
  page?: number;
}

/** PayPal accepte une fenêtre de 31 jours max par requête. On chunke
 *  en fenêtres de 30 jours pour avoir un peu de marge, et on pagine
 *  via `page` (PayPal renvoie `total_pages`). */
const WINDOW_DAYS = 30;
const PAGE_SIZE = 500;
const MAX_WINDOWS = 30; // ~30 mois de safety pour ne pas boucler infiniment

export async function fetchAllPaypalTransactions(
  creds: PaypalCredentials,
  sinceUnix: number,
): Promise<NormalizedTransaction[]> {
  const token = await getAccessToken(creds);
  const all: NormalizedTransaction[] = [];

  const startMs = sinceUnix * 1000;
  const endMs = Date.now();
  const windowMs = WINDOW_DAYS * 24 * 60 * 60 * 1000;

  let cursor = startMs;
  let safety = MAX_WINDOWS;
  while (cursor < endMs && safety-- > 0) {
    const winStart = new Date(cursor).toISOString();
    const winEnd = new Date(Math.min(cursor + windowMs, endMs)).toISOString();

    let page = 1;
    let totalPages = 1;
    let windowEmpty = false;
    while (page <= totalPages) {
      const params = new URLSearchParams({
        start_date: winStart,
        end_date: winEnd,
        fields: "transaction_info,payer_info",
        page_size: String(PAGE_SIZE),
        page: String(page),
      });
      const res = await fetch(`${baseUrl(creds.mode)}/v1/reporting/transactions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        // 404 INVALID_REQUEST "Data for the given start date is not
        // available" = PayPal n'a pas de données pour cette fenêtre.
        // Ça arrive quand le compte est plus jeune que la date de
        // début du sync 24 mois. On skip cette fenêtre, on n'échoue
        // pas tout le sync — la prochaine fenêtre (plus récente)
        // marchera dès que le compte aura été créé.
        if (
          res.status === 404 &&
          txt.includes("Data for the given start date is not available")
        ) {
          windowEmpty = true;
          break;
        }
        throw new Error(`PayPal txns ${res.status}: ${txt.slice(0, 300)}`);
      }
      const json = (await res.json()) as PaypalSearchResponse;
      const items = json.transaction_details ?? [];
      for (const item of items) {
        const tx = normalizePaypalTransaction(item);
        if (tx) all.push(tx);
      }
      totalPages = json.total_pages ?? 1;
      page += 1;
    }
    void windowEmpty;

    cursor += windowMs;
  }

  return all;
}

function normalizePaypalTransaction(item: PaypalTransactionDetail): NormalizedTransaction | null {
  const info = item.transaction_info ?? {};
  if (!info.transaction_id) return null;

  // amount.value est une string décimale ("12.34"). On convertit en cents.
  const amountStr = info.transaction_amount?.value ?? "0";
  const amountCents = Math.round(parseFloat(amountStr) * 100);

  const status = mapPaypalStatus(info.transaction_status, amountCents);

  const payerName = item.payer_info?.payer_name;
  const fullName =
    payerName?.alternate_full_name?.trim() ||
    [payerName?.given_name, payerName?.surname].filter(Boolean).join(" ").trim() ||
    null;

  // Pour les remboursements (event_code commence par T11ou T18, amount
  // négatif), on garde amount négatif et status='refunded'. Le dashboard
  // somme amount_cents - refunded_cents pour le net réel.
  const isRefund = (info.transaction_event_code ?? "").startsWith("T11") || amountCents < 0;

  return {
    providerTransactionId: info.transaction_id,
    amountCents,
    currency: (info.transaction_amount?.currency_code ?? "EUR").toUpperCase(),
    status: isRefund ? "refunded" : status,
    refundedCents: 0,
    customerEmail: item.payer_info?.email_address ?? null,
    customerName: fullName,
    description:
      info.transaction_subject?.trim() ||
      info.transaction_note?.trim() ||
      info.transaction_event_code ||
      null,
    paidAt: info.transaction_initiation_date ?? new Date().toISOString(),
    refundedAt: isRefund ? info.transaction_updated_date ?? null : null,
    metadata: {
      paypal_status: info.transaction_status ?? null,
      paypal_event_code: info.transaction_event_code ?? null,
    },
  };
}

/** Mapping des statuts PayPal sur notre vocabulaire interne :
 *    S = Successful → paid
 *    P = Pending    → pending
 *    V = Reversed   → refunded
 *    F = Failed     → failed
 *    D = Denied     → failed
 */
function mapPaypalStatus(s: string | undefined, amountCents: number): NormalizedTransaction["status"] {
  if (s === "P") return "pending";
  if (s === "F" || s === "D") return "failed";
  if (s === "V") return "refunded";
  if (amountCents < 0) return "refunded";
  return "paid";
}
