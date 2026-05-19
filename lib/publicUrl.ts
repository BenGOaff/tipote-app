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
};

/** Lookup owner branding from the (user_id, project_id) of a quiz/popquiz/page owner. */
export async function fetchOwnerBranding(
  userId: string,
  projectId: string | null | undefined,
): Promise<OwnerBranding | null> {
  if (!projectId) {
    // Pas de project_id = ressource héritée legacy. On regarde s'il y a
    // un seul custom_domain vérifié pour le user et on l'utilise.
    const { data: cd } = await supabaseAdmin
      .from("custom_domains")
      .select("hostname, project_id")
      .eq("user_id", userId)
      .eq("status", "verified")
      .order("verified_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const host = (cd as { hostname?: string | null } | null)?.hostname?.toLowerCase().trim();
    if (!host) return null;
    return { customHost: host, siteName: null };
  }

  const [{ data: cd }, { data: bp }] = await Promise.all([
    supabaseAdmin
      .from("custom_domains")
      .select("hostname")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .eq("status", "verified")
      .order("verified_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("business_profiles")
      .select("share_site_name")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);
  const host = (cd as { hostname?: string | null } | null)?.hostname?.toLowerCase().trim();
  if (!host) return null;
  const siteName = (bp as { share_site_name?: string | null } | null)?.share_site_name?.trim() ?? null;
  return { customHost: host, siteName: siteName && siteName.length > 0 ? siteName : null };
}
