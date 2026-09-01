// app/s/[publicSlug]/page.tsx
//
// Sert le contenu public de Tipote à la RACINE du domaine perso d'une
// créatrice : `mybrand.com/<slug>` au lieu du plus long `/q/<slug>`,
// `/pq/<slug>` ou `/p/<slug>`. Les routes préfixées continuent de
// marcher (tout ce qui a déjà été partagé dans la nature) et restent les
// seules à répondre sur le host principal app.tipote.com, où cette page
// 404 volontairement.
//
// -- POURQUOI CE FICHIER VIT SOUS /s (retour Béné, 4 août 2026) --------
//
// Il était en `app/[publicSlug]/page.tsx`, donc en concurrence directe
// avec toutes nos routes statiques. Une route statique gagne toujours,
// donc un contenu nommé "quiz", "pages" ou "contents" n'aurait jamais pu
// s'afficher : d'où une longue liste de mots interdits à la créatrice,
// alors que "quiz" est le mot le plus naturel du monde pour nommer un
// quiz. Le middleware réécrit désormais le slug nu vers `/s/<slug>`, un
// chemin qui n'est pas une page de l'app : plus d'arbitrage, plus de
// mots interdits. L'adresse vue par le visiteur ne change pas.
//
// Routing decision:
//   1. Reserved word → notFound() (api, embed, robots.txt, _next, …)
//   2. No custom-domain context (x-tipote-custom-host absent) →
//      notFound() (we're on the main host or middleware is dormant).
//   3. Resolve hostname → (user_id, project_id) via custom_domains.
//   4. Lookup quizzes (active) → render quiz.
//   5. Else lookup popquizzes (published) → render popquiz.
//   6. Else lookup hosted_pages (published) → render hosted page.
//   7. Else notFound().
//
// Cross-type uniqueness is enforced at save time (lib/publicSlug +
// the slug branches of /api/quiz, /api/popquiz, /api/pages) so a
// single (user, project, slug) only resolves to one content type —
// no ambiguity here.
//
// Per-profile isolation: the lookup is filtered by BOTH user_id AND
// project_id, so a domain tied to project A only ever serves project
// A's content — never leaks content from another project of the same
// user.

import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchPublishedPopquiz } from "@/lib/popquiz/repo";
import PublicQuizClient from "@/components/quiz/PublicQuizClient";
import { TrackingPixels } from "@/components/tracking/TrackingPixels";
import { resolveEffectivePixels } from "@/lib/effectivePixels";
import PopquizPlayClient from "@/app/pq/[popquizId]/PopquizPlayClient";
import PublicPageClient from "@/components/pages/PublicPageClient";
import { isReservedPublicSlug } from "@/lib/publicSlug";
import { stripHtml } from "@/lib/richText";
import { toShareLine } from "@/lib/quiz/shareText";
import { interpolateText } from "@/lib/quizPersonalization";
import { buildCanonicalUrl, fetchOwnerBranding } from "@/lib/publicUrl";
import { echapperMotifLike } from "@/lib/db/motifLike";

export const dynamic = "force-dynamic";

// App Facebook de Bene (facultatif) : quand FACEBOOK_APP_ID est pose,
// on emet fb:app_id et le debogueur FB n'affiche plus d'avertissement.
const FB_APP_ID = (process.env.FACEBOOK_APP_ID ?? "").trim();

const CUSTOM_HOST_HEADER = "x-tipote-custom-host";

type Props = { params: Promise<{ publicSlug: string }>; searchParams?: Promise<{ rp?: string }> };

// "J'ai obtenu : <profil>" dans la langue du quiz (partage de resultat
// ?rp=<resultId>), parite avec /q/[quizId].
const OG_GOT: Record<string, (t: string) => string> = {
  fr: (t) => `J'ai obtenu : ${t}`,
  en: (t) => `I got: ${t}`,
  es: (t) => `He obtenido: ${t}`,
  de: (t) => `Mein Ergebnis: ${t}`,
  pt: (t) => `Meu resultado: ${t}`,
  it: (t) => `Ho ottenuto: ${t}`,
  ar: (t) => `حصلت على: ${t}`,
};

async function resolveCustomDomainScope(): Promise<{ userId: string; projectId: string } | null> {
  const h = await headers();
  const host = h.get(CUSTOM_HOST_HEADER);
  if (!host) return null;
  const { data } = await supabaseAdmin
    .from("custom_domains")
    .select("user_id, project_id")
    .ilike("hostname", echapperMotifLike(host))
    .eq("status", "verified")
    .maybeSingle();
  const userId = (data as { user_id?: string } | null)?.user_id;
  const projectId = (data as { project_id?: string } | null)?.project_id;
  if (!userId || !projectId) return null;
  return { userId, projectId };
}

type ResolvedPopquiz = NonNullable<Awaited<ReturnType<typeof fetchPublishedPopquiz>>>;
type Resolved =
  | { kind: "quiz"; meta: { id?: string | null; title?: string | null; introduction?: string | null; og_image_url?: string | null; og_description?: string | null; share_message?: string | null; locale?: string | null; meta_pixel_id?: string | null; ga4_measurement_id?: string | null; google_ads_conversion_id?: string | null } }
  | { kind: "popquiz"; popquiz: ResolvedPopquiz }
  | { kind: "page"; meta: { title?: string | null; meta_title?: string | null; meta_description?: string | null; og_image_url?: string | null; facebook_pixel_id?: string | null; google_tag_id?: string | null } }
  | null;

// Single resolver used by both generateMetadata and the page body so
// the DB isn't hit twice per request. Lookups are project-scoped.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolve(slug: string, userId: string, projectId: string): Promise<Resolved> {
  // 1) Quiz first — matches publicSlugServer's cross-type conflict
  //    precedence so the error messages and resolution agree.
  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("id, title, introduction, og_image_url, og_description, share_message, locale, meta_pixel_id, ga4_measurement_id, google_ads_conversion_id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .ilike("slug", echapperMotifLike(slug))
    .eq("status", "active")
    .maybeSingle();
  if (quiz) return { kind: "quiz", meta: quiz };

  // 2) Popquiz — owner-gate first (cheap), then fetch the full
  //    object only if it belongs to this (user, project) pair.
  //    fetchPublishedPopquiz does not expose user_id / project_id on
  //    the returned shape, hence the split.
  //    Le `slug` peut être l'ID (UUID) : un popquiz sans slug custom
  //    génère une URL live avec `popquiz.id` (handle = slug ?? id) →
  //    sur custom domain ça donne `/<uuid>`. On matche donc par id si
  //    c'est un UUID, sinon par slug (sinon 404 systématique).
  const pqGate = supabaseAdmin
    .from("popquizzes")
    .select("id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("is_published", true);
  const { data: pqRow } = await (
    UUID_RE.test(slug) ? pqGate.eq("id", slug) : pqGate.ilike("slug", echapperMotifLike(slug))
  ).maybeSingle();
  if (pqRow) {
    const popquiz = await fetchPublishedPopquiz(slug);
    if (popquiz) return { kind: "popquiz", popquiz };
  }

  // 3) Hosted page (link-in-bio, capture, sales…). status='published'
  //    matches the same gate as /api/pages/public/[slug].
  const { data: page } = await supabaseAdmin
    .from("hosted_pages")
    .select("title, meta_title, meta_description, og_image_url, facebook_pixel_id, google_tag_id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .ilike("slug", echapperMotifLike(slug))
    .eq("status", "published")
    .maybeSingle();
  if (page) return { kind: "page", meta: page };

  return null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { publicSlug } = await params;
  const sp = searchParams ? await searchParams : {};
  const rp = typeof sp?.rp === "string" && UUID_RE.test(sp.rp) ? sp.rp : null;
  if (isReservedPublicSlug(publicSlug)) return {};
  const scope = await resolveCustomDomainScope();
  if (!scope) return {};
  const r = await resolve(publicSlug, scope.userId, scope.projectId);
  if (!r) return {};

  // og:url + canonical = current request URL on the creator's custom
  // domain (la route ne s'active QUE sur un custom domain — sinon scope
  // est null et on a return {} plus haut).
  const canonical = await buildCanonicalUrl(`/${publicSlug}`);

  // Branding (custom domain + share_site_name) — toujours résoluble ici
  // puisque scope existe, sauf race condition (domain dé-vérifié).
  const customHost = (await headers()).get(CUSTOM_HOST_HEADER);
  const branding = await fetchOwnerBranding(scope.userId, scope.projectId, customHost);
  const siteName = branding ? (branding.siteName || branding.customHost) : null;

  if (r.kind === "quiz") {
    const ogDescPlain = stripHtml(r.meta.og_description ?? "").trim();
    // FB/LinkedIn n'affichent que l'apercu du lien : le message de partage
    // sert de description par defaut (retour Jocelyne 28 juillet 2026),
    // parite avec /q/[quizId].
    const shareMsgPlain = toShareLine((r.meta as { share_message?: string | null }).share_message);
    const introPlain = stripHtml(r.meta.introduction ?? "").slice(0, 160);
    const description = (ogDescPlain || shareMsgPlain || introPlain).trim() || undefined;
    const plainTitle = stripHtml(r.meta.title ?? "");

    // Partage du PROFIL obtenu (?rp=) : og:title "J'ai obtenu : <profil>"
    // + visuel du profil (image du createur sinon carte generee), parite
    // avec /q/[quizId]. Retour Jocelyne 28 juillet 2026.
    let resultShare: { ogTitle: string; imageUrl: string } | null = null;
    const quizRowId = String((r.meta as { id?: string | null }).id ?? "");
    if (rp && quizRowId) {
      const { data: rrow } = await supabaseAdmin
        .from("quiz_results")
        .select("quiz_id, title, image_url")
        .eq("id", rp)
        .maybeSingle();
      if (rrow && rrow.quiz_id === quizRowId) {
        const cleanTitle = stripHtml(interpolateText(rrow.title as string, { name: "", gender: "x" }))
          .replace(/\s+/g, " ")
          .replace(/^[\s,;:.!?-]+/, "")
          .trim();
        if (cleanTitle) {
          const loc = String((r.meta as { locale?: string | null }).locale ?? "fr").split("-")[0];
          const got = (OG_GOT[loc] ?? OG_GOT.fr)(cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1));
          const generated =
            (await buildCanonicalUrl(`/api/quiz/${quizRowId}/result-og?rp=${rp}`)) ??
            `https://app.tipote.com/api/quiz/${quizRowId}/result-og?rp=${rp}`;
          const resultImage = String((rrow as { image_url?: string | null }).image_url ?? "").trim();
          resultShare = { ogTitle: got, imageUrl: resultImage || generated };
        }
      }
    }
    const ogUrl = canonical ? (resultShare && rp ? `${canonical}?rp=${rp}` : canonical) : null;
    const ogTitle = resultShare?.ogTitle ?? (plainTitle || undefined);
    const baseTitle = plainTitle || "Quiz";
    const titleOverride = siteName
      ? { absolute: `${baseTitle} · ${siteName}` }
      : (plainTitle || undefined);
    const meta: Metadata = {
      title: titleOverride,
      description,
      ...(FB_APP_ID ? { facebook: { appId: FB_APP_ID } } : {}),
      ...(siteName ? { applicationName: siteName } : {}),
      ...(canonical ? { alternates: { canonical } } : {}),
      ...(branding?.faviconUrl
        ? {
            icons: {
              // sizes="any" défensif Firefox. Cf. Tiquiz CLAUDE_PITFALLS.md O.
              icon: [{ url: branding.faviconUrl, sizes: "any" }],
              shortcut: branding.faviconUrl,
              apple: branding.faviconUrl,
            },
          }
        : {}),
      ...(resultShare
        ? { robots: { index: false, follow: false, googleBot: { index: false, follow: false } } }
        : {}),
      openGraph: {
        title: ogTitle,
        description,
        type: "website",
        ...(siteName ? { siteName } : {}),
        ...(ogUrl ? { url: ogUrl } : {}),
      },
    };
    // og:image TOUJOURS explicite (parite /q/[quizId]).
    const defaultOgImage = quizRowId
      ? (await buildCanonicalUrl(`/api/quiz/${quizRowId}/result-og`)) ??
        `https://app.tipote.com/api/quiz/${quizRowId}/result-og`
      : null;
    const ogImage = resultShare?.imageUrl ?? (String(r.meta.og_image_url ?? "").trim() || defaultOgImage);
    if (ogImage) {
      meta.openGraph!.images = [{ url: ogImage, width: 1200, height: 630 }];
    }
    return meta;
  }

  if (r.kind === "popquiz") {
    const p = r.popquiz;
    const titleOverride = siteName
      ? { absolute: `${p.title} · ${siteName}` }
      : p.title;
    return {
      title: titleOverride,
      description: p.description ?? undefined,
      ...(siteName ? { applicationName: siteName } : {}),
      ...(canonical ? { alternates: { canonical } } : {}),
      ...(branding?.faviconUrl
        ? {
            icons: {
              // sizes="any" défensif Firefox. Cf. Tiquiz CLAUDE_PITFALLS.md O.
              icon: [{ url: branding.faviconUrl, sizes: "any" }],
              shortcut: branding.faviconUrl,
              apple: branding.faviconUrl,
            },
          }
        : {}),
      openGraph: {
        title: p.title,
        description: p.description ?? undefined,
        ...(siteName ? { siteName } : {}),
        ...(canonical ? { url: canonical } : {}),
        ...(p.video.thumbnailUrl ? { images: [{ url: p.video.thumbnailUrl }] } : {}),
      },
    };
  }

  // hosted page
  const baseTitle = r.meta.meta_title || r.meta.title || "Page";
  const titleOverride = siteName
    ? { absolute: `${baseTitle} · ${siteName}` }
    : (r.meta.meta_title || r.meta.title || undefined);
  const meta: Metadata = {
    title: titleOverride,
    description: r.meta.meta_description || undefined,
    ...(siteName ? { applicationName: siteName } : {}),
    ...(canonical ? { alternates: { canonical } } : {}),
    ...(branding?.faviconUrl
      ? {
          icons: {
            // sizes="any" défensif Firefox. Cf. Tiquiz CLAUDE_PITFALLS.md O.
            icon: [{ url: branding.faviconUrl, sizes: "any" }],
            shortcut: branding.faviconUrl,
            apple: branding.faviconUrl,
          },
        }
      : {}),
    openGraph: {
      title: r.meta.meta_title || r.meta.title || undefined,
      description: r.meta.meta_description || undefined,
      type: "website",
      ...(siteName ? { siteName } : {}),
      ...(canonical ? { url: canonical } : {}),
    },
  };
  if (r.meta.og_image_url) {
    meta.openGraph!.images = [{ url: r.meta.og_image_url, width: 1200, height: 630 }];
  }
  return meta;
}

export default async function PublicCatchAll({ params }: Props) {
  const { publicSlug } = await params;
  if (isReservedPublicSlug(publicSlug)) notFound();

  const scope = await resolveCustomDomainScope();
  if (!scope) notFound();

  const r = await resolve(publicSlug, scope.userId, scope.projectId);
  if (!r) notFound();

  if (r.kind === "quiz") {
    const pixels = await resolveEffectivePixels(r.meta, scope.userId, scope.projectId);
    return (
      <>
        <TrackingPixels
          metaPixelId={pixels.metaPixelId}
          ga4MeasurementId={pixels.ga4MeasurementId}
          googleAdsConversionId={pixels.googleAdsConversionId}
        />
        <PublicQuizClient quizId={publicSlug} />
      </>
    );
  }

  if (r.kind === "popquiz") {
    // Fire-and-forget view bump — mirrors /pq/[popquizId] so analytics
    // stay consistent whether the URL was the prefixed legacy shape
    // or the new clean one served from this catch-all.
    void supabaseAdmin.rpc("log_popquiz_event", {
      popquiz_id_input: r.popquiz.id,
      event_type_input: "view",
    });
    // Popquiz hérite du pixel par défaut du créateur (scope = owner
    // du custom domain).
    const pqPixels = await resolveEffectivePixels({}, scope.userId, scope.projectId);
    return (
      <>
        <TrackingPixels
          metaPixelId={pqPixels.metaPixelId}
          ga4MeasurementId={pqPixels.ga4MeasurementId}
          googleAdsConversionId={pqPixels.googleAdsConversionId}
        />
        <PopquizPlayClient popquiz={r.popquiz} />
      </>
    );
  }

  // hosted_page : pixel par page, sinon fallback défaut business_profile.
  let pageMeta = r.meta.facebook_pixel_id?.trim() || null;
  let pageGa4 = r.meta.google_tag_id?.trim() || null;
  if (!pageMeta && !pageGa4) {
    const fallback = await resolveEffectivePixels({}, scope.userId, scope.projectId);
    pageMeta = fallback.metaPixelId;
    pageGa4 = fallback.ga4MeasurementId;
  }
  return (
    <>
      {(pageMeta || pageGa4) && (
        <TrackingPixels metaPixelId={pageMeta} ga4MeasurementId={pageGa4} />
      )}
      <PublicPageClient page={null} slug={publicSlug} />
    </>
  );
}
