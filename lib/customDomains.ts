// lib/customDomains.ts
//
// Pure helpers shared by the custom-domain API routes, the request
// middleware and the Settings UI. Kept dependency-light so the
// middleware bundle stays small and so server components can import
// the types without pulling Node-only modules.
//
// The middleware imports from this file and runs on the Edge runtime,
// where `node:dns` (and the rest of node:*) is unavailable. The DNS
// verification helper lives in the sibling file
// lib/customDomainsServer.ts — only API routes (Node runtime) import
// that one.

export type CustomDomainStatus = "pending_dns" | "verified" | "failed";

export type CustomDomainRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  hostname: string;
  status: CustomDomainStatus;
  dns_target: string;
  error_message: string | null;
  last_checked_at: string | null;
  verified_at: string | null;
  ssl_issued_at: string | null;
  created_at: string;
  updated_at: string;
  // Favicon servi dans l'onglet navigateur pour les routes publiques
  // de CE domaine. Si null, on retombe sur le favicon Tipote par défaut.
  favicon_url: string | null;
};

// Hostnames we control directly. A request whose Host matches one of
// these bypasses the custom-domain lookup entirely (normal routing).
// Keep this list in sync with the Caddyfile vhosts.
//
// connect.tipote.com IS in this list as a safety net: it's the CNAME
// target shown to creators, so its A record points to this VPS, but
// nobody should land here with Host: connect.tipote.com — if they do,
// we never want it interpreted as a "creator domain".
export const OWN_HOSTS: ReadonlySet<string> = new Set([
  "app.tipote.com",
  "tipote.com",
  "www.tipote.com",
  "tipote.fr",
  "www.tipote.fr",
  "n8n.tipote.com",
  "tus.tipote.com",
  "videos.tipote.com",
  "connect.tipote.com",
  // dev / preview
  "localhost",
  "127.0.0.1",
]);

/** Strip port + lowercase. Returns null when Host is unparseable. */
export function normaliseHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.split(":")[0] ?? null;
}

export function isOwnHost(host: string | null | undefined): boolean {
  const h = normaliseHost(host);
  if (!h) return true; // absent Host = treat as own to avoid edge churn
  return OWN_HOSTS.has(h);
}

// FQDN validation (max 253 chars, each label 1-63 chars, TLD 2+ letters).
// Rejects schemes, ports, paths, IPs, single-label hosts.
const HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function isValidHostname(raw: string): boolean {
  return HOSTNAME_RE.test(raw.toLowerCase().trim());
}

// Verification target. Configurable so the VPS can change IP without
// a code redeploy. The CNAME is informational (shown in the UI); the
// real DNS check is against the IP that the chain resolves to.
export const DNS_TARGET_IP =
  process.env.CUSTOM_DOMAIN_TARGET_IP ?? "82.25.115.166";
export const DNS_TARGET_CNAME =
  process.env.CUSTOM_DOMAIN_TARGET_CNAME ?? "connect.tipote.com";

/**
 * Feature gate. Until the VPS has Caddy + on-demand TLS configured
 * for Tipote, shipping the API / middleware is harmless because
 * every public path short-circuits unless this returns true. Flip
 * the env var on the VPS (no redeploy) when the infra is ready.
 */
export function customDomainsEnabled(): boolean {
  return process.env.CUSTOM_DOMAINS_ENABLED === "true";
}
