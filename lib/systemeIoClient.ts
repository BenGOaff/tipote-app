// lib/systemeIoClient.ts
// Client pour l'API publique Systeme.io (gestion des subscriptions)

const API_BASE =
  process.env.SYSTEME_IO_API_BASE ?? 'https://api.systeme.io/api';
const API_KEY = process.env.SYSTEME_IO_API_KEY;

if (!API_KEY) {
  throw new Error(
    'SYSTEME_IO_API_KEY is not set in environment variables'
  );
}

/**
 * Construit une URL complète vers l'API Systeme.io
 * en ajoutant uniquement les query params non vides.
 */
function buildSystemeUrl(
  path: string,
  query?: Record<string, string | number | undefined | null>
): string {
  const base = API_BASE.replace(/\/+$/, '');
  const full = path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;

  const url = new URL(full);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      const stringValue = String(value);
      if (stringValue.trim() === '') continue;
      url.searchParams.set(key, stringValue);
    }
  }

  return url.toString();
}

/**
 * Requête générique Systeme.io.
 * - Ajoute X-API-Key
 * - Parse le JSON si présent
 * - Loggue les erreurs 4xx/5xx
 */
async function systemeIoRequest<T>(
  path: string,
  options: {
    method?: string;
    query?: Record<string, string | number | undefined | null>;
    body?: unknown;
  } = {}
): Promise<T> {
  const { method = 'GET', query, body } = options;

  const url = buildSystemeUrl(path, query);

  const headers: Record<string, string> = {
    'X-API-Key': API_KEY!,
    Accept: 'application/json',
  };

  let payload: string | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method,
    headers,
    body: payload,
  });

  const text = await res.text();

  if (!res.ok) {
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }

    console.error(
      '[Systeme.io API] Error',
      res.status,
      res.statusText,
      'for',
      url,
      parsed
    );

    const error = new Error(
      `Systeme.io API error ${res.status}: ${res.statusText}`
    );
    (error as any).status = res.status;
    (error as any).url = url;
    (error as any).responseBody = parsed;
    throw error;
  }

  if (!text) {
    // ex: 204 No Content
    return undefined as unknown as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (err) {
    console.error(
      '[Systeme.io API] Failed to parse JSON response for',
      url,
      'raw body:',
      text
    );
    throw err;
  }
}

// --- Types pour les subscriptions ---

export type SystemeIoSubscriptionStatus = 'active' | 'trialing' | 'paid' | string;
export type SystemeIoCancelMode = 'Now' | 'WhenBillingCycleEnds';

export interface SystemeIoSubscription {
  id: string | number;
  status?: SystemeIoSubscriptionStatus;
  [key: string]: any;
}

export interface SystemeIoSubscriptionCollection {
  items?: SystemeIoSubscription[];
  hasMore?: boolean;
  [key: string]: any;
}

/**
 * Normalise la réponse en un tableau de subscriptions.
 */
function normalizeSubscriptionCollection(
  data: SystemeIoSubscriptionCollection | SystemeIoSubscription[] | any
): SystemeIoSubscription[] {
  if (Array.isArray(data)) {
    return data as SystemeIoSubscription[];
  }

  if (data && Array.isArray(data.items)) {
    return data.items as SystemeIoSubscription[];
  }

  return [];
}

/**
 * Liste les subscriptions d'un contact donné.
 *
 * GET /payment/subscriptions?contact=<id>&limit=<10-100>&order=asc|desc
 */
export async function listSubscriptionsForContact(
  contactId: number,
  options?: {
    limit?: number;
    startingAfter?: number;
    order?: 'asc' | 'desc';
  }
): Promise<{
  raw: SystemeIoSubscriptionCollection | SystemeIoSubscription[] | any;
  subscriptions: SystemeIoSubscription[];
}> {
  if (!Number.isFinite(contactId) || contactId < 1) {
    throw new Error(`Invalid Systeme.io contact id: ${contactId}`);
  }

  const limitRaw = options?.limit ?? 50;
  let limit = Math.floor(limitRaw);
  if (!Number.isFinite(limit) || limit < 10) limit = 10;
  if (limit > 100) limit = 100;

  const query: Record<string, string | number> = {
    contact: contactId,
    limit,
  };

  if (
    options?.startingAfter !== undefined &&
    Number.isFinite(options.startingAfter)
  ) {
    query.startingAfter = options.startingAfter!;
  }

  if (options?.order === 'asc' || options?.order === 'desc') {
    query.order = options.order;
  }

  const raw = await systemeIoRequest<
    SystemeIoSubscriptionCollection | SystemeIoSubscription[] | any
  >('/payment/subscriptions', {
    method: 'GET',
    query,
  });

  const subscriptions = normalizeSubscriptionCollection(raw);

  return { raw, subscriptions };
}

/**
 * Annule une subscription.
 *
 * POST /payment/subscriptions/{id}/cancel
 * Body:
 *   { "cancel": "Now" | "WhenBillingCycleEnds" }
 */
export async function cancelSubscriptionOnSystemeIo(params: {
  id: string | number;
  cancel: SystemeIoCancelMode;
}): Promise<void> {
  const { id, cancel } = params;

  if (!id) {
    throw new Error('Missing subscription id for Systeme.io cancellation');
  }

  if (!cancel || typeof cancel !== 'string' || cancel.trim() === '') {
    throw new Error('Missing or empty "cancel" value for Systeme.io cancellation');
  }

  const path = `/payment/subscriptions/${encodeURIComponent(
    String(id)
  )}/cancel`;

  await systemeIoRequest<void>(path, {
    method: 'POST',
    body: { cancel },
  });
}
