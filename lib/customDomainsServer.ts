// lib/customDomainsServer.ts
//
// Node-runtime-only piece of the custom-domains feature: the actual
// DNS lookup. Kept separate from lib/customDomains.ts so the Edge
// middleware never pulls `node:dns` into its bundle (Turbopack traces
// dynamic imports too, so the split has to be at the module level).
//
// Only API routes that need to verify ownership should import from
// here. Everything else stays on lib/customDomains.ts.

import "server-only";
import { promises as dns } from "node:dns";

import { DNS_TARGET_IP } from "./customDomains";

export type DnsCheckResult = {
  ok: boolean;
  resolvedIps: string[];
  error?: string;
};

/**
 * Resolves the A records for `hostname` and checks one matches our VPS
 * IP. Works for both apex domains (A record straight to us) and
 * subdomains CNAMEd to our `connect.tipote.com` — the OS resolver
 * follows the CNAME chain transparently.
 *
 * Returns the resolved IPs alongside the verdict so the UI can show
 * "you pointed it to X instead of Y" when the check fails.
 */
export async function verifyDomainDns(hostname: string): Promise<DnsCheckResult> {
  try {
    const resolvedIps = await dns.resolve4(hostname);
    return { ok: resolvedIps.includes(DNS_TARGET_IP), resolvedIps };
  } catch (e) {
    return { ok: false, resolvedIps: [], error: (e as Error).message };
  }
}

/**
 * Walks the hostname up the DNS hierarchy until it finds an NS record
 * set. For `blog.alice.com` this typically returns the NS for
 * `alice.com` — DNS hierarchy means the parent's authoritative servers
 * own the entire subtree.
 *
 * Returns an empty array if no level resolves (very weird DNS state,
 * or hostname is bogus). The caller treats that as "unknown registrar"
 * and falls back to generic instructions.
 *
 * We intentionally don't use a public suffix list. The naive
 * "trim-leftmost-label" loop covers every real-world case (apex, www,
 * arbitrary subdomain) without dragging in a 200 KB asset.
 */
export async function findAuthoritativeNs(hostname: string): Promise<string[]> {
  const labels = hostname.toLowerCase().split(".").filter(Boolean);
  while (labels.length >= 2) {
    const candidate = labels.join(".");
    try {
      const ns = await dns.resolveNs(candidate);
      if (ns.length > 0) return ns;
    } catch {
      // ENOTFOUND, ENODATA, etc. — keep climbing.
    }
    labels.shift();
  }
  return [];
}
