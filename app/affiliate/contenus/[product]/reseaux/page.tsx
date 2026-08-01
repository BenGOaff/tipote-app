// app/affiliate/contenus/[product]/reseaux/page.tsx
//
// Rayon "Réseaux sociaux". Chaque post arrive avec son visuel : image
// unique à télécharger, ou carrousel qui défile sur place avec le PDF
// prêt à publier et le zip des images sous les slides.

import { notFound, redirect } from "next/navigation";
import { Share2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { signedPlaybackUrl } from "@/lib/popquiz/playback";
import { getDict, interpolate, normaliseLocale } from "../../../i18n";
import { ContentBreadcrumb } from "../../../components/ContentNav";
import { PostDayCard } from "../../../promouvoir/components/PostDayCard";
import { AtelierPostCard } from "../../../promouvoir/components/AtelierPostCard";
import { VisualGallery } from "../../../promouvoir/components/VisualGallery";
import {
  contentHref,
  isContentProduct,
  PRODUCT_NAME,
  productAffiliateLink,
} from "@/lib/affiliate/contentSpace";
import {
  resolveAffiliateMarket,
  AFFILIATE_LIVE_LOCALES,
} from "@/lib/affiliate/contentLocales";
import { ContentLocalePicker } from "../../../components/ContentLocalePicker";
import { ATELIER_POSTS_FR } from "../../../promouvoir/content/atelier-posts-fr";
import { ATELIER_POST_PLAN_5 } from "../../../promouvoir/content/atelier-plans-fr";
import {
  POSTS_FR,
  type PostDay,
  type SocialPost,
} from "../../../promouvoir/content/posts-fr";
import { VISUELS_FR } from "../../../promouvoir/content/visuels-fr";

export const dynamic = "force-dynamic";

export default async function ReseauxSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ product: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const { product } = await params;
  if (!isContentProduct(product)) notFound();

  const t = getDict(normaliseLocale(session.locale));
  const cs = t.content_space;
  const displayName = session.display_name ?? session.email.split("@")[0];
  const sp = await searchParams;
  const market =
    product === "atelier"
      ? "fr"
      : resolveAffiliateMarket(sp.locale, session.locale);
  const link = await productAffiliateLink(product, market, session.sa);

  const { data: ov } = await supabaseAdmin
    .from("affiliates")
    .select("promo_overrides")
    .eq("sa", session.sa)
    .maybeSingle();
  const overrides =
    (ov as { promo_overrides?: Record<string, string> } | null)
      ?.promo_overrides ?? {};

  // Visuels générés par l'affilié et accrochés à un post : on a persisté
  // les chemins de stockage, on re-signe une URL de lecture à l'affichage.
  const attachedFor = (postId: string): { path: string; url: string }[] => {
    const raw = overrides[`post:${postId}:visuals`];
    if (typeof raw !== "string") return [];
    try {
      const paths = JSON.parse(raw);
      if (!Array.isArray(paths)) return [];
      return paths
        .filter((p): p is string => typeof p === "string" && p.length > 0)
        .map((p) => {
          try {
            return { path: p, url: signedPlaybackUrl(p) };
          } catch {
            return null;
          }
        })
        .filter((v): v is { path: string; url: string } => v !== null);
    } catch {
      return [];
    }
  };

  let tiquizPosts: PostDay[] = [];
  if (product === "tiquiz") {
    const { data } = await supabaseAdmin
      .from("affiliate_contents")
      .select("id, title, meta")
      .eq("kind", "post")
      .eq("product", "tiquiz")
      .eq("locale", market)
      .eq("published", true)
      .order("sort_order", { ascending: true });
    const rows = (data ?? []).map((r) => {
      const row = r as {
        id: string;
        title: string | null;
        meta: Record<string, unknown> | null;
      };
      const m = row.meta ?? {};
      return {
        id: row.id,
        dayLabel: row.title ?? "",
        theme: String(m.theme ?? ""),
        hook: String(m.hook ?? ""),
        visualPath: String(m.visualPath ?? ""),
        posts: (Array.isArray(m.posts) ? m.posts : []) as SocialPost[],
      };
    });
    tiquizPosts = rows.length ? rows : market === "fr" ? POSTS_FR : [];
  }

  return (
    <main className="space-y-6">
      <ContentBreadcrumb
        trail={[
          { label: cs.page_title, href: "/contenus" },
          { label: PRODUCT_NAME[product], href: contentHref(product) },
          { label: cs.section_reseaux },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {cs.section_reseaux}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {interpolate(cs.reseaux_subtitle, {
              product: PRODUCT_NAME[product],
            })}
          </p>
        </div>
        {product === "tiquiz" && (
          <ContentLocalePicker
            current={market}
            label={t.promouvoir.market_label}
            locales={AFFILIATE_LIVE_LOCALES}
          />
        )}
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="space-y-2 pt-5 text-sm">
          <p className="font-medium">{t.promouvoir.posts_info_title}</p>
          <p className="leading-relaxed text-muted-foreground">
            {product === "atelier"
              ? cs.reseaux_atelier_help
              : t.promouvoir.posts_info_body}
          </p>
          {product === "atelier" && (
            <p className="border-t border-primary/20 pt-2 text-xs text-muted-foreground">
              {cs.plan_posts}{" "}
              {ATELIER_POST_PLAN_5.map((n) => `#${n}`).join(" · ")}
            </p>
          )}
        </CardContent>
      </Card>

      {product === "atelier" ? (
        <div className="space-y-3">
          {ATELIER_POSTS_FR.map((post) => (
            <AtelierPostCard
              key={post.id}
              post={post}
              affiliateLink={link}
              displayName={displayName}
              overrides={overrides}
              attachedVisuals={attachedFor(post.id)}
            />
          ))}
        </div>
      ) : tiquizPosts.length > 0 ? (
        <>
          <div className="space-y-3">
            {tiquizPosts.map((day) => (
              <PostDayCard
                key={day.id}
                day={day}
                affiliateLink={link}
                overrides={overrides}
                attachedVisuals={attachedFor(day.id)}
              />
            ))}
          </div>
          {market === "fr" && (
            <div className="space-y-3 border-t border-border pt-6">
              <div>
                <h2 className="text-lg font-semibold">
                  {t.promouvoir.visuels_info_title}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t.promouvoir.visuels_info_body}
                </p>
              </div>
              <VisualGallery
                singles={VISUELS_FR.singles}
                carrousel={VISUELS_FR.carrousel}
              />
            </div>
          )}
        </>
      ) : (
        <Card className="border-dashed">
          <CardContent className="space-y-2 pb-6 pt-6 text-center">
            <Share2 className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{cs.empty_posts}</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              {cs.empty_generate_hint}
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
