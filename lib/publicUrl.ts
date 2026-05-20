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
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

// ─── Branding override pour les meta sociales ──────────────────────
// Quand un creator a un custom domain vérifié, on ne veut PLUS aucune
// mention "Tipote" dans les aperçus iMessage / WhatsApp / FB / etc.
// (Adeline, 19 mai 2026). Cette fonction résout l'override par
// (owner, project) : son `share_site_name` (business_profiles) s'il
// l'a renseigné, sinon le hostname vérifié comme fallback. Retourne
// `null` quand l'user n'a pas de custom domain → la route applique le
// siteName par défaut "Tipote" via app/layout.tsx (comportement
// historique préservé).
//
// Scope par project_id : custom_domains.project_id + business_profiles
// par projet, donc 2 projects d'un même user peuvent avoir 2 brandings
// différents.

export type OwnerBranding = {
  /** Hostname custom domain (lower-case, sans port) — ex: "quiz.adelinecirade.com". */
  customHost: string;
  /** Nom de marque user-éditable (ex: "Adeline Cirade"). Null si pas rempli. */
  siteName: string | null;
  /** Favicon custom à afficher dans l'onglet navigateur. Null = on
   *  retombe sur le /favicon.ico Tipote par défaut. Décision Béné
   *  (23 mai 2026) : favicon custom UNIQUEMENT quand custom domain. */
  faviconUrl: string | null;
};

/** Lookup owner branding for a public page.
 *
 *  When `hostname` is provided (normal case — the page knows its custom
 *  host via the x-tipote-custom-host header), the favicon is read from
 *  THAT specific custom_domains row, so users with multiple branded
 *  domains get one favicon per domain.
 *
 *  When `hostname` is omitted we fall back to the first verified domain
 *  for the (user, project) pair (legacy behaviour). */
export async function fetchOwnerBranding(
  userId: string,
  projectId: string | null | undefined,
  hostname?: string | null,
): Promise<OwnerBranding | null> {
  const host = hostname?.toLowerCase().trim() || null;

  // Custom domain lookup. With hostname, we resolve the exact row (and
  // can also infer project_id from it). Without hostname, fall back to
  // the first verified domain matching the requested (user, project).
  type CdRow = { hostname?: string | null; favicon_url?: string | null; project_id?: string | null };
  let cd: CdRow | null = null;
  if (host) {
    const { data } = await supabaseAdmin
      .from("custom_domains")
      .select("hostname, favicon_url, project_id")
      .eq("user_id", userId)
      .ilike("hostname", host)
      .eq("status", "verified")
      .maybeSingle();
    cd = (data ?? null) as CdRow | null;
  } else if (projectId) {
    const { data } = await supabaseAdmin
      .from("custom_domains")
      .select("hostname, favicon_url, project_id")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .eq("status", "verified")
      .order("verified_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    cd = (data ?? null) as CdRow | null;
  } else {
    const { data } = await supabaseAdmin
      .from("custom_domains")
      .select("hostname, favicon_url, project_id")
      .eq("user_id", userId)
      .eq("status", "verified")
      .order("verified_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    cd = (data ?? null) as CdRow | null;
  }

  const matchedHost = cd?.hostname?.toLowerCase().trim() || null;
  if (!matchedHost) return null;

  // siteName still lives on business_profiles (per project). Resolve it
  // using the project_id of the matched custom_domain.
  const resolvedProjectId = projectId ?? cd?.project_id ?? null;
  let siteName: string | null = null;
  if (resolvedProjectId) {
    const { data: bp } = await supabaseAdmin
      .from("business_profiles")
      .select("share_site_name")
      .eq("user_id", userId)
      .eq("project_id", resolvedProjectId)
      .maybeSingle();
    const p = bp as { share_site_name?: string | null } | null;
    const s = p?.share_site_name?.trim() ?? null;
    siteName = s && s.length > 0 ? s : null;
  }

  const favicon = cd?.favicon_url?.trim() ?? null;
  return {
    customHost: matchedHost,
    siteName,
    faviconUrl: favicon && favicon.length > 0 ? favicon : null,
  };
}
