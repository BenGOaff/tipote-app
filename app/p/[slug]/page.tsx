// app/p/[slug]/page.tsx
// Public hosted page (no auth required) — like /q/[quizId] for quizzes.
// Server component fetches metadata for SEO, then delegates to PublicPageClient
// which fetches page data via the dedicated /api/pages/public/[slug] endpoint.

import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import PublicPageClient from "@/components/pages/PublicPageClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildCanonicalUrl, fetchOwnerBranding } from "@/lib/publicUrl";

// Force dynamic rendering so published pages are always fresh.
export const dynamic = "force-dynamic";

const CUSTOM_HOST_HEADER = "x-tipote-custom-host";

// Custom-domain ownership: when a request arrives on a creator's
// branded hostname, the hosted_page resolved here must belong to the
// same (user, project) that owns the domain. No-op on the main host.
async function resolveCustomDomainScope(): Promise<{ userId: string; projectId: string } | null> {
  const h = await headers();
  const host = h.get(CUSTOM_HOST_HEADER);
  if (!host) return null;
  const { data } = await supabaseAdmin
    .from("custom_domains")
    .select("user_id, project_id")
    .ilike("hostname", host)
    .eq("status", "verified")
    .maybeSingle();
  const userId = (data as { user_id?: string } | null)?.user_id;
  const projectId = (data as { project_id?: string } | null)?.project_id;
  if (!userId || !projectId) return null;
  return { userId, projectId };
}

type RouteContext = { params: Promise<{ slug: string }> };

/** Create a fresh Supabase client for metadata fetch. */
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function generateMetadata({ params }: RouteContext): Promise<Metadata> {
  const { slug } = await params;

  try {
    const supabase = getSupabase();
    if (!supabase) return {};

    const { data } = await supabase
      .from("hosted_pages")
      .select("user_id, project_id, title, meta_title, meta_description, og_image_url")
      .eq("slug", slug)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return {};

    // Branding owner (helper partagé entre les 4 routes publiques).
    const ownerId = (data as { user_id?: string }).user_id;
    const ownerProjectId = (data as { project_id?: string | null }).project_id ?? null;
    const customHost = (await headers()).get(CUSTOM_HOST_HEADER);
    const branding = ownerId
      ? await fetchOwnerBranding(ownerId, ownerProjectId, customHost)
      : null;

    let canonical: string | null = null;
    if (branding) {
      canonical = `https://${branding.customHost}/${slug}`;
    }
    if (!canonical) canonical = await buildCanonicalUrl(`/p/${slug}`);

    const siteName = branding ? (branding.siteName || branding.customHost) : null;
    const baseTitle = data.meta_title || data.title;
    const titleOverride = siteName
      ? { absolute: `${baseTitle} · ${siteName}` }
      : baseTitle;

    const meta: Metadata = {
      title: titleOverride,
      description: data.meta_description || undefined,
      ...(siteName ? { applicationName: siteName } : {}),
      ...(canonical ? { alternates: { canonical } } : {}),
      ...(branding?.faviconUrl ? { icons: { icon: branding.faviconUrl, shortcut: branding.faviconUrl, apple: branding.faviconUrl } } : {}),
      openGraph: {
        title: baseTitle,
        description: data.meta_description || undefined,
        type: "website",
        ...(siteName ? { siteName } : {}),
        ...(canonical ? { url: canonical } : {}),
      },
    };

    if (data.og_image_url) {
      meta.openGraph!.images = [{ url: data.og_image_url, width: 1200, height: 630 }];
    }

    return meta;
  } catch {
    return {};
  }
}

// Render: pass slug to client component which fetches via /api/pages/public/[slug]
// This matches the quiz pattern: server does metadata, client does data fetching.
export default async function PublicPage({ params }: RouteContext) {
  const { slug } = await params;
  // Ownership gate on custom domains — see comment on the helper.
  const scope = await resolveCustomDomainScope();
  if (scope) {
    const { data } = await supabaseAdmin
      .from("hosted_pages")
      .select("user_id, project_id")
      .eq("slug", slug)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as { user_id?: string; project_id?: string | null } | null;
    if (!row || row.user_id !== scope.userId || row.project_id !== scope.projectId) {
      notFound();
    }
  }
  return <PublicPageClient page={null} slug={slug} />;
}
