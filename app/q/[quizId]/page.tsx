// app/q/[quizId]/page.tsx
// Public quiz page (no auth required).
//
// Custom-domain ownership: when a request arrives on a creator's
// branded domain (middleware sets x-tipote-custom-host), the quiz
// resolved here MUST belong to the same (user, project) that owns
// the domain. Otherwise a creator could serve another creator's
// quiz under their own URL — silent impersonation / phishing.
// Header is only set on custom-domain requests, so the check is a
// no-op on the main host (existing behaviour preserved).
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import PublicQuizClient from "@/components/quiz/PublicQuizClient";
import QuizJsonLd from "@/components/quiz/QuizJsonLd";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripHtml } from "@/lib/richText";
import { buildCanonicalUrl, fetchOwnerBranding } from "@/lib/publicUrl";

const CUSTOM_HOST_HEADER = "x-tipote-custom-host";

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

// Force dynamic rendering so quiz metadata/status is always fresh.
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ quizId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: RouteContext): Promise<Metadata> {
  const { quizId: param } = await params;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return {};

    const supabase = createClient(supabaseUrl, supabaseKey);
    const base = supabase
      .from("quizzes")
      .select("user_id, project_id, slug, title, introduction, og_image_url, og_description")
      .eq("status", "active");
    const { data } = await (UUID_RE.test(param)
      ? base.eq("id", param).maybeSingle()
      : base.ilike("slug", param).maybeSingle());

    if (!data) return {};

    // Strip aussi la `og_description` (qui peut elle-même contenir des
    // entités `&nbsp;` ou des balises résiduelles) — pas que l'intro.
    // Cf. rapport Adeline (16 mai 2026) : iMessage affichait `&nbsp;`
    // littéral dans l'aperçu de partage.
    const ogDescPlain = stripHtml(data.og_description).trim();
    const introPlain = stripHtml(data.introduction).slice(0, 160);
    const description = (ogDescPlain || introPlain).trim() || undefined;
    // Title is rich-text in DB → strip pour la balise <title> et l'OG.
    const plainTitle = stripHtml(data.title);

    // Branding owner (custom domain vérifié + share_site_name).
    // Permet de virer toute trace de "Tipote" des meta sociales quand
    // l'user a son domain brandé. Helper partagé entre les 4 routes
    // publiques pour rester DRY.
    const ownerId = (data as { user_id?: string }).user_id;
    const ownerProjectId = (data as { project_id?: string | null }).project_id ?? null;
    const quizSlug = (data as { slug?: string | null }).slug?.trim() ?? "";
    const customHost = (await headers()).get(CUSTOM_HOST_HEADER);
    const branding = ownerId
      ? await fetchOwnerBranding(ownerId, ownerProjectId, customHost)
      : null;

    // Canonical = URL brandée si custom domain + slug, sinon request URL.
    let canonical: string | null = null;
    if (branding && quizSlug) {
      canonical = `https://${branding.customHost}/${quizSlug}`;
    }
    if (!canonical) canonical = await buildCanonicalUrl(`/q/${param}`);

    // site_name affiché par iMessage / WhatsApp / FB sous l'aperçu.
    // - main host : null → fallback "Tipote" via layout (historique)
    // - custom domain + share_site_name → ce nom
    // - custom domain sans share_site_name → hostname brandé
    const siteName = branding ? (branding.siteName || branding.customHost) : null;

    // Title : override `absolute` quand on a un siteName custom — shunte
    // le template global du layout. Sinon plainTitle nu, le template
    // ajoute le suffix par défaut.
    const titleOverride = siteName
      ? { absolute: `${plainTitle} · ${siteName}` }
      : plainTitle;

    const meta: Metadata = {
      title: titleOverride,
      description,
      ...(siteName ? { applicationName: siteName } : {}),
      ...(canonical ? { alternates: { canonical } } : {}),
      ...(branding?.faviconUrl ? { icons: { icon: branding.faviconUrl, shortcut: branding.faviconUrl, apple: branding.faviconUrl } } : {}),
      openGraph: {
        title: plainTitle,
        description,
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

export default async function PublicQuizPage({ params }: RouteContext) {
  const { quizId } = await params;
  // Custom-domain ownership gate: refuse to serve a quiz that
  // doesn't belong to the (user, project) that owns the hostname.
  // No-op on the main host where the header isn't set.
  const scope = await resolveCustomDomainScope();
  if (scope) {
    const base = supabaseAdmin
      .from("quizzes")
      .select("user_id, project_id")
      .eq("status", "active");
    const { data } = await (UUID_RE.test(quizId)
      ? base.eq("id", quizId).maybeSingle()
      : base.ilike("slug", quizId).maybeSingle());
    const row = data as { user_id?: string; project_id?: string | null } | null;
    if (!row || row.user_id !== scope.userId || row.project_id !== scope.projectId) {
      notFound();
    }
  }

  // JSON-LD pour SEO + indexation IA (Schema.org Quiz)
  const fullDataBase = supabaseAdmin
    .from("quizzes")
    .select("id, user_id, project_id, title, og_description, og_image_url, introduction, questions, created_at, updated_at, content_locale")
    .eq("status", "active");
  const { data: full } = await (UUID_RE.test(quizId)
    ? fullDataBase.eq("id", quizId).maybeSingle()
    : fullDataBase.ilike("slug", quizId).maybeSingle());
  const fullQuiz = full as
    | {
        id: string;
        user_id: string;
        project_id: string | null;
        title: string;
        og_description: string | null;
        og_image_url: string | null;
        introduction: string | null;
        questions: unknown[] | null;
        created_at: string;
        updated_at: string;
        content_locale: string | null;
      }
    | null;

  let authorName: string | null = null;
  let authorUrl: string | null = null;
  if (fullQuiz?.user_id && fullQuiz.project_id) {
    const { data: biz } = await supabaseAdmin
      .from("business_profiles")
      .select("share_site_name, brand_website_url")
      .eq("user_id", fullQuiz.user_id)
      .eq("project_id", fullQuiz.project_id)
      .maybeSingle();
    const b = biz as { share_site_name?: string | null; brand_website_url?: string | null } | null;
    authorName = b?.share_site_name ?? null;
    authorUrl = b?.brand_website_url ?? null;
  }

  const canonical = (await buildCanonicalUrl(`/q/${quizId}`)) ?? "";

  return (
    <>
      {fullQuiz && canonical && (
        <QuizJsonLd
          canonicalUrl={canonical}
          title={fullQuiz.title}
          description={fullQuiz.og_description || fullQuiz.introduction || null}
          imageUrl={fullQuiz.og_image_url || null}
          createdAt={fullQuiz.created_at}
          updatedAt={fullQuiz.updated_at}
          authorName={authorName}
          authorUrl={authorUrl}
          numberOfQuestions={Array.isArray(fullQuiz.questions) ? fullQuiz.questions.length : null}
          inLanguage={fullQuiz.content_locale}
        />
      )}
      <PublicQuizClient quizId={quizId} />
    </>
  );
}
