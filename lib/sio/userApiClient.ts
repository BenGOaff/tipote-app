// lib/sio/userApiClient.ts
// Shared Systeme.io API client using a user's own API key.
// Used for webhook registration, contact enrichment, course enrollment, etc.

const SIO_BASE = "https://api.systeme.io/api";

export interface SioResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

/**
 * Make an authenticated request to the Systeme.io API using the user's API key.
 */
export async function sioUserRequest<T = any>(
  apiKey: string,
  path: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
  } = {},
): Promise<SioResponse<T>> {
  const { method = "GET", body } = options;
  const url = `${SIO_BASE}${path}`;

  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
    Accept: "application/json",
  };

  const fetchOptions: RequestInit = { method, headers };

  if (body && method !== "GET") {
    // Systeme.io uses merge-patch for PATCH
    headers["Content-Type"] =
      method === "PATCH" ? "application/merge-patch+json" : "application/json";
    fetchOptions.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, fetchOptions);
    const text = await res.text();
    let data: T | null = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON (e.g. 204 No Content)
    }

    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? undefined : text.slice(0, 300),
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
