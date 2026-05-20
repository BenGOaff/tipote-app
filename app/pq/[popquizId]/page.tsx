// Public play page — no auth required. Loads a published popquiz
// via the service-role client (bypasses RLS), 404s otherwise.
// Accepts either a UUID or the custom slug, mirroring /q/[quizId].
//
// Side-effect: every render bumps `views_count` via the
// log_popquiz_event RPC. Fire-and-forget so the response time
// isn't tied to the analytics write; same overcounting story as
// the existing quiz views (bots count too) which we accept until
// a cookie-based dedup ships.

import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { fetchPublishedPopquiz } from "@/lib/popquiz/repo";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildCanonicalUrl, fetchOwnerBranding } from "@/lib/publicUrl";
import PopquizPlayClient from "./PopquizPlayClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ popquizId: string }> };

const CUSTOM_HOST_HEADER = "x-tipote-custom-host";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Custom-domain ownership: when served through a creator's branded
// hostname (middleware sets this header), the popquiz must belong to
// the same (user, project) as the domain. Mirrors the gate added to
// /q/[quizId] and the catch-all in app/[publicSlug] so the three
// entry points stay symmetric.
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

async function fetchPopquizScope(handle: string): Promise<{ userId: string; projectId: string | null } | null> {
  const col = UUID_RE.test(handle) ? "id" : "slug";
  const { data } = await supabaseAdmin
    .from("popquizzes")
    .select("user_id, project_id")
    .eq(col, handle)
    .eq("is_published", true)
    .maybeSingle();
  const row = data as { user_id?: string; project_id?: string | null } | null;
  if (!row?.user_id) return null;
  return { userId: row.user_id, projectId: row.project_id ?? null };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { popquizId } = await params;
  const popquiz = await fetchPublishedPopquiz(popquizId);
  if (!popquiz) return { title: "Popquiz" };

  // Branding owner (helper partagé entre les 4 routes publiques).
  const ownerScope = await fetchPopquizScope(popquizId);
  const popquizSlug = (popquiz as { slug?: string | null }).slug?.trim() ?? "";
  const customHost = (await headers()).get(CUSTOM_HOST_HEADER);
  const branding = ownerScope?.userId
    ? await fetchOwnerBranding(ownerScope.userId, ownerScope.projectId, customHost)
    : null;

  let canonical: string | null = null;
  if (branding && popquizSlug) {
    canonical = `https://${branding.customHost}/${popquizSlug}`;
  }
  if (!canonical) canonical = await buildCanonicalUrl(`/pq/${popquizId}`);

  const siteName = branding ? (branding.siteName || branding.customHost) : null;
  const titleOverride = siteName
    ? { absolute: `${popquiz.title} · ${siteName}` }
    : popquiz.title;

  return {
    title: titleOverride,
    description: popquiz.description ?? undefined,
    ...(siteName ? { applicationName: siteName } : {}),
    ...(canonical ? { alternates: { canonical } } : {}),
    ...(branding?.faviconUrl ? { icons: { icon: branding.faviconUrl, shortcut: branding.faviconUrl, apple: branding.faviconUrl } } : {}),
    openGraph: {
      title: popquiz.title,
      description: popquiz.description ?? undefined,
      ...(siteName ? { siteName } : {}),
      ...(canonical ? { url: canonical } : {}),
      ...(popquiz.video.thumbnailUrl
        ? { images: [{ url: popquiz.video.thumbnailUrl }] }
        : {}),
    },
  };
}

export default async function PublicPopquizPage({ params }: Props) {
  const { popquizId } = await params;
  const popquiz = await fetchPublishedPopquiz(popquizId);
  if (!popquiz) notFound();

  // Custom-domain ownership gate — no-op on the main host.
  const scope = await resolveCustomDomainScope();
  if (scope) {
    const owner = await fetchPopquizScope(popquizId);
    if (!owner || owner.userId !== scope.userId || owner.projectId !== scope.projectId) {
      notFound();
    }
  }

  // Fire-and-forget view bump. Awaiting would tie response time to
  // the analytics write for no good reason; the RPC is idempotent
  // at the row level so a missed call just costs us one undercounted
  // view, not data corruption.
  void supabaseAdmin.rpc("log_popquiz_event", {
    popquiz_id_input: popquiz.id,
    event_type_input: "view",
  });

  return <PopquizPlayClient popquiz={popquiz} />;
}
