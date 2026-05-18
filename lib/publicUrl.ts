// lib/publicUrl.ts
//
// Build the canonical public URL for the current request, honouring the
// custom-domain header set by middleware. Used by every public-facing
// route's generateMetadata() so that `og:url` and `<link rel="canonical">`
// match the actual hostname the visitor / scraper landed on.
//
// Why this matters: Next.js `metadataBase` in app/layout.tsx is a single
// static URL. When a quiz / hosted page is served through a creator's
// custom domain, Next would still emit og:url pointing to the main host
// — iMessage / WhatsApp / Slack read og:url to display the hostname
// under the share preview, so creators who paid for a branded domain
// were seeing `app.tipote.com` / `quiz.tipote.com` in every share
// preview. Setting og:url + canonical explicitly fixes that.
//
// Falls back to returning `null` when the host header is missing
// (e.g. SSG/ISR contexts) so callers can skip the override and let
// metadataBase do its thing.

import { headers } from "next/headers";

export async function buildCanonicalUrl(path: string): Promise<string | null> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return null;
  // Trust the upstream proxy's protocol indication (Caddy sets this).
  // Default to https because every production request to a public page
  // is HTTPS; on localhost the missing header falls back to https which
  // is harmless in dev metadata.
  const proto = h.get("x-forwarded-proto") || "https";
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${proto}://${host}${p}`;
}
